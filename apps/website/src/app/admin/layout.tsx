import type { ReactNode } from "react";
import { connection } from "next/server";
import { isPreviewMode } from "@/server/website-mode";
import { notFound, redirect } from "next/navigation";
import { getViewer, isAuthConfigured } from "@/server/auth";
import { isDatabaseConfigured } from "@/server/db";
import { ContentShell, SetupState, AccessDenied } from "@/components/content/content-shell";
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  if (isPreviewMode()) notFound();
  const configured = isAuthConfigured();
  const viewer = await getViewer();
  if (!configured || !isDatabaseConfigured()) return <ContentShell viewer={viewer} configured={configured}><SetupState admin /></ContentShell>;
  if (!viewer) redirect("/login");
  return <ContentShell viewer={viewer} configured={configured}>{viewer.canPublish ? children : <AccessDenied />}</ContentShell>;
}
