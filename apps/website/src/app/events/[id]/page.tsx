import { isPreviewMode } from "@/server/website-mode";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getViewer, isAuthConfigured } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { getEvent } from "@/server/services/content";
import { ContentShell, SetupState, ContentUnavailable } from "@/components/content/content-shell";
import { RsvpForm } from "@/components/content/rsvp-form";
import { eventDate, isContentId } from "@/components/content/format";
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isContentId(id)) notFound();
  const viewer = await getViewer();
  const configured = isAuthConfigured();
  if (!isPreviewMode() && !isDatabaseConfigured()) return <ContentShell viewer={viewer} configured={configured}><SetupState /></ContentShell>;
  let item;
  try { item = await getEvent(id, viewer); } catch { return <ContentShell viewer={viewer} configured={configured}><ContentUnavailable /></ContentShell>; }
  if (!item) notFound();
  // eslint-disable-next-line react-hooks/purity -- This server render is request-time after connection().
  const ended = new Date(item.endsAt).getTime() <= Date.now();
  const full = item.capacity !== null && item.goingCount >= item.capacity;
  return <ContentShell viewer={viewer} configured={configured}><Link className="text-link" href="/events">← Calendar</Link><article className="content-card detail-card">
    <div className="content-meta"><span>{isPreviewMode() ? "Sample" : item.visibility === "guild" ? "Guild members" : "Public"}</span>{item.status !== "published" && <span className="status-badge">{item.status}</span>}</div>
    <h1>{item.title}</h1><dl className="event-facts"><div><dt>Starts</dt><dd><time dateTime={item.startsAt}>{eventDate(item.startsAt, item.timeZone)}</time></dd></div><div><dt>Ends</dt><dd><time dateTime={item.endsAt}>{eventDate(item.endsAt, item.timeZone)}</time></dd></div><div><dt>Time zone</dt><dd>{item.timeZone}</dd></div>{!isPreviewMode() && <div><dt>Attendance</dt><dd>{item.goingCount} going{item.capacity !== null ? ` / ${item.capacity} places` : ""}{full ? " · Full" : ""}</dd></div>}</dl>
    <div className="plain-content">{item.description}</div>
    {item.publishedAt && item.status !== "draft" && <p><a className="text-link" href={`/events/${item.id}/calendar.ics`}>{isPreviewMode() ? "Download sample calendar event (.ics)" : item.status === "cancelled" ? "Download updated calendar event (.ics)" : "Add to calendar (.ics)"}</a></p>}
    {isPreviewMode() ? null : item.status === "cancelled" ? <p className="content-notice">This event has been cancelled.</p> : ended ? <p className="content-notice">This event has ended.</p> : item.status !== "published" ? <p className="content-notice">RSVPs open when this event is published.</p> : viewer?.isMember ? <RsvpForm eventId={item.id} current={item.myRsvp} full={full} /> : !configured ? <p className="content-notice">RSVPs will be available once Discord sign-in is configured.</p> : viewer ? <p className="content-notice">Guild membership is required to RSVP. Join the guild in Discord, then sign in again.</p> : <Link className="content-button" href="/login">Sign in with Discord to RSVP</Link>}
    {!isPreviewMode() && viewer?.canPublish && <p><Link className="text-link" href={`/admin/events/${item.id}/edit`}>Edit event</Link></p>}
  </article></ContentShell>;
}
