import { addSample, fractionIn, ZOOM, type FrameRect, type PointerSample } from "../../../shared/capture/zoom";

export interface PointerTrackDeps {
  /** Where the pointer is on the desktop, in device-independent pixels. */
  cursor(): { x: number; y: number };
  now(): number;
  /** False when the input log is off: nothing is noted. */
  enabled(): boolean;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface PointerTrack {
  /** A recording starts on this rectangle of the desktop. */
  start(rect: FrameRect | undefined): void;
  /** The recording now shows another rectangle (a switch of target). */
  move(rect: FrameRect | undefined): void;
  stop(): void;
  /** The samples so far, and a clean track for the next recording. */
  take(): PointerSample[];
}

/**
 * Where the pointer was during a recording, as fractions of the recorded rectangle, a few times a second. Only places and times: never a click,
 * a key or a window name. It notes nothing while the input log is off or while the pointer is outside the recorded rectangle.
 */
export function createPointerTrack(d: PointerTrackDeps): PointerTrack {
  const set = d.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = d.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  let samples: PointerSample[] = [];
  let rect: FrameRect | undefined;
  let startedAt = 0;
  let timer: unknown;
  const sample = () => {
    const p = rect && fractionIn(rect, d.cursor());
    if (p) addSample(samples, { atMs: d.now() - startedAt, ...p });
  };
  return {
    start(r) {
      this.stop();
      samples = [];
      if (!d.enabled()) return;
      [rect, startedAt] = [r, d.now()];
      sample();
      timer = set(sample, ZOOM.sampleEveryMs / 2);
    },
    move(r) {
      if (timer !== undefined) rect = r;
    },
    stop() {
      if (timer !== undefined) clear(timer);
      timer = undefined;
      rect = undefined;
    },
    take() {
      const taken = samples;
      samples = [];
      return taken;
    },
  };
}
