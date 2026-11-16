"use client";
import { useActionState } from "react";
import { rsvpAction } from "@/app/actions";
import { initialActionState } from "./action-state";
import type { RsvpStatus } from "@/features/content/schemas";
export function RsvpForm({ eventId, current, full }: { eventId: string; current: RsvpStatus | null; full: boolean }) {
  const [state, action, pending] = useActionState(rsvpAction, initialActionState);
  return <form action={action} className="rsvp-form"><input type="hidden" name="eventId" value={eventId} /><fieldset disabled={pending}><legend>Your RSVP</legend><div className="form-actions">{([['going', 'Going'], ['maybe', 'Maybe'], ['declined', 'Not going']] as const).map(([status, label]) => <button key={status} type="submit" name="status" value={status} className={`content-button ${current === status ? "" : "secondary"}`} aria-pressed={current === status} disabled={status === "going" && full && current !== "going"}>{pending ? "Saving…" : label}</button>)}</div></fieldset><p aria-live="polite" className={state.success ? "form-success" : "form-feedback"}>{state.message}</p></form>;
}
