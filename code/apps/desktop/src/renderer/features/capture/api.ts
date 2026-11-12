import { useEffect, useState } from "react";
import type { CaptureBridge, CaptureStatus } from "../../../shared/capture/contract";
import type { CaptureWindowsBridge } from "../../../shared/capture/preload-api";

declare global {
  interface Window {
    speakkitCapture: CaptureBridge & CaptureWindowsBridge;
  }
}

/** The preload's capture bridge (window.speakkitCapture). */
export const capture: CaptureBridge = window.speakkitCapture;

/** The capture status: fetched once, then pushed by the main process after every change. `failed` is true when the first read did not work. */
export function useCapture(): { status: CaptureStatus | null; failed: boolean; retry(): void } {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    capture.status().then(
      (s) => live && setStatus((cur) => cur ?? s),
      () => live && setFailed(true),
    );
    const off = capture.onStatus((s) => setStatus(s));
    return () => {
      live = false;
      off();
    };
  }, [attempt]);
  return { status, failed, retry: () => setAttempt((n) => n + 1) };
}
