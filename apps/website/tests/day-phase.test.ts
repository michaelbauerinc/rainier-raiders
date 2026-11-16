import { describe, expect, it } from "vitest";
import { getPacificDayPhase } from "../src/components/scene/day-phase";

describe("Pacific scene time", () => {
  it.each([
    ["2026-11-16T13:59:59Z", "night"],
    ["2026-11-16T14:00:00Z", "morning"],
    ["2026-11-16T17:59:59Z", "morning"],
    ["2026-11-16T18:00:00Z", "day"],
    ["2026-11-17T01:59:59Z", "day"],
    ["2026-11-17T02:00:00Z", "night"],
    ["2026-11-17T08:00:00Z", "night"],
  ])("maps %s to %s using Pacific time, not the UTC date", (instant, phase) => {
    expect(getPacificDayPhase(new Date(instant))).toBe(phase);
  });

  it.each([
    ["2027-03-13T14:00:00Z", "morning"],
    ["2027-03-14T09:59:59Z", "night"],
    ["2027-03-14T10:00:00Z", "night"],
    ["2027-03-14T13:00:00Z", "morning"],
    ["2027-11-06T13:00:00Z", "morning"],
    ["2027-11-07T08:59:59Z", "night"],
    ["2027-11-07T09:00:00Z", "night"],
    ["2027-11-07T13:59:59Z", "night"],
    ["2027-11-07T14:00:00Z", "morning"],
  ])("handles daylight-saving offset changes at %s", (instant, phase) => {
    expect(getPacificDayPhase(new Date(instant))).toBe(phase);
  });
});
