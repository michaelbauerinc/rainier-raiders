import { isPreviewMode } from "@/server/website-mode";
import { connection } from "next/server";
import { getViewer, isAuthConfigured } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { listEvents } from "@/server/services/content";
import { ContentShell, SetupState, ContentUnavailable } from "@/components/content/content-shell";
import { EventList } from "@/components/content/content-list";
export default async function Page() {
  await connection();
  const viewer = await getViewer();
  const configured = isAuthConfigured();
  let items: Awaited<ReturnType<typeof listEvents>> | null = null;
  const databaseReady = isPreviewMode() || isDatabaseConfigured();
  if (databaseReady) { try { items = await listEvents(viewer); } catch { items = null; } }
  const content = !databaseReady ? <SetupState /> : items ? <EventList items={items} /> : <ContentUnavailable />;
  return <ContentShell viewer={viewer} configured={configured}><div className="content-heading"><h1>Calendar</h1></div><section className="content-card">{content}</section></ContentShell>;
}
