import { isPreviewMode } from "@/server/website-mode";
import { getAuth } from "@/server/auth";
import { createAuthHttpHandler } from "@/server/auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = createAuthHttpHandler(getAuth);
export async function GET(request: Request) {
  if (isPreviewMode()) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return handle(request);
}
export const POST = GET;
