import { isPreviewMode } from "@/server/website-mode";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getViewer, isAuthConfigured } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { getAnnouncement } from "@/server/services/content";
import { ContentShell, SetupState, ContentUnavailable } from "@/components/content/content-shell";
import { publishedDate, isContentId } from "@/components/content/format";
export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isContentId(id)) notFound();
  const viewer = await getViewer();
  const configured = isAuthConfigured();
  if (!isPreviewMode() && !isDatabaseConfigured()) return <ContentShell viewer={viewer} configured={configured}><SetupState /></ContentShell>;
  let item;
  try { item = await getAnnouncement(id, viewer); } catch { return <ContentShell viewer={viewer} configured={configured}><ContentUnavailable /></ContentShell>; }
  if (!item) notFound();
  return <ContentShell viewer={viewer} configured={configured}><Link className="text-link" href="/announcements">← Announcements</Link><article className="content-card detail-card">
    <div className="content-meta"><span>{isPreviewMode() ? "Sample" : item.visibility === "guild" ? "Guild members" : "Public"}</span>{item.status !== "published" && <span className="status-badge">{item.status}</span>}</div>
    <h1>{item.title}</h1><time dateTime={item.publishedAt ?? item.createdAt}>{publishedDate(item.publishedAt ?? item.createdAt)}</time>
    <div className="plain-content">{item.body}</div>{!isPreviewMode() && viewer?.canPublish && <Link className="content-button secondary" href={`/admin/announcements/${item.id}/edit`}>Edit announcement</Link>}
  </article></ContentShell>;
}
