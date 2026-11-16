import { z } from "zod";

export const visibilitySchema = z.enum(["public", "guild"]);
export const rsvpStatusSchema = z.enum(["going", "maybe", "declined"]);

function textField(label: string, maximum: number) {
  return z.string().trim().min(1, `${label} is required.`).max(maximum)
    .refine((value) => !value.includes("\0"), `${label} contains an invalid character.`);
}

export function isValidTimeZone(value: string) {
  if (value !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
}

const localDateTimeSchema = z.string().refine(
  isValidLocalDateTime,
  "Enter a valid local date and time between 2000 and 2100.",
);

export const announcementInputSchema = z.object({
  title: textField("Title", 160),
  body: textField("Announcement", 20_000),
  visibility: visibilitySchema,
  status: z.enum(["draft", "published"]),
}).strict();

export const eventInputSchema = z.object({
  title: textField("Title", 160),
  description: textField("Description", 10_000),
  startsAtLocal: localDateTimeSchema,
  endsAtLocal: localDateTimeSchema,
  timeZone: z.string().trim().max(100).refine(isValidTimeZone, "Choose a valid IANA timezone."),
  capacity: z.number().int().min(1).max(1000).nullable(),
  visibility: visibilitySchema,
  status: z.enum(["draft", "published"]),
}).strict();

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;
