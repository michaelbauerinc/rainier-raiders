import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/server/auth";
import { isPreviewMode, PreviewReadOnlyError } from "@/server/website-mode";
import { previewAnnouncements, previewEvents } from "@/server/preview-content";
import {
  archiveAnnouncement, cancelEvent, createAnnouncement, createEvent,
  getAnnouncement, getEvent, listAnnouncements, listEvents,
  setRsvp, updateAnnouncement, updateEvent,
} from "@/server/services/content";
import { saveAnnouncementAction, saveEventAction, retireContentAction, rsvpAction } from "@/app/actions";
import { initialActionState } from "@/components/content/action-state";
import { ContentShell } from "@/components/content/content-shell";
import AnnouncementPage from "@/app/announcements/[id]/page";
import EventPage from "@/app/events/[id]/page";
import AnnouncementsPage from "@/app/announcements/page";
import EventsPage from "@/app/events/page";
import { GET as downloadCalendar } from "@/app/events/[id]/calendar.ics/route";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), isDatabaseConfigured: vi.fn(), requireEditor: vi.fn(),
  requireMember: vi.fn(), getViewer: vi.fn(), isAuthConfigured: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/server/db", () => ({ getDb: mocks.getDb, isDatabaseConfigured: mocks.isDatabaseConfigured }));
vi.mock("@/server/auth", () => ({
  requireEditor: mocks.requireEditor, requireMember: mocks.requireMember,
  getViewer: mocks.getViewer, isAuthConfigured: mocks.isAuthConfigured,
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const editor: Viewer = {
  user: { id: "existing-editor", name: "Editor", image: null },
  discordId: "111111111111111111", isMember: true, canPublish: true,
};
const realId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const announcementInput = { title: "A real announcement", body: "Must not save.", visibility: "public", status: "published" };
const eventInput = {
  title: "A real event", description: "Must not save.", startsAtLocal: "2027-07-01T19:00",
  endsAtLocal: "2027-07-01T21:00", timeZone: "America/Los_Angeles", capacity: null,
  visibility: "public", status: "published",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WEBSITE_MODE", "preview");
  vi.stubEnv("DATABASE_URL", "postgres://accidental:configuration@127.0.0.1/guild");
  // Even an accidentally authorized caller must not get through preview guards.
  mocks.requireEditor.mockResolvedValue(editor);
  mocks.requireMember.mockResolvedValue(editor);
  mocks.getViewer.mockResolvedValue(editor);
  mocks.isAuthConfigured.mockReturnValue(true);
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.getDb.mockImplementation(() => { throw new Error("Database must not be accessed in preview"); });
});
afterEach(() => vi.unstubAllEnvs());

describe("preview content isolation", () => {
  it("is selected only by the exact runtime environment value", () => {
    expect(isPreviewMode()).toBe(true);
    vi.stubEnv("WEBSITE_MODE", undefined);
    expect(isPreviewMode()).toBe(false);
    vi.stubEnv("WEBSITE_MODE", "full");
    expect(isPreviewMode()).toBe(false);
  });

  it("returns only labeled public samples even for an editor with DB configuration", async () => {
    const announcements = await listAnnouncements(editor);
    const events = await listEvents(editor, { upcomingOnly: true });
    expect(announcements).toEqual(previewAnnouncements);
    expect(events).toEqual(previewEvents);
    for (const item of [...announcements, ...events]) {
      expect(item.title).toMatch(/sample/i);
      expect(item.visibility).toBe("public");
      expect(item.status).toBe("published");
    }
    expect(await getAnnouncement(realId, editor)).toBeNull();
    expect(await getEvent(realId, editor)).toBeNull();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.requireEditor).not.toHaveBeenCalled();
    expect(mocks.isDatabaseConfigured).not.toHaveBeenCalled();
  });

  it("serves sample details without DB configuration and does not mutate fixtures", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);
    const announcement = await getAnnouncement(previewAnnouncements[0].id, null);
    const event = await getEvent(previewEvents[0].id, null);
    expect(announcement).toEqual(previewAnnouncements[0]);
    expect(event).toEqual(previewEvents[0]);
    announcement!.title = "Changed locally";
    event!.title = "Changed locally";
    expect((await getAnnouncement(previewAnnouncements[0].id, null))?.title).toMatch(/sample/i);
    expect((await getEvent(previewEvents[0].id, null))?.title).toMatch(/sample/i);
    expect(await listEvents(null, { limit: 1 })).toHaveLength(1);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies draft/admin listing instead of returning actual protected data", async () => {
    await expect(listAnnouncements(editor, { includeDrafts: true })).rejects.toBeInstanceOf(PreviewReadOnlyError);
    await expect(listEvents(editor, { includeDrafts: true })).rejects.toBeInstanceOf(PreviewReadOnlyError);
    expect(mocks.requireEditor).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("keeps full-mode storage checks intact when the flag is absent", async () => {
    vi.stubEnv("WEBSITE_MODE", undefined);
    mocks.isDatabaseConfigured.mockReturnValue(false);
    await expect(listAnnouncements(null)).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    await expect(listEvents(null)).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
});

describe("preview mutation denial", () => {
  it.each([
    ["create announcement", () => createAnnouncement(announcementInput)],
    ["update announcement", () => updateAnnouncement(realId, 1, announcementInput)],
    ["archive announcement", () => archiveAnnouncement(realId, 1)],
    ["create event", () => createEvent(eventInput)],
    ["update event", () => updateEvent(realId, 1, eventInput)],
    ["cancel event", () => cancelEvent(realId, 1)],
    ["RSVP", () => setRsvp(realId, "going")],
  ])("denies %s before authorization or database side effects", async (_name, mutate) => {
    await expect(mutate()).rejects.toBeInstanceOf(PreviewReadOnlyError);
    expect(mocks.requireEditor).not.toHaveBeenCalled();
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each([
    ["save announcement", saveAnnouncementAction], ["save event", saveEventAction],
    ["retire content", retireContentAction], ["RSVP", rsvpAction],
  ])("rejects the %s server action before validation, writes or redirects", async (_name, action) => {
    const result = await action(initialActionState, new FormData());
    expect(result.message).toBe("This public preview is read-only.");
    expect(result.success).not.toBe(true);
    expect(mocks.requireEditor).not.toHaveBeenCalled();
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("public preview pages and calendar", () => {
  it("hides login/admin UI even when passed an editor and configured auth", () => {
    const markup = renderToStaticMarkup(ContentShell({ viewer: editor, configured: true, children: "Guild content" }));
    expect(markup).toContain("Public preview");
    expect(markup).toContain("Dates are placeholders");
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/admin"');
    expect(markup).not.toContain("Sign out");
  });

  it("renders sample lists and details without storage, login, admin or RSVP controls", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);
    const rendered = [
      await AnnouncementsPage(), await EventsPage(),
      await AnnouncementPage({ params: Promise.resolve({ id: previewAnnouncements[0].id }) }),
      await EventPage({ params: Promise.resolve({ id: previewEvents[0].id }) }),
    ];
    for (const page of rendered) {
      const markup = renderToStaticMarkup(page);
      expect(markup).toContain("Public preview");
      expect(markup).toMatch(/sample/i);
      expect(markup).not.toContain('href="/login"');
      expect(markup).not.toContain('href="/admin');
      expect(markup).not.toContain("<form");
      expect(markup).not.toContain("<dt>Attendance</dt>");
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("exports an explicitly labeled sample calendar with no database and returns 404 for real IDs", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);
    const id = previewEvents[0].id;
    const response = await downloadCalendar(new Request(`https://rainier.test/events/${id}/calendar.ics`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    const calendar = (await response.text()).replace(/\r\n[ \t]/g, "");
    expect(calendar).toContain("SUMMARY:Raid night · sample");
    expect(calendar).toContain("DESCRIPTION:Sample event");
    expect(calendar).toContain("DTSTART:20261121T030000Z");
    expect(calendar).toContain("CLASS:PUBLIC");
    const missing = await downloadCalendar(new Request(`https://rainier.test/events/${realId}/calendar.ics`), { params: Promise.resolve({ id: realId }) });
    expect(missing.status).toBe(404);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
