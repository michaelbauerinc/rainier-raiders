import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../src/server/auth";
import type { EventDto } from "../src/server/services/content";
import { GET } from "../src/app/events/[id]/calendar.ics/route";

const mocks = vi.hoisted(() => ({
  connection: vi.fn<() => Promise<void>>(),
  getViewer: vi.fn<() => Promise<Viewer | null>>(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getEvent: vi.fn<(id: string, viewer: Viewer | null) => Promise<EventDto | null>>(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/server/db", () => ({ isDatabaseConfigured: mocks.isDatabaseConfigured }));
vi.mock("@/server/services/content", () => ({ getEvent: mocks.getEvent }));

const eventId = "5b1c8f08-6fde-4449-a91d-ef6bf27972c4";
const member: Viewer = {
  user: { id: "calendar-member", name: "Member", image: null },
  discordId: "111111111111111111", isMember: true, canPublish: false,
};
const outsider: Viewer = { ...member, isMember: false };
const editor: Viewer = { ...member, canPublish: true };

function event(overrides: Partial<EventDto> = {}): EventDto {
  return {
    id: eventId, title: "Raid night", description: "Meet at the entrance.",
    timeZone: "America/Los_Angeles", capacity: 20, visibility: "public", status: "published",
    version: 3, startsAt: "2027-07-02T02:00:00.000Z", endsAt: "2027-07-02T05:00:00.000Z",
    createdAt: "2026-11-16T20:00:00.000Z", updatedAt: "2026-11-16T21:00:00.000Z",
    publishedAt: "2026-11-16T21:00:00.000Z", goingCount: 0, myRsvp: null,
    ...overrides,
  };
}

function download(id = eventId) {
  return GET(new Request(`https://guild.test/events/${id}/calendar.ics`), {
    params: Promise.resolve({ id }),
  });
}

function unfold(calendar: string) {
  return calendar.replace(/\r\n[ \t]/g, "");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.getViewer.mockResolvedValue(null);
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.getEvent.mockResolvedValue(event());
});

describe("calendar download permissions", () => {
  it("exports a published public event for an anonymous visitor through the authorized DAL", async () => {
    const response = await download();
    expect(response.status).toBe(200);
    expect(mocks.getEvent).toHaveBeenCalledWith(eventId, null);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="rainier-raiders-${eventId}.ics"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain("CLASS:PUBLIC");
  });

  it("passes verified membership to the DAL and marks guild events private", async () => {
    mocks.getViewer.mockResolvedValue(member);
    mocks.getEvent.mockResolvedValue(event({ visibility: "guild" }));
    const response = await download();
    expect(response.status).toBe(200);
    expect(mocks.getEvent).toHaveBeenCalledWith(eventId, member);
    expect(await response.text()).toContain("CLASS:PRIVATE");
  });

  it.each([null, outsider])("honors the DAL's guild-content denial for viewer %j", async (viewer) => {
    mocks.getViewer.mockResolvedValue(viewer);
    mocks.getEvent.mockResolvedValue(null);
    const response = await download();
    expect(response.status).toBe(404);
    expect(mocks.getEvent).toHaveBeenCalledWith(eventId, viewer);
    expect(await response.text()).toBe("Event not found.");
    expect(response.headers.get("content-type")).not.toContain("text/calendar");
  });

  it.each([
    { status: "draft" as const, publishedAt: null },
    { status: "draft" as const, publishedAt: "2026-11-16T21:00:00.000Z" },
    { status: "cancelled" as const, publishedAt: null },
    { status: "published" as const, publishedAt: null },
  ])("refuses unpublished content even when an editor can read it: %j", async (overrides) => {
    mocks.getViewer.mockResolvedValue(editor);
    mocks.getEvent.mockResolvedValue(event(overrides));
    const response = await download();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("BEGIN:VCALENDAR");
  });

  it("rejects invalid IDs before loading identity or database content", async () => {
    const response = await download("not-a-uuid");
    expect(response.status).toBe(404);
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.getEvent).not.toHaveBeenCalled();
  });

  it("reports unavailable storage without attempting a content read", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);
    const response = await download();
    expect(response.status).toBe(503);
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.getEvent).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails closed with a generic response if authorization or storage fails", async () => {
    mocks.getEvent.mockRejectedValue(new Error("private account token must not appear"));
    const response = await download();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private account token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("iCalendar serialization", () => {
  it("preserves explicit instants across a daylight-saving overlap and emits UTC", async () => {
    mocks.getEvent.mockResolvedValue(event({
      startsAt: "2027-11-07T01:30:00-07:00", endsAt: "2027-11-07T01:30:00-08:00",
    }));
    const calendar = unfold(await (await download()).text());
    expect(calendar).toContain("DTSTART:20271107T083000Z");
    expect(calendar).toContain("DTEND:20271107T093000Z");
    expect(calendar).not.toContain("DTSTART;TZID=");
    expect(calendar).toContain("Event time zone: America/Los_Angeles");
  });

  it("retains stable UID, incremented sequence and cancellation status", async () => {
    mocks.getEvent.mockResolvedValue(event({ status: "cancelled", version: 7 }));
    const calendar = unfold(await (await download()).text());
    expect(calendar).toContain(`UID:${eventId}@rainier-raiders`);
    expect(calendar).toContain("SEQUENCE:7");
    expect(calendar).toContain("STATUS:CANCELLED");
    expect(calendar).toContain("LAST-MODIFIED:20261116T210000Z");
    expect(calendar).toContain("METHOD:PUBLISH");
  });

  it("escapes CRLF/property injection and text separators without adding events or attendees", async () => {
    mocks.getEvent.mockResolvedValue(event({
      title: "Raid, snacks; drinks\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected",
      description: "Bring \\ gear, food; drinks\r\nATTENDEE:mailto:intruder@example.test\nBEGIN:VEVENT",
    }));
    const response = await download();
    expect(response.status).toBe(200);
    const calendar = unfold(await response.text());
    const lines = calendar.split(/\r?\n/);
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith("SUMMARY:"))).toHaveLength(1);
    expect(lines.some((line) => line.startsWith("ATTENDEE:"))).toBe(false);
    expect(lines.find((line) => line.startsWith("SUMMARY:"))).toContain("Raid\\, snacks\\; drinks\\nEND:VEVENT");
    expect(lines.find((line) => line.startsWith("DESCRIPTION:"))).toContain("Bring \\\\ gear\\, food\\; drinks");
    expect(lines.find((line) => line.startsWith("DESCRIPTION:"))).toContain("\\nATTENDEE:mailto:intruder@example.test");
  });
});
