"use server";

import { assertFullWebsite, PreviewReadOnlyError } from "@/server/website-mode";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { announcementInputSchema, eventInputSchema, rsvpStatusSchema } from "@/features/content/schemas";
import { ContentError, createAnnouncement, updateAnnouncement, archiveAnnouncement, createEvent, updateEvent, cancelEvent, setRsvp } from "@/server/services/content";
import type { ActionState } from "@/components/content/action-state";

function fields(data: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, typeof data.get(name) === "string" ? String(data.get(name)) : ""]));
}
function failure(error: unknown, values: Record<string, string>): ActionState {
  if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of error.issues) (errors[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
    return { message: "Check the highlighted fields.", errors, values };
  }
  if (error instanceof PreviewReadOnlyError || error instanceof ContentError || (error instanceof Error && error.name === "AuthError")) {
    return { message: error.message, errors: {}, values };
  }
  return { message: "Unable to save right now. Your changes are still here; please try again.", errors: {}, values };
}
function identity(data: FormData) {
  const id = String(data.get("id") ?? "");
  const version = Number(data.get("version"));
  if (id && (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isSafeInteger(version) || version < 1)) {
    throw new Error("Invalid content identity");
  }
  return { id, version };
}
function refreshContent(kind: "announcements" | "events", id: string) {
  revalidatePath("/");
  revalidatePath(`/${kind}`);
  revalidatePath(`/${kind}/${id}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/${kind}`);
  revalidatePath(`/admin/${kind}/${id}/edit`);
}

export async function saveAnnouncementAction(_previous: ActionState, data: FormData): Promise<ActionState> {
  const values = fields(data, ["title", "body", "visibility", "status"]);
  let id: string;
  try {
    assertFullWebsite();
    const input = announcementInputSchema.parse(values);
    const existing = identity(data);
    // The service obtains the authenticated editor itself on every mutation.
    const item = existing.id ? await updateAnnouncement(existing.id, existing.version, input) : await createAnnouncement(input);
    id = item.id;
  } catch (error) { return failure(error, values); }
  refreshContent("announcements", id);
  redirect(`/admin/announcements/${id}/edit?saved=1`);
}

export async function saveEventAction(_previous: ActionState, data: FormData): Promise<ActionState> {
  const values = fields(data, ["title", "description", "startsAtLocal", "endsAtLocal", "timeZone", "capacity", "visibility", "status"]);
  let id: string;
  try {
    assertFullWebsite();
    const input = eventInputSchema.parse({ ...values, capacity: values.capacity.trim() === "" ? null : Number(values.capacity) });
    const existing = identity(data);
    const item = existing.id ? await updateEvent(existing.id, existing.version, input) : await createEvent(input);
    id = item.id;
  } catch (error) { return failure(error, values); }
  refreshContent("events", id);
  redirect(`/admin/events/${id}/edit?saved=1`);
}

export async function retireContentAction(_previous: ActionState, data: FormData): Promise<ActionState> {
  const kind = data.get("kind");
  let id: string;
  try {
    assertFullWebsite();
    const existing = identity(data);
    if (!existing.id) throw new Error("Missing content identity");
    id = existing.id;
    if (kind === "announcements") await archiveAnnouncement(id, existing.version);
    else if (kind === "events") await cancelEvent(id, existing.version);
    else throw new Error("Invalid content kind");
  } catch (error) { return failure(error, {}); }
  refreshContent(kind as "announcements" | "events", id);
  redirect(`/admin/${kind}?updated=1`);
}

export async function rsvpAction(_previous: ActionState, data: FormData): Promise<ActionState> {
  try {
    assertFullWebsite();
    const id = String(data.get("eventId") ?? "");
    const status = rsvpStatusSchema.parse(data.get("status"));
    await setRsvp(id, status);
    refreshContent("events", id);
    return { message: "Your RSVP is saved.", errors: {}, values: {}, success: true };
  } catch (error) { return failure(error, {}); }
}
