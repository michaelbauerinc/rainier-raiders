import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { getEvent } from "@/server/services/content";
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
  try { item = await getEvent(id, viewer); } catch { return <ContentUnavailable />; }
  if (!item) notFound();
  const saved = (await searchParams).saved === "1";
  return <><div className="content-heading"><div><p className="eyebrow">{item.status} · {item.visibility === "guild" ? "Guild members" : "Public"}</p><h1>Edit event</h1></div><Link className="text-link" href={`/events/${item.id}`}>Preview</Link></div>{saved && <p className="form-success" role="status">Saved.</p>}<section className="content-card editor-card">{item.status === "cancelled" ? <div><p className="content-notice">This event is cancelled and read-only.</p><div className="plain-content">{item.description}</div><Link className="content-button secondary" href="/admin/events/new">Create a new event</Link></div> : <EditorForm kind="event" initial={item} key={item.version} />}{item.status !== "cancelled" && <StatusAction kind="events" id={item.id} version={item.version} />}</section></>;
}
