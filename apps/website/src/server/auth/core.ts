import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { isPreviewMode } from "@/server/website-mode";
import { getDb } from "@/server/db";
import * as authSchema from "@/server/db/auth-schema";
import { parseAuthEnvironment, type AuthConfig } from "./policy";

export function isAuthConfigured(): boolean {
  return !isPreviewMode() && parseAuthEnvironment(process.env) !== null;
}

function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: "Rainier Raiders",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.origin],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: authSchema,
      transaction: true,
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      discord: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        disableDefaultScope: true,
        scope: ["identify", "guilds.members.read"],
        prompt: "consent",
        mapProfileToUser: (profile) => ({
          email: `${profile.id}@discord.placeholder.invalid`,
          emailVerified: false,
        }),
      },
    },
    user: {
      additionalFields: {
        blocked: { type: "boolean", defaultValue: false, input: false, returned: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: false, disableImplicitLinking: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/social": { window: 60, max: 10 } },
    },
    advanced: { useSecureCookies: config.origin.startsWith("https:") },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [user] = await getDb().select({ blocked: authSchema.user.blocked })
              .from(authSchema.user).where(eq(authSchema.user.id, session.userId)).limit(1);
            return Boolean(user && !user.blocked);
          },
        },
      },
    },
    // disabledPaths affects HTTP routing, not trusted server auth.api calls.
    // The route handler additionally allowlists only the UI's required endpoints.
    disabledPaths: ["/get-access-token", "/refresh-token", "/account-info", "/link-social", "/unlink-account"],
    onAPIError: { errorURL: `${config.origin}/login` },
    logger: {
      level: "warn",
      log: (level) => { console.warn(`[auth] ${level}: authentication operation failed`); },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Importing this module never connects to Postgres or enables incomplete OAuth setup. */
export function getAuth(): ReturnType<typeof createAuth> | null {
  if (isPreviewMode()) return null;
  const config = parseAuthEnvironment(process.env);
  if (!config) return null;
  instance ??= createAuth(config);
  return instance;
}
