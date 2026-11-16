import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnouncementInput, EventInput } from "../src/features/content/schemas";
import type { Viewer } from "../src/server/auth";
import { closeDb, getDb } from "../src/server/db";
import { announcements, auditLog, eventRsvps, events } from "../src/server/db/app-schema";
import { user } from "../src/server/db/auth-schema";
import {
  archiveAnnouncement, cancelEvent, createAnnouncement, createEvent,
  getAnnouncement, getEvent, listAnnouncements, listEvents,
  setRsvp, updateAnnouncement, updateEvent,
} from "../src/server/services/content";
import { eventInstants, localDateTimeToInstant } from "../src/server/services/event-time";

const guards = vi.hoisted(() => ({ requireEditor: vi.fn(), requireMember: vi.fn() }));
vi.mock("@/server/auth", () => guards);

function viewer(id: string, canPublish = false): Viewer {
  return {
    user: { id, name: id, image: null }, discordId: `${id}-discord`,
    isMember: true, canPublish,
  };
}

const editor = viewer("test-editor", true);
const member = viewer("test-member");
const otherMember = viewer("test-other-member");
const outsider: Viewer = { ...viewer("test-outsider"), isMember: false };
const announcementInput: AnnouncementInput = {
  title: "Raid notes", body: "Bring food and flasks.", visibility: "public", status: "published",
};
const eventInput: EventInput = {
  title: "Raid night", description: "Meet at the entrance.",
  startsAtLocal: "2099-06-16T19:00", endsAtLocal: "2099-06-16T22:00",
  timeZone: "America/Los_Angeles", capacity: 20, visibility: "public", status: "published",
};

describe("event time validation", () => {
  it("preserves the requested instant in ordinary and fractional-offset zones", () => {
    expect(localDateTimeToInstant("2027-07-01T19:00", "America/Los_Angeles", "Start").toISOString())
      .toBe("2027-07-02T02:00:00.000Z");
    expect(localDateTimeToInstant("2027-07-01T19:00", "Asia/Kathmandu", "Start").toISOString())
      .toBe("2027-07-01T13:15:00.000Z");
  });

  it("rejects nonexistent and ambiguous daylight saving local times", () => {
    expect(() => localDateTimeToInstant("2027-03-14T02:30", "America/Los_Angeles", "Start"))
      .toThrow(/does not exist/);
    expect(() => localDateTimeToInstant("2027-11-07T01:30", "America/Los_Angeles", "Start"))
      .toThrow(/occurs twice/);
  });

  it("rejects inverted or excessive event durations", () => {
    expect(() => eventInstants({ ...eventInput, endsAtLocal: "2099-06-16T18:00" }))
      .toThrow(/after start/);
    expect(() => eventInstants({ ...eventInput, endsAtLocal: "2099-08-16T22:00" }))
      .toThrow(/31 days/);
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const previousDatabaseUrl = process.env.DATABASE_URL;

// The destructive reset is restricted to an explicitly selected local test DB.
describe.skipIf(!testDatabaseUrl)("content services against PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(testDatabaseUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)) {
      throw new Error("TEST_DATABASE_URL must be a loopback PostgreSQL database ending in _test.");
    }
    await closeDb();
    process.env.DATABASE_URL = testDatabaseUrl;
    await migrate(getDb(), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  });

  beforeEach(async () => {
    guards.requireEditor.mockReset().mockResolvedValue(editor);
    guards.requireMember.mockReset().mockResolvedValue(member);
    await getDb().execute(sql`TRUNCATE TABLE "user" CASCADE`);
    await getDb().insert(user).values([editor, member, otherMember, outsider].map((value) => ({
      id: value.user.id, name: value.user.name, email: `${value.user.id}@example.test`,
    })));
  });

  afterAll(async () => {
    await closeDb();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("filters guild, draft, and archived announcements in SQL and returns safe DTOs", async () => {
    const publicItem = await createAnnouncement(announcementInput);
    const guildItem = await createAnnouncement({ ...announcementInput, visibility: "guild" });
    const draft = await createAnnouncement({ ...announcementInput, status: "draft" });
    const archived = await archiveAnnouncement(
      (await createAnnouncement(announcementInput)).id, 1,
    );

    expect((await listAnnouncements(null)).map((item) => item.id)).toEqual([publicItem.id]);
    expect((await listAnnouncements(outsider)).map((item) => item.id)).toEqual([publicItem.id]);
    expect(new Set((await listAnnouncements(member)).map((item) => item.id)))
      .toEqual(new Set([publicItem.id, guildItem.id]));
    expect(await getAnnouncement(guildItem.id, null)).toBeNull();
    expect(await getAnnouncement(draft.id, member)).toBeNull();
    expect(await getAnnouncement(archived.id, null)).toBeNull();
    expect(await getAnnouncement("not-a-uuid", null)).toBeNull();
    expect(await listAnnouncements(editor, { includeDrafts: true })).toHaveLength(4);
    expect(publicItem).not.toHaveProperty("authorId");
    expect(publicItem.createdAt).toEqual(expect.stringMatching(/Z$/));
  });

  it("requires the editor guard for draft reads and every announcement write", async () => {
    const item = await createAnnouncement(announcementInput);
    guards.requireEditor.mockRejectedValue(new Error("Editor permission required."));
    await expect(listAnnouncements(member, { includeDrafts: true })).rejects.toThrow(/permission/);
    await expect(getAnnouncement(item.id, { ...member, canPublish: true })).rejects.toThrow(/permission/);
    await expect(createAnnouncement(announcementInput)).rejects.toThrow(/permission/);
    await expect(updateAnnouncement(item.id, 1, announcementInput)).rejects.toThrow(/permission/);
    await expect(archiveAnnouncement(item.id, 1)).rejects.toThrow(/permission/);
    expect((await listAnnouncements(null))[0].version).toBe(1);
  });

  it("validates strict input and records successful edits atomically with optimistic versions", async () => {
    await expect(createAnnouncement({ ...announcementInput, authorId: outsider.user.id })).rejects.toThrow();
    await expect(createAnnouncement({ ...announcementInput, title: " ".repeat(10) })).rejects.toThrow();
    await expect(createAnnouncement({ ...announcementInput, body: "x".repeat(20_001) })).rejects.toThrow();
    const item = await createAnnouncement(announcementInput);
    const edited = await updateAnnouncement(item.id, 1, { ...announcementInput, title: "Updated" });
    expect(edited.version).toBe(2);
    await expect(updateAnnouncement(item.id, 1, { ...announcementInput, title: "Lost edit" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getAnnouncement(item.id, null))?.title).toBe("Updated");
    const audit = await getDb().select().from(auditLog).where(eq(auditLog.entityId, item.id));
    expect(audit).toHaveLength(2);
    expect(audit.map((entry) => entry.action)).toEqual(["created", "updated"]);
    expect(audit[1].details).not.toHaveProperty("body");
  });

  it("rolls content creation back if its audit cannot be saved", async () => {
    // A test-only database constraint fails the audit after content was inserted.
    await getDb().execute(sql`ALTER TABLE audit_log ADD CONSTRAINT test_reject_audit CHECK (false) NOT VALID`);
    try {
      await expect(createAnnouncement(announcementInput)).rejects.toThrow();
    } finally {
      await getDb().execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_reject_audit`);
    }
    expect(await getDb().select().from(announcements)).toHaveLength(0);
    expect(await getDb().select().from(auditLog)).toHaveLength(0);
  });

  it("only exposes published events and cancellations that were previously published", async () => {
    const publicEvent = await createEvent(eventInput);
    const guildEvent = await createEvent({ ...eventInput, visibility: "guild" });
    const draft = await createEvent({ ...eventInput, status: "draft" });
    const cancelledPublic = await cancelEvent((await createEvent(eventInput)).id, 1);
    const cancelledDraft = await cancelEvent((await createEvent({ ...eventInput, status: "draft" })).id, 1);
    expect(new Set((await listEvents(null)).map((item) => item.id)))
      .toEqual(new Set([publicEvent.id, cancelledPublic.id]));
    expect(await listEvents(member)).toHaveLength(3);
    expect(await getEvent(guildEvent.id, null)).toBeNull();
    expect(await getEvent(draft.id, member)).toBeNull();
    expect(await getEvent(cancelledDraft.id, null)).toBeNull();
    expect((await getEvent(cancelledPublic.id, null))?.status).toBe("cancelled");
    expect(await listEvents(editor, { includeDrafts: true })).toHaveLength(5);
    expect(publicEvent.startsAt).toBe("2099-06-17T02:00:00.000Z");
    expect(publicEvent).not.toHaveProperty("authorId");
  });

  it("filters past events before applying the upcoming limit", async () => {
    await createEvent({
      ...eventInput, startsAtLocal: "2001-06-16T19:00", endsAtLocal: "2001-06-16T22:00",
    });
    const upcoming = await createEvent(eventInput);
    expect((await listEvents(null, { upcomingOnly: true, limit: 1 })).map((item) => item.id))
      .toEqual([upcoming.id]);
  });

  it("rejects invalid event dates, timezones, DST instants, capacity, and stale edits", async () => {
    for (const overrides of [
      { startsAtLocal: "2099-02-30T19:00" },
      { timeZone: "Mars/Olympus" },
      { capacity: 0 }, { capacity: 1001 }, { capacity: 1.5 },
      { startsAtLocal: "2027-03-14T02:30", endsAtLocal: "2027-03-14T04:00" },
      { startsAtLocal: "2027-11-07T01:30", endsAtLocal: "2027-11-07T04:00" },
    ]) {
      await expect(createEvent({ ...eventInput, ...overrides })).rejects.toThrow();
    }
    const event = await createEvent(eventInput);
    const edited = await updateEvent(event.id, 1, { ...eventInput, title: "New title" });
    expect(edited.version).toBe(2);
    await expect(updateEvent(event.id, 1, eventInput)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelEvent(event.id, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    const cancelled = await cancelEvent(event.id, 2);
    await expect(updateEvent(event.id, cancelled.version, eventInput)).rejects.toMatchObject({ code: "CLOSED" });
    await expect(setRsvp(event.id, "going")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enforces editor and membership guards for all event writes", async () => {
    const event = await createEvent(eventInput);
    guards.requireEditor.mockRejectedValue(new Error("Editor permission required."));
    guards.requireMember.mockRejectedValue(new Error("Guild membership required."));
    await expect(createEvent(eventInput)).rejects.toThrow(/permission/);
    await expect(updateEvent(event.id, 1, eventInput)).rejects.toThrow(/permission/);
    await expect(cancelEvent(event.id, 1)).rejects.toThrow(/permission/);
    await expect(listEvents(member, { includeDrafts: true })).rejects.toThrow(/permission/);
    await expect(setRsvp(event.id, "going")).rejects.toThrow(/membership/);
    expect(await getDb().select().from(eventRsvps)).toHaveLength(0);
  });

  it("serializes competing last-seat RSVPs and preserves one response per member", async () => {
    const event = await createEvent({ ...eventInput, capacity: 1 });
    guards.requireMember.mockResolvedValueOnce(member).mockResolvedValueOnce(otherMember);
    const results = await Promise.allSettled([setRsvp(event.id, "going"), setRsvp(event.id, "going")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toMatchObject([
      { reason: { code: "CAPACITY" } },
    ]);
    const replies = await getDb().select().from(eventRsvps).where(eq(eventRsvps.eventId, event.id));
    expect(replies).toHaveLength(1);
    const winner = replies[0].userId === member.user.id ? member : otherMember;
    const loser = winner.user.id === member.user.id ? otherMember : member;

    guards.requireMember.mockResolvedValue(winner);
    expect((await setRsvp(event.id, "going")).goingCount).toBe(1);
    expect((await setRsvp(event.id, "declined")).goingCount).toBe(0);
    guards.requireMember.mockResolvedValue(loser);
    expect((await setRsvp(event.id, "maybe")).goingCount).toBe(0);
    expect((await setRsvp(event.id, "going")).goingCount).toBe(1);
    expect((await getEvent(event.id, loser))?.myRsvp).toBe("going");
    expect((await getEvent(event.id, null))?.myRsvp).toBeNull();
    expect(await getDb().select().from(eventRsvps).where(eq(eventRsvps.eventId, event.id))).toHaveLength(2);
  });

  it("rejects capacity below existing attendance without changing content or audit", async () => {
    const event = await createEvent({ ...eventInput, capacity: 2 });
    await setRsvp(event.id, "going");
    guards.requireMember.mockResolvedValue(otherMember);
    await setRsvp(event.id, "going");
    await expect(updateEvent(event.id, 1, { ...eventInput, capacity: 1 }))
      .rejects.toMatchObject({ code: "CAPACITY" });
    const [persisted] = await getDb().select().from(events).where(eq(events.id, event.id));
    expect(persisted.capacity).toBe(2);
    expect(persisted.version).toBe(1);
    expect(await getDb().select().from(auditLog)
      .where(and(eq(auditLog.entityId, event.id), eq(auditLog.action, "updated")))).toHaveLength(0);
  });

  it("rejects RSVPs for drafts, ended events, and unknown IDs", async () => {
    const draft = await createEvent({ ...eventInput, status: "draft" });
    const past = await createEvent({
      ...eventInput, startsAtLocal: "2001-06-16T19:00", endsAtLocal: "2001-06-16T22:00",
    });
    await expect(setRsvp(draft.id, "going")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setRsvp(past.id, "going")).rejects.toMatchObject({ code: "CLOSED" });
    await expect(setRsvp("00000000-0000-4000-8000-000000000000", "going"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
