import { notFound } from "next/navigation";
import { isPreviewMode } from "@/server/website-mode";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { getViewer, isAuthConfigured } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (isPreviewMode()) notFound();
  const configured = isAuthConfigured();
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);

  return (
    <main className="content-page login-page">
      <Link className="back-link" href="/">← Rainier Raiders</Link>
      <section className="content-card login-card" aria-labelledby="login-title">
        <h1 id="login-title">Login</h1>
        {!configured ? (
          <p>Discord sign-in is not set up yet.</p>
        ) : viewer ? (
          <p>{viewer.isMember ? "You are signed in." : "This account does not currently have verified guild access."}</p>
        ) : (
          <p>Use your Discord account to access the guild.</p>
        )}
        {params.error && <p role="alert">Discord sign-in was not completed. Please try again.</p>}
        <AuthControls user={viewer?.user ?? null} configured={configured} variant="login" />
        {viewer?.canPublish && <Link className="text-link" href="/admin">Open admin</Link>}
      </section>
    </main>
  );
}
