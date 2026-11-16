import { sql } from "drizzle-orm";
import {
  check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const contentVisibility = pgEnum("content_visibility", ["public", "guild"]);
export const announcementStatus = pgEnum("announcement_status", ["draft", "published", "archived"]);
export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled"]);
export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe", "declined"]);

export const announcements = pgTable("announcement", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  visibility: contentVisibility("visibility").default("guild").notNull(),
  status: announcementStatus("status").default("draft").notNull(),
  version: integer("version").default(1).notNull(),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("announcement_feed_idx").on(table.status, table.visibility, table.publishedAt),
  check("announcement_version_positive", sql`${table.version} > 0`),
  check("announcement_published_date", sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`),
]);

export const events = pgTable("event", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timeZone: varchar("time_zone", { length: 100 }).notNull(),
  capacity: integer("capacity"),
  visibility: contentVisibility("visibility").default("guild").notNull(),
  status: eventStatus("status").default("draft").notNull(),
  version: integer("version").default(1).notNull(),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("event_calendar_idx").on(table.startsAt, table.status, table.visibility),
  check("event_time_order", sql`${table.endsAt} > ${table.startsAt}`),
  check("event_capacity_range", sql`${table.capacity} IS NULL OR (${table.capacity} >= 1 AND ${table.capacity} <= 1000)`),
  check("event_version_positive", sql`${table.version} > 0`),
  check("event_published_date", sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`),
]);

export const eventRsvps = pgTable("event_rsvp", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: rsvpStatus("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.userId] }),
  index("event_rsvp_capacity_idx").on(table.eventId, table.status),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  details: jsonb("details").$type<Record<string, string | number | null>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_log_entity_idx").on(table.entityType, table.entityId, table.createdAt),
]);
