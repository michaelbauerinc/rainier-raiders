"use client";

import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const authClient = createAuthClient({ basePath: "/api/auth" });

type AuthControlsProps = {
  user: null | { name: string; image?: string | null };
  configured: boolean;
  variant?: "header" | "login";
};

export function AuthControls({ user, configured, variant = "header" }: AuthControlsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!configured || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/",
        errorCallbackURL: "/login?error=oauth",
      });
      if (result.error) setError("Discord sign-in could not start. Please try again.");
    } catch {
      setError("Discord sign-in is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Sign-out failed. Please try again.");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Sign-out failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-controls">
      {user ? (
        <>
          <span className="auth-user-name">{user.name}</span>
          <button className="auth-button" type="button" onClick={signOut} disabled={pending}>
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </>
      ) : variant === "login" ? (
        <button className="auth-button" type="button" onClick={signIn} disabled={!configured || pending}>
          {pending ? "Connecting…" : "Continue with Discord"}
        </button>
      ) : (
        <Link className="auth-button" href="/login">Login</Link>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
