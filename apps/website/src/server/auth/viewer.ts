import "server-only";

import { assertFullWebsite, isPreviewMode } from "@/server/website-mode";
import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { account, user } from "@/server/db/auth-schema";
import { getAuth } from "./core";
import { AuthError, memberCapabilities, parseAuthEnvironment, parseDiscordMembership } from "./policy";

export type Viewer = {
  user: { id: string; name: string; image: string | null };
  discordId: string;
  isMember: boolean;
  canPublish: boolean;
};

async function loadViewer(strict: boolean): Promise<Viewer | null> {
  if (isPreviewMode()) return null;
  try {
    const auth = getAuth();
    const config = parseAuthEnvironment(process.env);
    if (!auth || !config) return null;
    const session = await auth.api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!session) return null;

    const [identity] = await getDb().select({
      id: user.id,
      name: user.name,
      image: user.image,
      blocked: user.blocked,
      accountId: account.id,
      discordId: account.accountId,
    }).from(user).innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "discord")))
      .where(eq(user.id, session.user.id)).limit(1);
    if (!identity) return null;

    const viewer: Viewer = {
      user: { id: identity.id, name: identity.name, image: identity.image },
      discordId: identity.discordId,
      isMember: false,
      canPublish: false,
    };
    if (identity.blocked) return viewer;

    try {
      // This trusted server API refreshes encrypted provider tokens when needed.
      // No request headers are forwarded: userId comes from the verified DB session above.
      const token = await auth.api.getAccessToken({
        body: { accountId: identity.accountId, userId: identity.id },
      });
      const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${config.guildId}/member`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 404) return viewer;
      if (!response.ok) throw new AuthError("Guild access could not be verified. Please try again.");
      const membership = parseDiscordMembership(await response.json());
      if (!membership) throw new AuthError("Guild access could not be verified. Please try again.");
      return { ...viewer, ...memberCapabilities(identity.discordId, membership, config) };
    } catch {
      if (strict) throw new AuthError("Guild access could not be verified. Please try again.");
      return viewer;
    }
  } catch (error) {
    if (strict) throw error instanceof AuthError ? error : new AuthError("Guild access could not be verified. Please try again.");
    return null;
  }
}

// React cache deduplicates within one server request; no membership state persists between requests.
export const getViewer = cache((): Promise<Viewer | null> => loadViewer(false));

/** Every mutation gets a fresh database session and live guild membership check. */
export async function requireMember(): Promise<Viewer> {
  assertFullWebsite();
  const viewer = await loadViewer(true);
  if (!viewer) throw new AuthError("Sign in with Discord to continue.");
  if (!viewer.isMember) throw new AuthError("Verified guild membership is required.");
  return viewer;
}

export async function requireEditor(): Promise<Viewer> {
  assertFullWebsite();
  const viewer = await requireMember();
  if (!viewer.canPublish) throw new AuthError("A guild editor role is required.");
  return viewer;
}
