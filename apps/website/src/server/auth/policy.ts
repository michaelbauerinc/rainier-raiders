export type AuthEnvironment = Record<string, string | undefined>;

export type AuthConfig = {
  origin: string;
  secret: string;
  clientId: string;
  clientSecret: string;
  guildId: string;
  editorRoleIds: string[];
  ownerIds: string[];
};

export type DiscordMembership = {
  roles: string[];
  pending: boolean;
};

const snowflake = /^\d{17,20}$/;
const placeholder = /(?:change[-_ ]?me|replace[-_ ]?me|placeholder|your[-_ ]|example|todo|unset)/i;

function parseIds(value: string | undefined): string[] | null {
  if (!value?.trim()) return [];
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.every((id) => snowflake.test(id)) ? [...new Set(ids)] : null;
}

/** Validate configuration without making network calls or revealing any input values. */
export function parseAuthEnvironment(env: AuthEnvironment): AuthConfig | null {
  const originValue = env.BETTER_AUTH_URL?.trim();
  const secret = env.BETTER_AUTH_SECRET?.trim();
  const clientId = env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim();
  const editorRoleIds = parseIds(env.DISCORD_EDITOR_ROLE_IDS);
  const ownerIds = parseIds(env.DISCORD_OWNER_IDS);
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!originValue || !secret || !clientId || !clientSecret || !guildId || !databaseUrl) return null;
  if (secret.length < 32 || new Set(secret).size < 8 || clientSecret.length < 16) return null;
  if ([secret, clientSecret, databaseUrl].some((value) => placeholder.test(value))) return null;
  if (!snowflake.test(clientId) || !snowflake.test(guildId) || !editorRoleIds || !ownerIds) return null;

  try {
    const url = new URL(originValue);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const database = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length <= 1) return null;
    return { origin: url.origin, secret, clientId, clientSecret, guildId, editorRoleIds, ownerIds };
  } catch {
    return null;
  }
}

/** Untrusted Discord JSON becomes a membership only after structural validation. */
export function parseDiscordMembership(value: unknown): DiscordMembership | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Record<string, unknown>;
  if (!Array.isArray(member.roles) || !member.roles.every((role) => typeof role === "string" && snowflake.test(role))) return null;
  if (member.pending !== undefined && typeof member.pending !== "boolean") return null;
  return { roles: member.roles, pending: member.pending === true };
}

/** Owner IDs never bypass membership, screening, or a local block. */
export function memberCapabilities(
  discordId: string,
  membership: DiscordMembership | null,
  config: Pick<AuthConfig, "editorRoleIds" | "ownerIds">,
  blocked = false,
): { isMember: boolean; canPublish: boolean } {
  const isMember = !blocked && membership !== null && !membership.pending;
  return {
    isMember,
    canPublish: isMember && (
      config.ownerIds.includes(discordId) ||
      membership.roles.some((role) => config.editorRoleIds.includes(role))
    ),
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
