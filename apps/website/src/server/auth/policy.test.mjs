import assert from "node:assert/strict";
import test from "node:test";
import { memberCapabilities, parseAuthEnvironment, parseDiscordMembership } from "./policy.ts";

const ownerId = "111111111111111111";
const editorRole = "222222222222222222";
const config = { ownerIds: [ownerId], editorRoleIds: [editorRole] };
const env = {
  DATABASE_URL: "postgresql://guild:password@localhost:5432/guild",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: "a-completely-random-test-secret-1234567890",
  DISCORD_CLIENT_ID: "333333333333333333",
  DISCORD_CLIENT_SECRET: "a-discord-client-secret-for-tests",
  DISCORD_GUILD_ID: "444444444444444444",
  DISCORD_OWNER_IDS: ownerId,
  DISCORD_EDITOR_ROLE_IDS: editorRole,
};

test("missing and placeholder OAuth configuration fails closed", () => {
  assert.equal(parseAuthEnvironment({}), null);
  for (const key of ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID"]) {
    assert.equal(parseAuthEnvironment({ ...env, [key]: "" }), null, key);
  }
  assert.equal(parseAuthEnvironment({ ...env, DISCORD_CLIENT_SECRET: "replace-me-with-discord-secret" }), null);
  assert.equal(parseAuthEnvironment({ ...env, BETTER_AUTH_SECRET: "x".repeat(40) }), null);
});

test("only a fixed HTTPS or local development origin is accepted", () => {
  assert.ok(parseAuthEnvironment(env));
  assert.ok(parseAuthEnvironment({ ...env, BETTER_AUTH_URL: "https://guild.test" }));
  for (const origin of ["http://guild.test", "https://guild.test/redirect", "https://user:pass@guild.test", "https://guild.test?redirect=https://other.test"]) {
    assert.equal(parseAuthEnvironment({ ...env, BETTER_AUTH_URL: origin }), null);
  }
  assert.equal(parseAuthEnvironment({ ...env, DISCORD_EDITOR_ROLE_IDS: "administrator" }), null);
  assert.equal(parseAuthEnvironment({ ...env, DATABASE_URL: "postgresql://localhost" }), null);
});

test("unknown membership denies even configured owners", () => {
  assert.deepEqual(memberCapabilities(ownerId, null, config), { isMember: false, canPublish: false });
  assert.deepEqual(memberCapabilities(ownerId, { roles: [editorRole], pending: true }, config), { isMember: false, canPublish: false });
  assert.deepEqual(memberCapabilities(ownerId, { roles: [editorRole], pending: false }, config, true), { isMember: false, canPublish: false });
});

test("members need a configured role or owner ID to publish", () => {
  assert.deepEqual(memberCapabilities("555555555555555555", { roles: [], pending: false }, config), { isMember: true, canPublish: false });
  assert.equal(memberCapabilities("555555555555555555", { roles: [editorRole], pending: false }, config).canPublish, true);
  assert.equal(memberCapabilities(ownerId, { roles: [], pending: false }, config).canPublish, true);
  assert.equal(memberCapabilities(ownerId, { roles: [], pending: false }, { ownerIds: [], editorRoleIds: [] }).canPublish, false);
});

test("malformed membership data cannot grant access", () => {
  for (const value of [null, {}, { roles: "admin" }, { roles: [123] }, { roles: [editorRole], pending: "false" }]) {
    assert.equal(parseDiscordMembership(value), null);
  }
  assert.deepEqual(parseDiscordMembership({ roles: [editorRole], pending: false }), { roles: [editorRole], pending: false });
});
