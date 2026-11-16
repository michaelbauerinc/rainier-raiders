import assert from "node:assert/strict";
import test from "node:test";
import { createAuthHttpHandler } from "./http.ts";

const origin = "http://127.0.0.1:3000";

test("unconfigured server auth returns 503 without granting a session", async () => {
  const handle = createAuthHttpHandler(() => null);
  for (const [path, method] of [["/callback/discord", "GET"], ["/sign-in/social", "POST"]]) {
    const response = await handle(new Request(`${origin}/api/auth${path}`, { method }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("browser token and account endpoints are unavailable before auth is initialized", async () => {
  const handle = createAuthHttpHandler(() => { throw new Error("must not initialize"); });
  for (const path of ["get-access-token", "refresh-token", "account-info", "get-session", "update-user", "link-social", "sign-up/email"]) {
    for (const method of ["GET", "POST"]) {
      const response = await handle(new Request(`${origin}/api/auth/${path}`, { method }));
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
});

test("OAuth request cannot inject extra scopes, provider tokens, or redirect destinations", async () => {
  let captured;
  const handle = createAuthHttpHandler(() => ({ handler: async (request) => {
    captured = await request.json();
    return Response.json({ url: "https://discord.com/oauth2/authorize" });
  } }));
  const response = await handle(new Request(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "discord", callbackURL: "https://other.test", scopes: ["bot"], idToken: { token: "untrusted" } }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(captured, { provider: "discord", callbackURL: "/", errorCallbackURL: "/login?error=oauth" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("unknown providers and malformed JSON never reach the authentication library", async () => {
  const handle = createAuthHttpHandler(() => ({ handler: async () => { throw new Error("must not call"); } }));
  for (const body of ["{", JSON.stringify({ provider: "github" }), JSON.stringify(null)]) {
    const response = await handle(new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
    assert.equal(response.status, 400);
  }
});

test("callback cookies survive and internal failures return a safe message", async () => {
  const handle = createAuthHttpHandler(() => ({ handler: async () => new Response(null, {
    status: 302, headers: { location: "/", "set-cookie": "session=test; HttpOnly; SameSite=Lax" },
  }) }));
  const response = await handle(new Request(`${origin}/api/auth/callback/discord?code=opaque&state=opaque`));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("set-cookie"), "session=test; HttpOnly; SameSite=Lax");
  const failed = createAuthHttpHandler(() => { throw new Error("credential=must-not-leak"); });
  const unavailable = await failed(new Request(`${origin}/api/auth/sign-out`, { method: "POST" }));
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes("must-not-leak"), false);
});
