"use client";

import { useSyncExternalStore } from "react";
import { getPacificDayPhase, type DayPhase } from "./day-phase";

function getSnapshot() {
  return getPacificDayPhase(new Date());
}

// Server markup and the first hydration render use the same deterministic phase.
function getServerSnapshot(): DayPhase {
  return "day";
}

function subscribe(onChange: () => void) {
  let timer: number | undefined;
  function schedule() {
    window.clearTimeout(timer);
    if (document.visibilityState === "hidden") return;
    timer = window.setTimeout(() => {
      onChange();
      schedule();
    }, 60_000 - Date.now() % 60_000);
  }
  function onVisibilityChange() {
    onChange();
    schedule();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  schedule();
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export function useDayPhase() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
