import { NextResponse, type NextRequest } from "next/server";
import { isPreviewMode } from "@/server/website-mode";

export function proxy(request: NextRequest) {
  if (!isPreviewMode()) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (["/login", "/admin", "/api/auth"].some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return new NextResponse("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  // Server Actions can be posted to public pages, not just /admin.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("This public preview is read-only.", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
