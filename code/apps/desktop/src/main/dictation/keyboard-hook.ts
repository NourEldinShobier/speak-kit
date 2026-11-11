import { createChordTracker, type ChordTracker } from "./chord-tracker";
import type { Chord, HotkeyEvent, HotkeyHandlers, HotkeySource, HotkeyStart, VirtualKey } from "./types";

export interface HookKey {
  vk: VirtualKey;
  /** KBDLLHOOKSTRUCT flags. */
  flags: number;
  /** dwExtraInfo of the event. */
  extra: number;
  down: boolean;
}

export interface InstalledHook {
  uninstall(): void;
}

/** The operating system side of the hotkey: one low-level hook and the real keyboard state. */
export interface HookBackend {
  /** `onKey` runs inside the hook callback and returns whether to swallow the key. Throws when the system refuses the hook. */
  install(onKey: (key: HookKey) => boolean, onFault: (error: unknown) => void): InstalledHook;
  keyIsDown(vk: VirtualKey): boolean;
}

interface Options {
  /** `dwExtraInfo` of key events this app injected itself; the hook ignores them. */
  marker: number;
  pollMs?: number;
  /** A gap this long between two polls means the event loop was blocked, so Windows may have dropped the hook. */
  stallMs?: number;
  now?: () => number;
}

interface Run {
  tracker: ChordTracker;
  handlers: HotkeyHandlers;
  hook: InstalledHook | null;
  timer: NodeJS.Timeout | undefined;
  beat: number;
}

const LLKHF_INJECTED = 0x10;

/**
 * The global hotkey. The hook callback only feeds the chord tracker and returns its answer; handlers run on the next turn of the event loop,
 * so nothing a handler does can hold up the keyboard. A 100 ms timer does two jobs: it releases a chord key that is up on the real keyboard
 * while the hook never saw the release (secure desktop, lock screen), and it reinstalls the hook after the event loop was blocked long enough
 * for Windows to have silently removed it. Keys the hook swallowed cannot be checked that way (the system never records them), so for those
 * `resync` and the caller's own hard limit are the safety net.
 */
export class KeyboardHook implements HotkeySource {
  readonly #backend: HookBackend;
  readonly #marker: number;
  readonly #pollMs: number;
  readonly #stallMs: number;
  readonly #now: () => number;
  #run: Run | null = null;
  #grabbed: readonly VirtualKey[] = [];

  constructor(backend: HookBackend, { marker, pollMs = 100, stallMs = 250, now = Date.now }: Options) {
    this.#backend = backend;
    this.#marker = marker;
    this.#pollMs = pollMs;
    this.#stallMs = stallMs;
    this.#now = now;
  }

  get active(): boolean {
    return this.#run !== null;
  }

  start(chord: Chord, handlers: HotkeyHandlers): HotkeyStart {
    if (this.#run) return { ok: false, reason: "already-running" };
    const r: Run = { tracker: createChordTracker(chord), handlers, hook: null, timer: undefined, beat: this.#now() };
    r.tracker.grab(this.#grabbed);
    try {
      r.hook = this.#install(r);
    } catch {
      return { ok: false, reason: "hook-failed" };
    }
    r.timer = setInterval(() => this.#watch(r), this.#pollMs);
    this.#run = r;
    return { ok: true };
  }

  stop(): void {
    const r = this.#run;
    if (!r) return;
    this.#run = null;
    clearInterval(r.timer);
    r.hook?.uninstall();
  }

  grab(keys: readonly VirtualKey[]): void {
    this.#grabbed = keys;
    this.#run?.tracker.grab(keys);
  }

  resync(): void {
    if (this.#run) this.#emit(this.#run, this.#run.tracker.reset());
  }

  #emit(r: Run, events: HotkeyEvent[]): void {
    if (events.length === 0) return;
    setImmediate(() => {
      if (this.#run === r) for (const e of events) r.handlers.onEvent(e);
    });
  }

  #fail(r: Run, error: unknown): void {
    if (this.#run === r) {
      this.#run = null;
      clearInterval(r.timer);
    }
    r.handlers.onFault?.(error);
  }

  #install(r: Run): InstalledHook {
    return this.#backend.install(
      (k) => {
        if (k.extra === this.#marker && (k.flags & LLKHF_INJECTED) !== 0) return false;
        const decision = r.tracker.feed({ vk: k.vk, down: k.down });
        this.#emit(r, decision.events);
        return decision.swallow;
      },
      (error) => this.#fail(r, error),
    );
  }

  #watch(r: Run): void {
    const t = this.#now();
    const stalled = t - r.beat > this.#stallMs;
    r.beat = t;
    if (stalled) {
      r.hook?.uninstall();
      try {
        r.hook = this.#install(r);
      } catch (error) {
        this.#fail(r, error);
        return;
      }
      // Key events that arrived during the stall may have been dropped, including the release of the chord.
      this.#emit(r, r.tracker.reset());
    }
    for (const vk of r.tracker.visibleHeld()) if (!this.#backend.keyIsDown(vk)) this.#emit(r, r.tracker.release(vk));
  }
}

export const createKeyboardHook = (backend: HookBackend, options: Options): KeyboardHook => new KeyboardHook(backend, options);
