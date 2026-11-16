import "server-only";

import type { AnnouncementDto, EventDto } from "@/server/services/content";

// Deliberately fixed, fictional fixtures. Titles and exported calendars identify
// them as samples; they never represent real attendance or scheduled guild plans.
const publishedAt = "2026-11-16T18:00:00.000Z";
const common = {
  visibility: "public" as const,
  status: "published" as const,
  version: 1,
  createdAt: publishedAt,
  updatedAt: publishedAt,
  publishedAt,
};

export const previewAnnouncements: readonly AnnouncementDto[] = [
  {
    ...common,
    id: "a1000000-0000-4000-8000-000000000001",
    title: "Raid night details · sample",
    body: `Sample announcement. This is where the guild can post the next raid's start time, meeting point, and anything to bring.

The dates and events in this preview are placeholders. No raid has been scheduled here.`,
  },
  {
    ...common,
    id: "a1000000-0000-4000-8000-000000000002",
    title: "The guild calendar · sample",
    body: `Sample announcement. Open the calendar to see example raid nights, dungeon runs, and guild hangouts. Each event has a detail page and a sample calendar download.

This preview is read-only and does not collect sign-ins or RSVPs.`,
  },
];

export const previewEvents: readonly EventDto[] = [
  {
    ...common,
    id: "e1000000-0000-4000-8000-000000000001",
    title: "Raid night · sample",
    description: `Sample event — not a scheduled guild activity.

An example evening raid, with time for forming the group before the first pull. Actual raid details and attendance will be added when guild publishing is enabled.`,
    startsAt: "2026-11-21T03:00:00.000Z",
    endsAt: "2026-11-21T06:00:00.000Z",
    timeZone: "America/Los_Angeles",
    capacity: null,
    goingCount: 0,
    myRsvp: null,
  },
  {
    ...common,
    id: "e1000000-0000-4000-8000-000000000002",
    title: "Dungeon runs · sample",
    description: `Sample event — not a scheduled guild activity.

An example afternoon for smaller groups and dungeon runs. This placeholder shows how a shorter event appears in the guild calendar.`,
    startsAt: "2026-11-21T22:00:00.000Z",
    endsAt: "2026-11-22T00:00:00.000Z",
    timeZone: "America/Los_Angeles",
    capacity: null,
    goingCount: 0,
    myRsvp: null,
  },
  {
    ...common,
    id: "e1000000-0000-4000-8000-000000000003",
    title: "Guild hangout · sample",
    description: `Sample event — not a scheduled guild activity.

An example casual evening to catch up and plan the week. The time is a placeholder; this preview does not accept RSVPs.`,
    startsAt: "2026-11-23T02:00:00.000Z",
    endsAt: "2026-11-23T03:00:00.000Z",
    timeZone: "America/Los_Angeles",
    capacity: null,
    goingCount: 0,
    myRsvp: null,
  },
];
