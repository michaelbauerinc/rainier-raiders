import { isPreviewMode } from "@/server/website-mode";
import { connection } from "next/server";
import { GuildHome } from "@/components/guild-home";
import { AuthControls } from "@/components/auth-controls";
import { AnnouncementList, EventList } from "@/components/content/content-list";
import { SetupState, ContentUnavailable, PreviewNotice } from "@/components/content/content-shell";
import { getViewer, isAuthConfigured } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { listAnnouncements, listEvents } from "@/server/services/content";

export default async function Home() {
  await connection();
  const viewer = await getViewer();
  let announcementContent;
  let eventContent;
  if (!isPreviewMode() && !isDatabaseConfigured()) {
    announcementContent = <SetupState />;
    eventContent = <p className="content-empty">The guild calendar will appear when publishing is ready.</p>;
  } else {
    let data: [Awaited<ReturnType<typeof listAnnouncements>>, Awaited<ReturnType<typeof listEvents>>] | null = null;
    try { data = await Promise.all([listAnnouncements(viewer, { limit: 5 }), listEvents(viewer, { limit: 5, upcomingOnly: true })]); }
    catch { data = null; }
    announcementContent = data ? <>{isPreviewMode() && <PreviewNotice />}<AnnouncementList items={data[0]} /></> : <ContentUnavailable />;
    eventContent = data ? <EventList items={data[1]} /> : <p className="content-empty">The calendar is temporarily unavailable.</p>;
  }
  return <GuildHome announcementContent={announcementContent} eventContent={eventContent} adminAllowed={!isPreviewMode() && Boolean(viewer?.canPublish)} authControls={isPreviewMode() ? <span className="status-badge">Public preview</span> : <AuthControls user={viewer?.user ?? null} configured={isAuthConfigured()} />} />;
}
