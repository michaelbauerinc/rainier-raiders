import { isPreviewMode } from "@/server/website-mode";
import Link from "next/link";
import type { AnnouncementDto, EventDto } from "@/server/services/content";
import { eventDate, publishedDate } from "./format";

export function AnnouncementList({ items, admin = false }: { items: AnnouncementDto[]; admin?: boolean }) {
  if (!items.length) return <p className="content-empty">No announcements yet.</p>;
  return <ul className="content-list">{items.map((item) => <li key={item.id}>
    <div className="content-meta"><span>{isPreviewMode() ? "Sample" : item.visibility === "guild" ? "Guild members" : "Public"}</span>{admin && <span className={`status-badge status-${item.status}`}>{item.status}</span>}</div>
    <h3><Link href={admin ? `/admin/announcements/${item.id}/edit` : `/announcements/${item.id}`}>{item.title}</Link></h3>
    <p className="content-excerpt">{item.body.length > 160 ? `${item.body.slice(0, 160)}…` : item.body}</p>
    <time dateTime={item.publishedAt ?? item.createdAt}>{publishedDate(item.publishedAt ?? item.createdAt)}</time>
  </li>)}</ul>;
}
export function EventList({ items, admin = false }: { items: EventDto[]; admin?: boolean }) {
  if (!items.length) return <p className="content-empty">No events scheduled yet.</p>;
  return <ul className="content-list">{items.map((item) => <li key={item.id}>
    <div className="content-meta"><span>{isPreviewMode() ? "Sample" : item.visibility === "guild" ? "Guild members" : "Public"}</span>{(admin || item.status === "cancelled") && <span className={`status-badge status-${item.status}`}>{item.status}</span>}</div>
    <h3><Link href={admin ? `/admin/events/${item.id}/edit` : `/events/${item.id}`}>{item.title}</Link></h3>
    <time dateTime={item.startsAt}>{eventDate(item.startsAt, item.timeZone)}</time>
    {!isPreviewMode() && <p className="content-excerpt">{item.goingCount} going{item.capacity !== null ? ` · ${item.capacity} places` : ""}</p>}
  </li>)}</ul>;
}
