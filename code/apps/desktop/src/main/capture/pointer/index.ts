import { addClick, addSample, fractionIn, ZOOM, type FrameRect, type PointerSample } from "../../../shared/capture/zoom";

export interface PointerTrackDeps {
  /** Where the pointer is on the desktop, in device-independent pixels. */
  cursor(): { x: number; y: number };
  now(): number;
  /** False when the input log is off: nothing is noted. */
  enabled(): boolean;
  /** Calls back at each left click while the track runs; gives the function that stops it. Missing where clicks cannot be seen. */
  clicks?(onClick: () => void): () => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface PointerTrack {
  /** A recording starts on this rectangle of the desktop; `current` reads where that rectangle is now, for a window that can be moved. */
  start(rect: FrameRect | undefined, current?: () => FrameRect | undefined): void;
  /** The recording now shows another rectangle (a switch of target). */
  move(rect: FrameRect | undefined, current?: () => FrameRect | undefined): void;
  stop(): void;
  /** The samples so far, and a clean track for the next recording. */
  take(): PointerSample[];
}

/** The window call may throw while a window closes; that counts as not found. */
const safely = (f: (() => FrameRect | undefined) | undefined): FrameRect | undefined => {
  try {
    return f?.();
  } catch {
    return undefined;
  }
};

/**
 * Where the pointer was during a recording, as fractions of the recorded rectangle, a few times a second. Only places and times (a click is a place and a time too): never a key, what was clicked
 * or a window name. It notes nothing while the input log is off or while the pointer is outside the recorded rectangle.
 */
export function createPointerTrack(d: PointerTrackDeps): PointerTrack {
  const set = d.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = d.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  let samples: PointerSample[] = [];
  let rect: FrameRect | undefined;
  let current: (() => FrameRect | undefined) | undefined;
  let startedAt = 0;
  let timer: unknown;
  let stopClicks: (() => void) | undefined;
  /** The rectangle as it is now; a window that moved is followed, one that cannot be found keeps its last place. */
  const where = () => (rect = safely(current) ?? rect);
  const click = () => {
    const p = where() && fractionIn(rect!, d.cursor());
    if (p) addClick(samples, { atMs: d.now() - startedAt, ...p });
  };
  const sample = () => {
    const p = where() && fractionIn(rect!, d.cursor());
    if (p) addSample(samples, { atMs: d.now() - startedAt, ...p });
  };
  return {
    start(r, now) {
      this.stop();
      samples = [];
      if (!d.enabled()) return;
      [rect, current, startedAt] = [r, now, d.now()];
      sample();
      timer = set(sample, ZOOM.sampleEveryMs / 2);
      stopClicks = d.clicks?.(click);
    },
    move(r, now) {
      if (timer === undefined) return;
      [rect, current] = [r, now];
    },
    stop() {
      if (timer !== undefined) clear(timer);
      timer = undefined;
      stopClicks?.();
      stopClicks = undefined;
      rect = current = undefined;
    },
    take() {
      const taken = samples;
      samples = [];
      return taken;
    },
  };
}
