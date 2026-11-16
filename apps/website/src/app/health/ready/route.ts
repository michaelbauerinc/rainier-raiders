import { isPreviewMode } from "@/server/website-mode";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/server/db";
import { announcements, events } from "@/server/db/app-schema";
import { user } from "@/server/db/auth-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isPreviewMode()) return Response.json({ status: "ready", mode: "preview" }, { headers: { "Cache-Control": "no-store" } });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!isDatabaseConfigured()) throw new Error("Database is not configured.");
    // Resolve the core tables as well as the connection. Respond before the probe's
    // two-second timeout; the pool separately bounds queued and active queries.
    await Promise.race([
      getDb().execute(sql`SELECT 1 FROM ${announcements}, ${events}, ${user} LIMIT 0`),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error("Readiness deadline exceeded.")), 1500);
      }),
    ]);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(deadline);
  }
}
