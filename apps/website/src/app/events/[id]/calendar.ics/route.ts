import { isPreviewMode } from "@/server/website-mode";
import ical, { ICalCalendarMethod, ICalEventClass, ICalEventStatus } from "ical-generator";
import { connection } from "next/server";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { getEvent } from "@/server/services/content";
import { isContentId } from "@/components/content/format";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isContentId(id)) return new Response("Event not found.", { status: 404, headers: privateHeaders });
  if (!isPreviewMode() && !isDatabaseConfigured()) return new Response("Calendar downloads are unavailable.", { status: 503, headers: privateHeaders });

  try {
    const viewer = await getViewer();
    // Reuse the detail page's authorization policy, including guild visibility.
    const event = await getEvent(id, viewer);
    if (!event || event.status === "draft" || !event.publishedAt) {
      return new Response("Event not found.", { status: 404, headers: privateHeaders });
    }
    const calendar = ical({
      name: "Rainier Raiders",
      prodId: { company: "Rainier Raiders", product: "Guild calendar", language: "EN" },
      method: ICalCalendarMethod.PUBLISH,
    });
    calendar.createEvent({
      id: `${event.id}@rainier-raiders`,
      sequence: event.version,
      summary: event.title,
      description: `${event.description}\n\nEvent time zone: ${event.timeZone}`,
      // UTC preserves the stored instant regardless of the server's time zone.
      start: new Date(event.startsAt),
      end: new Date(event.endsAt),
      created: new Date(event.createdAt),
      lastModified: new Date(event.updatedAt),
      stamp: new Date(event.updatedAt),
      status: event.status === "cancelled" ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      class: event.visibility === "guild" ? ICalEventClass.PRIVATE : ICalEventClass.PUBLIC,
    });
    return new Response(calendar.toString(), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="rainier-raiders-${event.id}.ics"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Calendar downloads are unavailable. Please try again.", { status: 503, headers: privateHeaders });
  }
}
