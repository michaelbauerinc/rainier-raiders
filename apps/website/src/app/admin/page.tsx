import Link from "next/link";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { listAnnouncements, listEvents } from "@/server/services/content";
import { AnnouncementList, EventList } from "@/components/content/content-list";
import { AccessDenied, SetupState, ContentUnavailable } from "@/components/content/content-shell";
export default async function AdminPage() {
  if (!isDatabaseConfigured()) return <SetupState admin />;
  const viewer = await getViewer();
  if (!viewer?.canPublish) return <AccessDenied />;
  let announcements, events;
  try { [announcements, events] = await Promise.all([listAnnouncements(viewer, { includeDrafts: true }), listEvents(viewer, { includeDrafts: true })]); }
  catch { return <ContentUnavailable />; }
  return <><div className="content-heading"><div><p className="eyebrow">Guild publishing</p><h1>Admin</h1></div><Link className="text-link" href="/">View website</Link></div><div className="admin-grid">
    <section className="content-card"><div className="section-toolbar"><h2>Announcements</h2><Link className="content-button" href="/admin/announcements/new">New announcement</Link></div><AnnouncementList items={announcements.slice(0, 5)} admin /><Link className="text-link" href="/admin/announcements">All announcements →</Link></section>
    <section className="content-card"><div className="section-toolbar"><h2>Events</h2><Link className="content-button" href="/admin/events/new">New event</Link></div><EventList items={events.slice(0, 5)} admin /><Link className="text-link" href="/admin/events">All events →</Link></section>
  </div></>;
}
