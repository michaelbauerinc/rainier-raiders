"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { MountainBackground } from "@/components/scene/mountain-background";

function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getMotionPreference() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GuildHome({ announcementContent, eventContent, authControls, adminAllowed }: { announcementContent: ReactNode; eventContent: ReactNode; authControls: ReactNode; adminAllowed: boolean }) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToMotion,
    getMotionPreference,
    () => true,
  );

  return (
    <div className="guild-site">
      <MountainBackground weather="snow" paused={prefersReducedMotion} />
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Rainier Raiders home">
          <svg viewBox="0 0 64 64" shapeRendering="crispEdges" aria-hidden="true">
            <path fill="#193e85" d="M0 0h64v64H0z" />
            <path fill="#347fc4" d="M0 31h64v33H0z" />
            <path fill="#88d8dd" d="M0 41h64v23H0z" />
            <path fill="#f5f4d7" d="M50 8h5v1h2v2h1v5h-1v2h-2v1h-5v-1h-2v-2h-1v-5h1V9h2z" />
            <path fill="#a4dbea" d="M54 11h2v5h-2v1h-2v-2h2z" />
            <path fill="#a4dbea" d="M9 11h1v1H9zm13 7h1v1h-1zm17-9h1v1h-1z" />
            <path fill="#347fc4" d="M0 48h4v-3h3v-4h3v-3h3v3h3v3h3v3h4v17H0zm44 0h4v-3h4v-4h3v3h3v3h6v17H44z" />
            <path fill="#5899c6" d="M5 56h3v-3h3v-4h3v-4h2v-4h2v-3h2v-4h2v-3h2v-4h3v-3h2v-4h3v-3h6v2h3v3h2v3h3v4h2v4h3v4h2v4h3v4h2v4h3v4h3v11H5z" />
            <path fill="#347fc4" d="M36 20h3v3h3v4h3v4h2v4h3v4h2v4h3v4h2v5h4v9H36v-9h-3v-8h2v-6h-2v-7h3z" />
            <path fill="#f5f4d7" d="M18 40h2v-6h2v-3h2v-4h3v-3h2v-4h3v-3h6v2h3v3h2v3h3v4h2v4h3v4h-3v-3h-3v-3h-3v2h-2v-5h-3v3h-3v-2h-3v4h-3v-2h-2v5h-3v4h-2v3h-3z" />
            <path fill="#a4dbea" d="M31 25h2v5h-2v5h-3v4h-2v4h-3v4h-3v-3h2v-5h3v-5h3v-4h3zm6 7h2v4h3v6h2v5h3v6h-3v-4h-3v-6h-2v-4h-2z" />
            <path fill="#28639a" d="M32 37h2v5h-2v5h2v5h2v7h-5v-6h-3v-6h2v-5h2z" />
            <path fill="#15505d" d="M0 55h7v-2h6v2h6v3h7v-2h7v3h8v-3h6v-3h7v-2h6v2h4v11H0z" />
            <path fill="#216952" d="M0 60h9v-2h7v2h10v2h12v-2h10v-2h8v2h8v4H0z" />
          </svg>
          <span>RAINIER<span>RAIDERS</span></span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#announcements">Announcements</a>
          <a href="#calendar">Calendar</a>
          {adminAllowed && <Link href="/admin">Admin</Link>}
        </nav>
        {authControls}
      </header>

      <main id="main">
        <section className="scene-hero" aria-labelledby="guild-name">
          <div className="hero-type">
            <div className="hero-rule" aria-hidden="true"><span /><span /></div>
            <h1 id="guild-name"><span>RAINIER</span><span>RAIDERS</span></h1>
            <div className="title-underline" aria-hidden="true" />
          </div>
          <div className="mountain-caption"><span aria-hidden="true" /> MOUNT RAINIER</div>
        </section>

        <div className="guild-panels">
          <section className="guild-panel" id="announcements" aria-labelledby="announcements-heading">
            <div className="panel-heading"><span className="panel-index" aria-hidden="true">01</span><h2 id="announcements-heading">Announcements</h2><span className="panel-cross" aria-hidden="true" /></div>
            {announcementContent}<Link className="text-link panel-more" href="/announcements">All announcements →</Link>
          </section>
          <section className="guild-panel" id="calendar" aria-labelledby="calendar-heading">
            <div className="panel-heading"><span className="panel-index" aria-hidden="true">02</span><h2 id="calendar-heading">Calendar</h2><span className="panel-cross" aria-hidden="true" /></div>
            {eventContent}<Link className="text-link panel-more" href="/events">Full calendar →</Link>
          </section>
        </div>
      </main>
      <footer className="site-footer"><span>RAINIER RAIDERS</span><span aria-hidden="true"><i /><i /><i /></span></footer>
    </div>
  );
}
