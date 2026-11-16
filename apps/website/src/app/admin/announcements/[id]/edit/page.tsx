import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { getAnnouncement } from "@/server/services/content";
import { EditorForm } from "@/components/content/editor-form";
import { StatusAction } from "@/components/content/status-action";
import { AccessDenied, SetupState, ContentUnavailable } from "@/components/content/content-shell";
import { isContentId } from "@/components/content/format";
export default async function Page({ params, searchParams }: { params: Promise<{id: string}>; searchParams: Promise<{saved?: string}> }) {
  const { id } = await params;
  if (!isContentId(id)) notFound();
  if (!isDatabaseConfigured()) return <SetupState admin />;
  const viewer = await getViewer();
  if (!viewer?.canPublish) return <AccessDenied />;
  let item;
  try { item = await getAnnouncement(id, viewer); } catch { return <ContentUnavailable />; }
  if (!item) notFound();
  const saved = (await searchParams).saved === "1";
  return <><div className="content-heading"><div><p className="eyebrow">{item.status} · {item.visibility === "guild" ? "Guild members" : "Public"}</p><h1>Edit announcement</h1></div><Link className="text-link" href={`/announcements/${item.id}`}>Preview</Link></div>{saved && <p className="form-success" role="status">Saved.</p>}<section className="content-card editor-card">{item.status === "archived" ? <div><p className="content-notice">This announcement is archived and read-only.</p><div className="plain-content">{item.body}</div><Link className="content-button secondary" href="/admin/announcements/new">Create a new announcement</Link></div> : <EditorForm kind="announcement" initial={item} key={item.version} />}{item.status !== "archived" && <StatusAction kind="announcements" id={item.id} version={item.version} />}</section></>;
}
