import Link from "next/link";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { listEvents } from "@/server/services/content";
import { EventList } from "@/components/content/content-list";
import { AccessDenied, SetupState, ContentUnavailable } from "@/components/content/content-shell";
export default async function Page() {
  if (!isDatabaseConfigured()) return <SetupState admin />;
  const viewer = await getViewer();
  if (!viewer?.canPublish) return <AccessDenied />;
  let items;
  try { items = await listEvents(viewer, { includeDrafts: true }); } catch { return <ContentUnavailable />; }
  return <><Link className="text-link" href="/admin">← Admin</Link><div className="content-heading"><h1>Events</h1><Link className="content-button" href="/admin/events/new">New event</Link></div><section className="content-card"><EventList items={items} admin /></section></>;
}
