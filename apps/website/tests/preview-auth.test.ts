import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as authCore from "../src/server/auth/core";
import { getViewer, requireEditor, requireMember } from "../src/server/auth/viewer";
import { parseAuthEnvironment } from "../src/server/auth/policy";
import * as database from "../src/server/db";
import { PreviewReadOnlyError, isPreviewMode } from "../src/server/website-mode";
import { GET as authGet, POST as authPost } from "../src/app/api/auth/[...all]/route";
import { GET as readiness } from "../src/app/health/ready/route";
import { proxy } from "../src/proxy";

const mocks = vi.hoisted(() => {
  const auth = {
    handler: vi.fn(),
    api: { getSession: vi.fn(), getAccessToken: vi.fn() },
  };
  return {
    auth,
    betterAuth: vi.fn(() => auth),
    adapter: vi.fn(() => ({})),
    headers: vi.fn(),
    fetch: vi.fn(),
    pool: vi.fn(function Pool() { throw new Error("Unexpected database pool construction."); }),
  };
});

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("@better-auth/drizzle-adapter", () => ({ drizzleAdapter: mocks.adapter }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("pg", () => ({ Pool: mocks.pool }));

// Deliberately valid configuration proves preview remains closed even if a deployment
// accidentally receives credentials. These are synthetic test values, never real secrets.
const configuredEnvironment = {
  WEBSITE_MODE: "preview",
  BETTER_AUTH_URL: "https://guild.test",
  BETTER_AUTH_SECRET: "test-only-7a31d84f-259c-406e-9bc5-02e719f4",
  DISCORD_CLIENT_ID: "111111111111111111",
  DISCORD_CLIENT_SECRET: "test-only-client-a31d84f259c406e9bc5",
  DISCORD_GUILD_ID: "222222222222222222",
  DISCORD_EDITOR_ROLE_IDS: "333333333333333333",
  DISCORD_OWNER_IDS: "444444444444444444",
  DATABASE_URL: "postgresql://test_user:test_password@127.0.0.1:1/preview_boundary_test",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries(configuredEnvironment)) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(database, "getDb");
  vi.spyOn(database, "isDatabaseConfigured");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("preview authentication isolation", () => {
  it("reads the mode at runtime and disables otherwise valid authentication", () => {
    expect(parseAuthEnvironment(process.env)).not.toBeNull();
    expect(isPreviewMode()).toBe(true);
    expect(authCore.isAuthConfigured()).toBe(false);
    expect(authCore.getAuth()).toBeNull();
    expect(mocks.betterAuth).not.toHaveBeenCalled();
    expect(mocks.adapter).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
    expect(mocks.pool).not.toHaveBeenCalled();

    vi.stubEnv("WEBSITE_MODE", undefined);
    expect(isPreviewMode()).toBe(false);
    expect(authCore.isAuthConfigured()).toBe(true);
  });

  it("does not expose an auth instance previously constructed in full mode", () => {
    vi.stubEnv("WEBSITE_MODE", undefined);
    vi.mocked(database.getDb).mockReturnValue({} as ReturnType<typeof database.getDb>);
    expect(authCore.getAuth()).toBe(mocks.auth);
    expect(mocks.betterAuth).toHaveBeenCalledOnce();
    vi.stubEnv("WEBSITE_MODE", "preview");
    expect(authCore.getAuth()).toBeNull();
    expect(authCore.isAuthConfigured()).toBe(false);
    expect(mocks.betterAuth).toHaveBeenCalledOnce();
  });

  it("returns no viewer before resolving auth, sessions, headers, tokens, or Discord", async () => {
    const resolveAuth = vi.spyOn(authCore, "getAuth").mockReturnValue(
      mocks.auth as unknown as NonNullable<ReturnType<typeof authCore.getAuth>>,
    );
    expect(await getViewer()).toBeNull();
    expect(resolveAuth).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.auth.api.getSession).not.toHaveBeenCalled();
    expect(mocks.auth.api.getAccessToken).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([requireMember, requireEditor])("rejects a privileged guard before identity or storage access", async (guard) => {
    await expect(guard()).rejects.toBeInstanceOf(PreviewReadOnlyError);
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.auth.api.getSession).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses direct database access even with a valid database URL", () => {
    expect(() => database.getDb()).toThrow(PreviewReadOnlyError);
    expect(mocks.pool).not.toHaveBeenCalled();
  });
});

describe("preview HTTP boundaries", () => {
  it.each([
    ["GET", "/api/auth/callback/discord"],
    ["GET", "/api/auth/error"],
    ["POST", "/api/auth/sign-in/social"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/get-access-token"],
  ])("denies %s %s before resolving auth", async (method, path) => {
    const resolveAuth = vi.spyOn(authCore, "getAuth");
    const request = new Request(`https://guild.test${path}`, {
      method, headers: { Cookie: "better-auth.session_token=synthetic-existing-session" },
    });
    const response = await (method === "POST" ? authPost : authGet)(request);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(resolveAuth).not.toHaveBeenCalled();
    expect(mocks.auth.handler).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
  });

  it.each([undefined, configuredEnvironment.DATABASE_URL])("is ready without consulting database configuration or storage: %s", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", mode: "preview" });
    expect(database.isDatabaseConfigured).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
    expect(mocks.pool).not.toHaveBeenCalled();
  });

  it("preserves full-mode readiness failure when the database is missing", async () => {
    vi.stubEnv("WEBSITE_MODE", undefined);
    vi.stubEnv("DATABASE_URL", undefined);
    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

describe("preview proxy", () => {
  it.each(["/login", "/login/", "/admin", "/admin/events/a/edit", "/api/auth", "/api/auth/callback/discord"])("hides private route %s", (path) => {
    const response = proxy(new NextRequest(`https://guild.test${path}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("blocks %s to public pages, including direct Server Actions", (method) => {
    const response = proxy(new NextRequest("https://guild.test/events", {
      method, headers: { "Next-Action": "synthetic-action-id" },
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it.each(["GET", "HEAD"])("allows public %s requests through", (method) => {
    const response = proxy(new NextRequest("https://guild.test/events", { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([["GET", "/login"], ["GET", "/admin/events"], ["POST", "/events"]])("leaves %s %s unchanged when preview is not enabled", (method, path) => {
    vi.stubEnv("WEBSITE_MODE", undefined);
    const response = proxy(new NextRequest(`https://guild.test${path}`, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
