import "server-only";

import { assertFullWebsite, isPreviewMode } from "@/server/website-mode";
import { previewAnnouncements, previewEvents } from "@/server/preview-content";
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  announcementInputSchema, eventInputSchema, rsvpStatusSchema, type EventInput, type RsvpStatus,
} from "@/features/content/schemas";
import { requireEditor, requireMember, type Viewer } from "@/server/auth";
import { getDb, isDatabaseConfigured, type Database } from "@/server/db";
import { announcements, auditLog, eventRsvps, events } from "@/server/db/app-schema";
import { ContentError } from "./content-error";
import { eventInstants } from "./event-time";

export { ContentError } from "./content-error";

type AnnouncementRow = typeof announcements.$inferSelect;
type EventRow = typeof events.$inferSelect;
type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "insert">;
export type AnnouncementDto = Pick<AnnouncementRow, "id" | "title" | "body" | "visibility" | "status" | "version"> & {
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export type EventDto = Pick<EventRow,
  "id" | "title" | "description" | "timeZone" | "capacity" | "visibility" | "status" | "version"
> & {
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  goingCount: number;
  myRsvp: RsvpStatus | null;
};

const idSchema = z.string().uuid();
const versionSchema = z.number().int().positive();
const listOptionsSchema = z.object({
  includeDrafts: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();
type ListOptions = z.infer<typeof listOptionsSchema>;
const eventListOptionsSchema = listOptionsSchema.extend({ upcomingOnly: z.boolean().optional() });
type EventListOptions = z.infer<typeof eventListOptionsSchema>;

function database() {
  if (!isDatabaseConfigured()) {
    throw new ContentError("DATABASE_UNAVAILABLE", "The database is not configured yet.");
  }
  return getDb();
}

function announcementDto(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id, title: row.title, body: row.body, visibility: row.visibility,
    status: row.status, version: row.version,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function eventDto(row: EventRow, goingCount = 0, myRsvp: RsvpStatus | null = null): EventDto {
  return {
    id: row.id, title: row.title, description: row.description, timeZone: row.timeZone,
    capacity: row.capacity, visibility: row.visibility, status: row.status, version: row.version,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    goingCount, myRsvp,
  };
}

function announcementFilter(viewer: Viewer | null, includeDrafts: boolean) {
  if (includeDrafts) return undefined;
  return and(
    eq(announcements.status, "published"),
    viewer?.isMember ? undefined : eq(announcements.visibility, "public"),
  );
}

function eventFilter(viewer: Viewer | null, includeDrafts: boolean) {
  if (includeDrafts) return undefined;
  return and(
    or(eq(events.status, "published"), and(eq(events.status, "cancelled"), isNotNull(events.publishedAt))),
    viewer?.isMember ? undefined : eq(events.visibility, "public"),
  );
}

function requireVersion(actual: number, expected: number) {
  if (actual !== expected) {
    throw new ContentError("CONFLICT", "Someone changed this item. Reload it before saving again.");
  }
}

function eventValues(input: EventInput) {
  return {
    title: input.title, description: input.description, timeZone: input.timeZone,
    capacity: input.capacity, visibility: input.visibility, status: input.status,
    ...eventInstants(input),
  };
}

async function audit(
  db: Writer,
  actorUserId: string,
  entityType: "announcement" | "event" | "rsvp",
  entityId: string,
  action: string,
  details: Record<string, string | number | null>,
) {
  await db.insert(auditLog).values({ actorUserId, entityType, entityId, action, details });
}

async function stats(db: Reader, eventId: string, userId: string) {
  const [counts, replies] = await Promise.all([
    db.select({ count: sql<number>`count(*)::integer` }).from(eventRsvps)
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, "going"))),
    db.select({ status: eventRsvps.status }).from(eventRsvps)
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId))).limit(1),
  ]);
  return { goingCount: counts[0]?.count ?? 0, myRsvp: replies[0]?.status ?? null };
}

async function eventDtos(db: Reader, rows: EventRow[], viewer: Viewer | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const counts = await db.select({ eventId: eventRsvps.eventId, count: sql<number>`count(*)::integer` })
    .from(eventRsvps).where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.status, "going")))
    .groupBy(eventRsvps.eventId);
  const mine = viewer?.isMember
    ? await db.select({ eventId: eventRsvps.eventId, status: eventRsvps.status }).from(eventRsvps)
      .where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.userId, viewer.user.id)))
    : [];
  const countById = new Map(counts.map((row) => [row.eventId, row.count]));
  const mineById = new Map(mine.map((row) => [row.eventId, row.status]));
  return rows.map((row) => eventDto(row, countById.get(row.id) ?? 0, mineById.get(row.id) ?? null));
}

// Query callers must pass a Viewer obtained on the server from getViewer().
// Draft/archive access independently revalidates the editor guard.
export async function listAnnouncements(viewer: Viewer | null, options: ListOptions = {}): Promise<AnnouncementDto[]> {
  const settings = listOptionsSchema.parse(options);
  if (isPreviewMode()) {
    if (settings.includeDrafts) assertFullWebsite();
    return previewAnnouncements.slice(0, settings.limit ?? 100).map((item) => ({ ...item }));
  }
  const reader = settings.includeDrafts ? await requireEditor() : viewer;
  const rows = await database().select().from(announcements)
    .where(announcementFilter(reader, Boolean(settings.includeDrafts)))
    .orderBy(desc(announcements.createdAt), desc(announcements.id)).limit(settings.limit ?? 100);
  return rows.map(announcementDto);
}

export async function getAnnouncement(id: string, viewer: Viewer | null): Promise<AnnouncementDto | null> {
  if (isPreviewMode()) {
    const item = previewAnnouncements.find((sample) => sample.id === id);
    return item ? { ...item } : null;
  }
  if (!idSchema.safeParse(id).success) return null;
  const canEdit = Boolean(viewer?.canPublish);
  const reader = canEdit ? await requireEditor() : viewer;
  const [row] = await database().select().from(announcements)
    .where(and(eq(announcements.id, id), announcementFilter(reader, canEdit))).limit(1);
  return row ? announcementDto(row) : null;
}

export async function createAnnouncement(input: unknown): Promise<AnnouncementDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  const parsed = announcementInputSchema.parse(input);
  return database().transaction(async (tx) => {
    const [row] = await tx.insert(announcements).values({
      ...parsed, authorId: viewer.user.id, publishedAt: parsed.status === "published" ? new Date() : null,
    }).returning();
    await audit(tx, viewer.user.id, "announcement", row.id, "created", {
      status: row.status, visibility: row.visibility, version: row.version,
    });
    return announcementDto(row);
  });
}

export async function updateAnnouncement(id: string, version: number, input: unknown): Promise<AnnouncementDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  idSchema.parse(id);
  versionSchema.parse(version);
  const parsed = announcementInputSchema.parse(input);
  return database().transaction(async (tx) => {
    const [current] = await tx.select().from(announcements).where(eq(announcements.id, id)).for("update");
    if (!current) throw new ContentError("NOT_FOUND", "Announcement not found.");
    requireVersion(current.version, version);
    if (current.status === "archived") throw new ContentError("CLOSED", "Archived announcements cannot be edited.");
    const now = new Date();
    const [row] = await tx.update(announcements).set({
      ...parsed, version: current.version + 1, updatedAt: now,
      publishedAt: parsed.status === "published" ? current.publishedAt ?? now : null,
    }).where(and(eq(announcements.id, id), eq(announcements.version, version))).returning();
    await audit(tx, viewer.user.id, "announcement", id, "updated", {
      status: row.status, visibility: row.visibility, version: row.version,
    });
    return announcementDto(row);
  });
}

export async function archiveAnnouncement(id: string, version: number): Promise<AnnouncementDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  idSchema.parse(id);
  versionSchema.parse(version);
  return database().transaction(async (tx) => {
    const [current] = await tx.select().from(announcements).where(eq(announcements.id, id)).for("update");
    if (!current) throw new ContentError("NOT_FOUND", "Announcement not found.");
    requireVersion(current.version, version);
    if (current.status === "archived") return announcementDto(current);
    const [row] = await tx.update(announcements).set({
      status: "archived", version: version + 1, updatedAt: new Date(),
    }).where(and(eq(announcements.id, id), eq(announcements.version, version))).returning();
    await audit(tx, viewer.user.id, "announcement", id, "archived", { version: row.version });
    return announcementDto(row);
  });
}

export async function listEvents(viewer: Viewer | null, options: EventListOptions = {}): Promise<EventDto[]> {
  const settings = eventListOptionsSchema.parse(options);
  if (isPreviewMode()) {
    if (settings.includeDrafts) assertFullWebsite();
    // Keep the fixed sample schedule visible after its illustrative dates pass.
    return previewEvents.slice(0, settings.limit ?? 100).map((item) => ({ ...item }));
  }
  const reader = settings.includeDrafts ? await requireEditor() : viewer;
  const db = database();
  const rows = await db.select().from(events).where(and(
    eventFilter(reader, Boolean(settings.includeDrafts)),
    settings.upcomingOnly ? sql`${events.endsAt} > now()` : undefined,
  ))
    .orderBy(asc(events.startsAt), asc(events.id)).limit(settings.limit ?? 100);
  return eventDtos(db, rows, reader);
}

export async function getEvent(id: string, viewer: Viewer | null): Promise<EventDto | null> {
  if (isPreviewMode()) {
    const item = previewEvents.find((sample) => sample.id === id);
    return item ? { ...item } : null;
  }
  if (!idSchema.safeParse(id).success) return null;
  const canEdit = Boolean(viewer?.canPublish);
  const reader = canEdit ? await requireEditor() : viewer;
  const db = database();
  const [row] = await db.select().from(events)
    .where(and(eq(events.id, id), eventFilter(reader, canEdit))).limit(1);
  return row ? (await eventDtos(db, [row], reader))[0] : null;
}

export async function createEvent(input: unknown): Promise<EventDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  const parsed = eventInputSchema.parse(input);
  const values = eventValues(parsed);
  return database().transaction(async (tx) => {
    const [row] = await tx.insert(events).values({
      ...values, authorId: viewer.user.id,
      publishedAt: values.status === "published" ? new Date() : null,
    }).returning();
    await audit(tx, viewer.user.id, "event", row.id, "created", {
      status: row.status, visibility: row.visibility, version: row.version,
    });
    return eventDto(row);
  });
}

export async function updateEvent(id: string, version: number, input: unknown): Promise<EventDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  idSchema.parse(id);
  versionSchema.parse(version);
  const parsed = eventInputSchema.parse(input);
  const values = eventValues(parsed);
  return database().transaction(async (tx) => {
    const [current] = await tx.select().from(events).where(eq(events.id, id)).for("update");
    if (!current) throw new ContentError("NOT_FOUND", "Event not found.");
    requireVersion(current.version, version);
    if (current.status === "cancelled") throw new ContentError("CLOSED", "Cancelled events cannot be edited.");
    const response = await stats(tx, id, viewer.user.id);
    if (values.capacity !== null && values.capacity < response.goingCount) {
      throw new ContentError("CAPACITY", "Capacity cannot be lower than the number already attending.");
    }
    const now = new Date();
    const [row] = await tx.update(events).set({
      ...values, version: version + 1, updatedAt: now,
      publishedAt: values.status === "published" ? current.publishedAt ?? now : null,
    }).where(and(eq(events.id, id), eq(events.version, version))).returning();
    await audit(tx, viewer.user.id, "event", id, "updated", {
      status: row.status, visibility: row.visibility, version: row.version, capacity: row.capacity,
    });
    return eventDto(row, response.goingCount, response.myRsvp);
  });
}

export async function cancelEvent(id: string, version: number): Promise<EventDto> {
  assertFullWebsite();
  const viewer = await requireEditor();
  idSchema.parse(id);
  versionSchema.parse(version);
  return database().transaction(async (tx) => {
    const [current] = await tx.select().from(events).where(eq(events.id, id)).for("update");
    if (!current) throw new ContentError("NOT_FOUND", "Event not found.");
    requireVersion(current.version, version);
    const response = await stats(tx, id, viewer.user.id);
    if (current.status === "cancelled") return eventDto(current, response.goingCount, response.myRsvp);
    const [row] = await tx.update(events).set({
      status: "cancelled", version: version + 1, updatedAt: new Date(),
    }).where(and(eq(events.id, id), eq(events.version, version))).returning();
    await audit(tx, viewer.user.id, "event", id, "cancelled", { version: row.version });
    return eventDto(row, response.goingCount, response.myRsvp);
  });
}

export async function setRsvp(eventId: string, status: RsvpStatus): Promise<EventDto> {
  assertFullWebsite();
  const viewer = await requireMember();
  idSchema.parse(eventId);
  const nextStatus = rsvpStatusSchema.parse(status);
  return database().transaction(async (tx) => {
    // Every RSVP and capacity edit locks this same event row, serializing the last seat.
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
    if (!event || event.status !== "published") throw new ContentError("NOT_FOUND", "This event is not available for RSVP.");
    if (event.endsAt.getTime() <= Date.now()) throw new ContentError("CLOSED", "This event has ended.");
    const before = await stats(tx, eventId, viewer.user.id);
    if (nextStatus === "going" && before.myRsvp !== "going"
      && event.capacity !== null && before.goingCount >= event.capacity) {
      throw new ContentError("CAPACITY", "This event is full. You can choose maybe instead.");
    }
    await tx.insert(eventRsvps).values({ eventId, userId: viewer.user.id, status: nextStatus })
      .onConflictDoUpdate({
        target: [eventRsvps.eventId, eventRsvps.userId],
        set: { status: nextStatus, updatedAt: new Date() },
      });
    await audit(tx, viewer.user.id, "rsvp", eventId, "responded", { status: nextStatus });
    const goingCount = before.goingCount + (nextStatus === "going" ? 1 : 0) - (before.myRsvp === "going" ? 1 : 0);
    return eventDto(event, goingCount, nextStatus);
  });
}
