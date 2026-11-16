type AuthHttpService = { handler: (request: Request) => Promise<Response> };

/** Keep the public auth surface narrower than the trusted server-side library API. */
export function createAuthHttpHandler(resolveAuth: () => AuthHttpService | null) {
  const headers = { "Cache-Control": "private, no-store" };

  return async function handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const allowed = request.method === "GET"
      ? ["/api/auth/callback/discord", "/api/auth/error"].includes(path)
      : request.method === "POST" && ["/api/auth/sign-in/social", "/api/auth/sign-out"].includes(path);
    // Provider-token, account-management and session-token APIs are server-only for this app.
    if (!allowed) return Response.json({ error: "Not found." }, { status: 404, headers });

    try {
      const auth = resolveAuth();
      if (!auth) return Response.json({ error: "Discord sign-in is not configured yet." }, { status: 503, headers });
      let authRequest = request;
      if (path === "/api/auth/sign-in/social") {
        let body: unknown;
        try { body = await request.json(); } catch {
          return Response.json({ error: "Invalid sign-in request." }, { status: 400, headers });
        }
        if (!body || typeof body !== "object" || !("provider" in body) || body.provider !== "discord") {
          return Response.json({ error: "Invalid sign-in request." }, { status: 400, headers });
        }
        const requestHeaders = new Headers(request.headers);
        requestHeaders.delete("content-length");
        requestHeaders.set("content-type", "application/json");
        // Fixed provider, scopes (in server config), and callback destinations. Never accept
        // browser-supplied provider tokens, additional scopes, or arbitrary redirect URLs.
        authRequest = new Request(request, {
          headers: requestHeaders,
          body: JSON.stringify({ provider: "discord", callbackURL: "/", errorCallbackURL: "/login?error=oauth" }),
        });
      }
      const response = await auth.handler(authRequest);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch {
      return Response.json({ error: "Discord sign-in is temporarily unavailable." }, { status: 503, headers });
    }
  }

}
