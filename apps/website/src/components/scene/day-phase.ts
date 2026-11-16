export type DayPhase = "morning" | "day" | "night";

const pacificHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23",
});

export function getPacificDayPhase(instant: Date): DayPhase {
  const hour = Number(pacificHour.format(instant));
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 10 && hour < 18) return "day";
  return "night";
}
