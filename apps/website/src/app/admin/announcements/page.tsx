import Link from "next/link";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { listAnnouncements } from "@/server/services/content";
import { AnnouncementList } from "@/components/content/content-list";
import { AccessDenied, SetupState, ContentUnavailable } from "@/components/content/content-shell";
export default async function Page() {
  if (!isDatabaseConfigured()) return <SetupState admin />;
  const viewer = await getViewer();
  if (!viewer?.canPublish) return <AccessDenied />;
  let items;
  try { items = await listAnnouncements(viewer, { includeDrafts: true }); } catch { return <ContentUnavailable />; }
  return <><Link className="text-link" href="/admin">← Admin</Link><div className="content-heading"><h1>Announcements</h1><Link className="content-button" href="/admin/announcements/new">New announcement</Link></div><section className="content-card"><AnnouncementList items={items} admin /></section></>;
}
