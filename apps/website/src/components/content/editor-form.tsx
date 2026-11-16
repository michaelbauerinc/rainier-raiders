"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveAnnouncementAction, saveEventAction } from "@/app/actions";
import type { AnnouncementDto, EventDto } from "@/server/services/content";
import { initialActionState } from "./action-state";
import { localDateInput } from "./format";

type Props = { kind: "announcement"; initial?: AnnouncementDto } | { kind: "event"; initial?: EventDto };
export function EditorForm(props: Props) {
  const [state, action, pending] = useActionState(props.kind === "announcement" ? saveAnnouncementAction : saveEventAction, initialActionState);
  const initial = props.initial;
  const defaults: Record<string, string> = {
    title: initial?.title ?? "", visibility: initial?.visibility ?? "guild",
    ...(props.kind === "announcement" ? { body: props.initial?.body ?? "" } : {
      description: props.initial?.description ?? "", timeZone: props.initial?.timeZone ?? "America/Los_Angeles",
      startsAtLocal: props.initial ? localDateInput(props.initial.startsAt, props.initial.timeZone) : "",
      endsAtLocal: props.initial ? localDateInput(props.initial.endsAt, props.initial.timeZone) : "",
      capacity: props.initial?.capacity?.toString() ?? "",
    }),
  };
  const value = (name: string) => state.values[name] ?? defaults[name] ?? "";
  const errors = (name: string) => state.errors[name]?.length ? <span className="field-error" id={`${name}-error`}>{state.errors[name].join(" ")}</span> : null;
  const invalid = (name: string) => ({ "aria-invalid": Boolean(state.errors[name]), "aria-describedby": state.errors[name] ? `${name}-error` : undefined });
  return <form action={action} className="editor-form">
    <input type="hidden" name="id" value={initial?.id ?? ""} />
    <input type="hidden" name="version" value={initial?.version ?? 1} />
    {state.message && <p className="form-feedback" role="alert">{state.message}</p>}
    <fieldset disabled={pending}>
      <legend className="visually-hidden">{props.kind === "announcement" ? "Announcement" : "Event"} details</legend>
      <label htmlFor="title">Title<input id="title" name="title" required maxLength={160} defaultValue={value("title")} {...invalid("title")} />{errors("title")}</label>
      {props.kind === "announcement" ? <label htmlFor="body">Announcement<textarea id="body" name="body" required rows={12} maxLength={20000} defaultValue={value("body")} {...invalid("body")} />{errors("body")}</label> : <>
        <label htmlFor="description">Description<textarea id="description" name="description" required rows={8} maxLength={10000} defaultValue={value("description")} {...invalid("description")} />{errors("description")}</label>
        <div className="form-grid"><label htmlFor="startsAtLocal">Starts<input id="startsAtLocal" name="startsAtLocal" type="datetime-local" required defaultValue={value("startsAtLocal")} {...invalid("startsAtLocal")} />{errors("startsAtLocal")}</label><label htmlFor="endsAtLocal">Ends<input id="endsAtLocal" name="endsAtLocal" type="datetime-local" required defaultValue={value("endsAtLocal")} {...invalid("endsAtLocal")} />{errors("endsAtLocal")}</label></div>
        <div className="form-grid"><label htmlFor="timeZone">Time zone<input id="timeZone" name="timeZone" required list="time-zones" defaultValue={value("timeZone")} {...invalid("timeZone")} /><datalist id="time-zones"><option value="America/Los_Angeles" /><option value="America/New_York" /><option value="Europe/London" /><option value="UTC" /></datalist>{errors("timeZone")}</label><label htmlFor="capacity">Capacity <span className="field-hint">Optional</span><input id="capacity" name="capacity" type="number" min="1" max="1000" step="1" placeholder="No limit" defaultValue={value("capacity")} {...invalid("capacity")} />{errors("capacity")}</label></div>
        <p className="field-hint">Both times use the time zone above. Ambiguous daylight-saving times must be changed to an unambiguous time.</p>
      </>}
      <label htmlFor="visibility">Who can read this?<select id="visibility" name="visibility" defaultValue={value("visibility")} {...invalid("visibility")}><option value="guild">Guild members</option><option value="public">Everyone (public)</option></select>{errors("visibility")}</label>
      <p className="field-hint">Text is published as plain text. Drafts are visible only to editors.</p>
      <div className="form-actions"><button className="content-button secondary" type="submit" name="status" value="draft">{pending ? "Saving…" : "Save draft"}</button><button className="content-button" type="submit" name="status" value="published">{pending ? "Saving…" : initial?.status === "published" ? "Save published changes" : "Publish"}</button><Link className="text-link" href={`/admin/${props.kind === "announcement" ? "announcements" : "events"}`}>Back to list</Link></div>
      {errors("status")}
    </fieldset>
  </form>;
}
