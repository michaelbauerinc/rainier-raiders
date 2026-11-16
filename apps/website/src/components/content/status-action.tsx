"use client";
import { useActionState } from "react";
import { retireContentAction } from "@/app/actions";
import { initialActionState } from "./action-state";
export function StatusAction({ kind, id, version }: { kind: "announcements" | "events"; id: string; version: number }) {
  const [state, action, pending] = useActionState(retireContentAction, initialActionState);
  const verb = kind === "announcements" ? "Archive announcement" : "Cancel event";
  return <details className="retire-content"><summary>{verb}</summary><p>{kind === "announcements" ? "This removes the announcement from readers. Editors can still read it in admin." : "This marks the event as cancelled and stops new RSVPs."}</p><form action={action}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} />
    <button className="content-button danger" disabled={pending}>{pending ? "Saving…" : `Confirm: ${verb.toLowerCase()}`}</button>{state.message && <p role="alert" className="form-feedback">{state.message}</p>}
  </form></details>;
}
