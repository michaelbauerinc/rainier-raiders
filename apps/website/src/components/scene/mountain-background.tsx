"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useState, type ReactNode } from "react";
import { useDayPhase } from "./use-day-phase";

const RainierScene = dynamic(() => import("./rainier-scene"), { ssr: false });

class SceneBoundary extends Component<
  { children: ReactNode; onError: (reason?: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || "Scene runtime error");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MountainBackground({
  weather,
  paused,
}: {
  weather: "clear" | "snow" | "rain";
  paused: boolean;
}) {
  const dayPhase = useDayPhase();
  const [ready, setReady] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const failed = failureReason !== null;
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback((reason?: string) => setFailureReason(reason || "Scene runtime error"), []);

  return (
    <>
      <div className="mountain-backdrop" data-time-of-day={dayPhase} aria-hidden="true">
        <div className="scene-poster" />
        {!failed && (
          <div className={`canvas-layer ${ready ? "is-ready" : ""}`}>
            <SceneBoundary onError={onError}>
              <RainierScene dayPhase={dayPhase} weather={weather} paused={paused} onReady={onReady} onError={onError} />
            </SceneBoundary>
          </div>
        )}
        <div className="scene-vignette" />
      </div>
      {failed && (
        <p
          className="scene-unavailable"
          role="status"
          data-scene-error={process.env.NODE_ENV === "development" ? failureReason : undefined}
        >
          Animated background unavailable
        </p>
      )}
    </>
  );
}
