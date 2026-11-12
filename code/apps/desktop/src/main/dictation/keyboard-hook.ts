import { createChordTracker, type ChordTracker } from "./chord-tracker";
import { EXTENDED, type Chord, type HotkeyEvent, type HotkeyHandlers, type HotkeySource, type HotkeyStart, type VirtualKey } from "./types";

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

/** A mouse button change as the low-level mouse hook reports it, already reduced to a virtual-key code (right 0x02, middle 0x04, X1 0x05, X2 0x06, left 0x01). Moves and the wheel never get here. */
export interface HookClick {
  vk: VirtualKey;
  down: boolean;
  extra: number;
  flags: number;
}

/** The operating system side of the hotkey: one low-level hook and the real keyboard state. */
export interface HookBackend {
  /** `onKey` runs inside the hook callback and returns whether to swallow the key. Throws when the system refuses the hook. */
  install(onKey: (key: HookKey) => boolean, onFault: (error: unknown) => void): InstalledHook;
  keyIsDown(vk: VirtualKey): boolean;
  /** Presses and releases a key no program uses, tagged as this app's own input. */
  injectMask?(): void;
  /** The mouse hook; absent where the platform has none. */
  installMouse?(onClick: (click: HookClick) => boolean, onFault: (error: unknown) => void): InstalledHook;
}

interface Options {
  /** `dwExtraInfo` of key events this app injected itself; the hook ignores them. */
  marker: number;
  pollMs?: number;
  /** A gap this long between two polls means the event loop was blocked, so Windows may have dropped the hook. */
  stallMs?: number;
  /** How often the hook is checked against the physical keyboard. */
  healthMs?: number;
  /** After a click or key ends a double-tap window the mouse hook is no longer needed this long after the last chord release. */
  clickWatchMs?: number;
  now?: () => number;
}

interface Run {
  trackers: Map<string, ChordTracker>;
  handlers: HotkeyHandlers;
  hook: InstalledHook | null;
  mouse: InstalledHook | null;
  timer: NodeJS.Timeout | undefined;
  beat: number;
  lastHealth: number;
  clickUntil: number;
}

const LLKHF_INJECTED = 0x10;
const LLKHF_EXTENDED = 0x01;
const PRIMARY = "";
/** Keys that share their code with a numpad key: only the dedicated one (extended flag) is Home, End, Page Up, Page Down. */
const NAV = new Set([0x21, 0x22, 0x23, 0x24]);
const MOUSE_VKS: ReadonlySet<number> = new Set([0x02, 0x04, 0x05, 0x06]);

/** The code the chord tracker sees for a key: dedicated navigation keys get the extended offset. */
export const trackerCode = (vk: VirtualKey, flags: number): VirtualKey => (NAV.has(vk) && (flags & LLKHF_EXTENDED) !== 0 ? vk + EXTENDED : vk);

/**
 * The global hotkeys. The hook callback only feeds the chord trackers and returns their answer; handlers run on the next turn of the event loop,
 * so nothing a handler does can hold up the keyboard. A 100 ms timer does two jobs: it releases a chord key that is up on the real keyboard
 * while the hook never saw the release (secure desktop, lock screen), and it reinstalls the hook after the event loop was blocked long enough
 * for Windows to have silently removed it. Every few seconds a health check compares the real keyboard with what the hook has seen and reinstalls
 * it when a chord key is down on the keyboard but unknown here. Keys the hook swallowed cannot be checked that way (the system never records them), so for those
 * `resync` and the caller's own hard limit are the safety net.
 * The mouse hook exists only while a mouse button is part of a chord, and briefly after a chord release so a click can end a double-tap window.
 */
export class KeyboardHook implements HotkeySource {
  readonly #backend: HookBackend;
  readonly #marker: number;
  readonly #pollMs: number;
  readonly #stallMs: number;
  readonly #healthMs: number;
  readonly #clickWatchMs: number;
  readonly #now: () => number;
  #run: Run | null = null;
  #primary: Chord | null = null;
  #extra: Readonly<Record<string, Chord>> = {};
  #grabbed: readonly VirtualKey[] = [];

  constructor(backend: HookBackend, { marker, pollMs = 100, stallMs = 250, healthMs = 5000, clickWatchMs = 800, now = Date.now }: Options) {
    this.#backend = backend;
    this.#marker = marker;
    this.#pollMs = pollMs;
    this.#stallMs = stallMs;
    this.#healthMs = healthMs;
    this.#clickWatchMs = clickWatchMs;
    this.#now = now;
  }

  get active(): boolean {
    return this.#run !== null;
  }

  get mouse(): boolean {
    return this.#backend.installMouse !== undefined;
  }

  anyKeyDown(): boolean {
    for (let vk = 1; vk < 0xff; vk++) if (vk !== 0x14 && vk !== 0x90 && vk !== 0x91 && this.#backend.keyIsDown(vk)) return true;
    return false;
  }

  start(chord: Chord, handlers: HotkeyHandlers): HotkeyStart {
    if (this.#run) return { ok: false, reason: "already-running" };
    this.#primary = chord;
    const r: Run = { trackers: new Map(), handlers, hook: null, mouse: null, timer: undefined, beat: this.#now(), lastHealth: this.#now(), clickUntil: 0 };
    this.#build(r);
    try {
      r.hook = this.#install(r);
      this.#syncMouse(r);
    } catch {
      r.hook?.uninstall();
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
    r.mouse?.uninstall();
  }

  grab(keys: readonly VirtualKey[]): void {
    this.#grabbed = keys;
    this.#run?.trackers.get(PRIMARY)?.grab(keys);
  }

  setExtraChords(chords: Readonly<Record<string, Chord>>): void {
    this.#extra = chords;
    const r = this.#run;
    if (!r) return;
    this.#build(r);
    this.#syncMouse(r);
  }

  /** Rebuilds what is believed down from the physical keyboard (after a lock, wake or desktop switch). Never reports a press. */
  resync(): void {
    const r = this.#run;
    if (!r) return;
    for (const [id, t] of r.trackers)
      this.#emit(
        r,
        id,
        t.rebuild((vk) => this.#backend.keyIsDown(vk)),
      );
  }

  #build(r: Run): void {
    r.trackers = new Map();
    if (this.#primary) r.trackers.set(PRIMARY, createChordTracker(this.#primary));
    for (const [id, c] of Object.entries(this.#extra)) r.trackers.set(id, createChordTracker(c));
    r.trackers.get(PRIMARY)?.grab(this.#grabbed);
  }

  #usesMouse(): boolean {
    return [this.#primary, ...Object.values(this.#extra)].some((c) => c?.keys.some((k) => MOUSE_VKS.has(k)));
  }

  /** Installs the mouse hook while a button is bound or a click could still end a double-tap window; removes it otherwise. */
  #syncMouse(r: Run): void {
    const want = this.#backend.installMouse !== undefined && (this.#usesMouse() || this.#now() < r.clickUntil);
    if (want && !r.mouse) {
      try {
        r.mouse = this.#backend.installMouse!(
          (c) => this.#click(r, c),
          (e) => this.#mouseFault(r, e),
        );
      } catch {
        r.mouse = null; // keyboard shortcuts keep working without it
      }
    } else if (!want && r.mouse) {
      r.mouse.uninstall();
      r.mouse = null;
    }
  }

  /** The mouse hook died: the owner decides about a full reinstall (and tells the person when that fails), and the health check retries the mouse hook meanwhile. */
  #mouseFault(r: Run, error: unknown): void {
    r.mouse = null;
    if (this.#run === r) r.handlers.onFault?.(error);
  }

  #emit(r: Run, id: string, events: HotkeyEvent[]): void {
    if (events.length === 0) return;
    setImmediate(() => {
      if (this.#run !== r) return;
      for (const e of events) r.handlers.onEvent(id === PRIMARY ? e : { ...e, chord: id });
      // Clicks matter while a chord is held (a click discards the press) and for a moment after it (a click ends a double-tap window).
      if (events.some((e) => e.kind === "down")) r.clickUntil = Infinity;
      else if (events.some((e) => e.kind === "up")) r.clickUntil = this.#now() + this.#clickWatchMs;
      else return;
      if (this.#backend.installMouse) this.#syncMouse(r);
    });
  }

  #fail(r: Run, error: unknown): void {
    if (this.#run === r) {
      this.#run = null;
      clearInterval(r.timer);
      r.mouse?.uninstall();
    }
    r.handlers.onFault?.(error);
  }

  /** Feeds every tracker; the key is swallowed when any says so. */
  #feed(r: Run, vk: VirtualKey, down: boolean): boolean {
    let swallow = false;
    let mask = false;
    for (const [id, t] of r.trackers) {
      const d = t.feed({ vk, down });
      this.#emit(r, id, d.events);
      swallow ||= d.swallow;
      mask ||= d.mask === true;
    }
    if (mask && !down) this.#backend.injectMask?.();
    return swallow;
  }

  #click(r: Run, c: HookClick): boolean {
    if (c.extra === this.#marker && (c.flags & LLKHF_INJECTED) !== 0) return false;
    return this.#feed(r, c.vk, c.down);
  }

  #install(r: Run): InstalledHook {
    return this.#backend.install(
      (k) => {
        if (k.extra === this.#marker && (k.flags & LLKHF_INJECTED) !== 0) return false;
        return this.#feed(r, trackerCode(k.vk, k.flags), k.down);
      },
      (error) => this.#fail(r, error),
    );
  }

  #reinstall(r: Run): boolean {
    r.hook?.uninstall();
    try {
      r.hook = this.#install(r);
      return true;
    } catch (error) {
      this.#fail(r, error);
      return false;
    }
  }

  #watch(r: Run): void {
    const t = this.#now();
    const stalled = t - r.beat > this.#stallMs;
    r.beat = t;
    if (stalled) {
      if (!this.#reinstall(r)) return;
      // The mouse hook may have been dropped in the same stall.
      if (r.mouse) {
        r.mouse.uninstall();
        r.mouse = null;
      }
      this.#syncMouse(r);
      // Key events that arrived during the stall may have been dropped, including the release of the chord.
      for (const [id, tracker] of r.trackers) this.#emit(r, id, tracker.reset());
    }
    for (const [id, tracker] of r.trackers) for (const vk of tracker.visibleHeld()) if (!this.#backend.keyIsDown(vk)) this.#emit(r, id, tracker.release(vk));
    if (r.mouse && !this.#usesMouse() && t >= r.clickUntil) this.#syncMouse(r);
    if (t - r.lastHealth >= this.#healthMs) {
      r.lastHealth = t;
      this.#health(r);
    }
  }

  /** A chord key that is down on the real keyboard but unknown to the hook means the hook has stopped seeing keys: install it again. */
  #health(r: Run): void {
    if (!r.mouse && this.#usesMouse()) this.#syncMouse(r);
    const blind = [...r.trackers.values()].some((tracker) => tracker.unseenDown((vk) => this.#backend.keyIsDown(vk)));
    if (blind) this.#reinstall(r);
  }
}

export const createKeyboardHook = (backend: HookBackend, options: Options): KeyboardHook => new KeyboardHook(backend, options);
