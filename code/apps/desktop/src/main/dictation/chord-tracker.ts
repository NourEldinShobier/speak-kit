import { MENU_KEYS, VK, type Chord, type HotkeyEvent, type VirtualKey } from "./types";

export interface Stroke {
  vk: VirtualKey;
  down: boolean;
}

export interface Decision {
  /** True when the key must not reach the app. */
  swallow: boolean;
  events: HotkeyEvent[];
  /** Press and release an unassigned key before this release reaches the app, so a lone Alt or Win release opens no menu. */
  mask?: boolean;
}

const PASS: Decision = { swallow: false, events: [] };
const SWALLOW: Decision = { swallow: true, events: [] };
// A modifier is never swallowed: an app that never sees Right Ctrl go down loses every Ctrl+key shortcut typed with it.
const MODIFIERS: ReadonlySet<VirtualKey> = new Set([VK.leftShift, VK.rightShift, VK.leftCtrl, VK.rightCtrl, VK.leftAlt, VK.rightAlt, VK.leftWin, VK.rightWin]);

/**
 * Turns raw key strokes into hotkey events and says which strokes to swallow. Pure: the low-level hook feeds it and obeys the answer.
 * A key is swallowed only when it completes the chord (and is not a modifier) or was grabbed, and its release is swallowed exactly when its press was,
 * so an app never sees a release without a press or a key that stays down.
 */
export class ChordTracker {
  readonly #chord: Chord;
  readonly #held = new Set<VirtualKey>();
  readonly #swallowedDown = new Set<VirtualKey>();
  #grabbed = new Set<VirtualKey>();
  #active = false;
  /** Chord keys pressed while another key was already down: a combination such as Ctrl+C, not a lone press. */
  readonly #blocked = new Set<VirtualKey>();
  /** The chord was just released: the next other key still matters once (it ends a double-tap window). */
  #afterRelease = false;
  /** The chord has an Alt or Win key that was used: its release needs the mask, even when the chord itself ended first. */
  #maskPending = false;

  constructor(chord: Chord) {
    this.#chord = chord;
  }

  get active(): boolean {
    return this.#active;
  }

  feed(stroke: Stroke): Decision {
    return this.#chord.keys.includes(stroke.vk) ? this.#chordKey(stroke) : this.#otherKey(stroke);
  }

  grab(keys: readonly VirtualKey[]): void {
    this.#grabbed = new Set(keys);
  }

  /** Chord keys the app was allowed to see go down: the only ones whose release can be checked against the real keyboard state. */
  visibleHeld(): VirtualKey[] {
    return this.#chord.keys.filter((k) => this.#held.has(k) && !this.#swallowedDown.has(k));
  }

  /** A chord key that was found up while the hook never saw its release. */
  release(vk: VirtualKey): HotkeyEvent[] {
    return this.feed({ vk, down: false }).events;
  }

  /**
   * Rebuilds what is believed down from the physical keyboard: a key that is up there is released here. Keys the keyboard says are down but this never saw
   * are not added, so a repair never starts a capture. Reports "up" when that ends the chord.
   */
  rebuild(isDown: (vk: VirtualKey) => boolean): HotkeyEvent[] {
    for (const vk of [...this.#held]) {
      if (isDown(vk)) continue;
      this.#held.delete(vk);
      this.#swallowedDown.delete(vk);
      this.#blocked.delete(vk);
    }
    if (!this.#active || this.#chord.keys.every((k) => this.#held.has(k))) return [];
    this.#active = false;
    return [{ kind: "up" }];
  }

  /** A chord key (not a mouse button or an extended key) is down on the physical keyboard while this has no record of it: the hook missed its press. */
  unseenDown(isDown: (vk: VirtualKey) => boolean): boolean {
    return this.#chord.keys.some((k) => k < 0x100 && k > 0x06 && !this.#held.has(k) && isDown(k));
  }

  /** Forgets every key believed down, for when key events may have been lost (screen lock, secure desktop, a stalled app). Reports up if the chord was down. */
  reset(): HotkeyEvent[] {
    const events: HotkeyEvent[] = this.#active ? [{ kind: "up" }] : [];
    this.#held.clear();
    this.#swallowedDown.clear();
    this.#blocked.clear();
    this.#active = false;
    return events;
  }

  #chordKey({ vk, down }: Stroke): Decision {
    if (down) {
      const repeat = this.#held.has(vk);
      this.#held.add(vk);
      if (repeat) return this.#swallowedDown.has(vk) ? SWALLOW : PASS;
      if (this.#active || !this.#chord.keys.every((k) => this.#held.has(k))) return PASS;
      // A lone modifier counts only as a fresh press with nothing else down: Ctrl+C typed with the chord key last is not a dictation press.
      if (this.#chord.keys.every((k) => MODIFIERS.has(k)) && [...this.#held].some((k) => !this.#chord.keys.includes(k))) {
        this.#blocked.add(vk);
        return PASS;
      }
      this.#active = true;
      this.#afterRelease = false;
      this.#maskPending = this.#chord.keys.some((k) => MENU_KEYS.has(k));
      if (MODIFIERS.has(vk) || this.#chord.share) return { swallow: false, events: [{ kind: "down" }] };
      this.#swallowedDown.add(vk);
      return { swallow: true, events: [{ kind: "down" }] };
    }
    this.#held.delete(vk);
    this.#blocked.delete(vk);
    const swallow = this.#swallowedDown.delete(vk);
    const wasActive = this.#active;
    const events: HotkeyEvent[] = wasActive ? [{ kind: "up" }] : [];
    this.#active = false;
    this.#afterRelease = wasActive;
    const mask = this.#maskPending && MENU_KEYS.has(vk);
    if (mask && !this.#chord.keys.some((k) => MENU_KEYS.has(k) && this.#held.has(k))) this.#maskPending = false;
    return { swallow, events, ...(mask && { mask: true }) };
  }

  #otherKey({ vk, down }: Stroke): Decision {
    if (!down) {
      this.#held.delete(vk);
      return this.#swallowedDown.delete(vk) ? SWALLOW : PASS;
    }
    if (this.#held.has(vk)) return this.#swallowedDown.has(vk) ? SWALLOW : PASS;
    this.#held.add(vk);
    if (this.#grabbed.has(vk)) {
      this.#swallowedDown.add(vk);
      return { swallow: true, events: [{ kind: "grabbed", vk }] };
    }
    if (this.#active || this.#afterRelease) {
      this.#afterRelease = false;
      return { swallow: false, events: [{ kind: "other", vk }] };
    }
    return PASS;
  }
}

export const createChordTracker = (chord: Chord): ChordTracker => new ChordTracker(chord);
