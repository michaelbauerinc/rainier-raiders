import { tzOffset, tzScan } from "@date-fns/tz";
import type { EventInput } from "@/features/content/schemas";
import { ContentError } from "./content-error";

// Resolve all valid instants for the local minute. Reject gaps and overlaps rather
// than silently scheduling a raid at a different time during a DST transition.
export function localDateTimeToInstant(value: string, timeZone: string, label: string): Date {
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const start = new Date(wallTime - 36 * 60 * 60 * 1000);
  const end = new Date(wallTime + 36 * 60 * 60 * 1000);
  const offsets = new Set([tzOffset(timeZone, start), tzOffset(timeZone, end)]);
  for (const change of tzScan(timeZone, { start, end })) offsets.add(change.offset);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const candidates = [...offsets].filter(Number.isFinite).map((offset) => new Date(wallTime - offset * 60_000))
    .filter((date) => {
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === value;
    });
  if (candidates.length === 0) {
    throw new ContentError("VALIDATION", `${label} does not exist in ${timeZone} because of a clock change. Choose another time.`);
  }
  if (candidates.length !== 1) {
    throw new ContentError("VALIDATION", `${label} occurs twice in ${timeZone} because of a clock change. Choose an unambiguous time.`);
  }
  return candidates[0];
}

export function eventInstants(input: EventInput) {
  const startsAt = localDateTimeToInstant(input.startsAtLocal, input.timeZone, "Start time");
  const endsAt = localDateTimeToInstant(input.endsAtLocal, input.timeZone, "End time");
  if (endsAt <= startsAt) throw new ContentError("VALIDATION", "End time must be after start time.");
  if (endsAt.getTime() - startsAt.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new ContentError("VALIDATION", "An event cannot last more than 31 days.");
  }
  return { startsAt, endsAt };
}
