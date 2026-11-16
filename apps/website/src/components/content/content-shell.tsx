import { isPreviewMode } from "@/server/website-mode";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Viewer } from "@/server/auth";
import { AuthControls } from "@/components/auth-controls";

export function ContentShell({ children, viewer, configured }: { children: ReactNode; viewer: Viewer | null; configured: boolean }) {
  const preview = isPreviewMode();
  return <div className="content-site">
    <a className="skip-link" href="#content-main">Skip to content</a>
    <header className="site-header content-header">
      <Link href="/" className="wordmark">RAINIER<br />RAIDERS</Link>
      <nav aria-label="Main navigation"><Link href="/announcements">Announcements</Link><Link href="/events">Calendar</Link>{!preview && viewer?.canPublish && <Link href="/admin">Admin</Link>}</nav>
      {preview ? <span className="status-badge">Public preview</span> : <AuthControls user={viewer?.user ?? null} configured={configured} />}
    </header>
    <main id="content-main" className="content-main">{preview && <PreviewNotice />}{children}</main>
    <footer className="site-footer"><Link href="/">RAINIER RAIDERS</Link></footer>
  </div>;
}
export function PreviewNotice() {
  return <p className="content-notice">Public preview · sample announcements and events. Dates are placeholders; this site is read-only.</p>;
}
export function SetupState({ admin = false }: { admin?: boolean }) {
  return <section className="content-notice"><h2>{admin ? "Publishing setup" : "Guild updates"}</h2><p>{admin ? "Connect the database and configure Discord sign-in to enable publishing." : "Guild publishing is being set up. Announcements and events will appear here when it is ready."}</p></section>;
}
export function AccessDenied() {
  return <section className="content-notice"><h1>Editor access required</h1><p>Your Discord account needs a configured guild editor role to manage announcements and events.</p><Link className="content-button" href="/">Back to the guild</Link></section>;
}
export function ContentUnavailable() {
  return <section className="content-notice" role="status"><h2>Updates are temporarily unavailable</h2><p>Please try again shortly.</p></section>;
}
