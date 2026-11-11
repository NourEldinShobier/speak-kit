import { VK, type Chord, type HotkeyEvent, type VirtualKey } from "./types";

export interface Stroke {
  vk: VirtualKey;
  down: boolean;
}

export interface Decision {
  /** True when the key must not reach the app. */
  swallow: boolean;
  events: HotkeyEvent[];
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

  /** Forgets every key believed down, for when key events may have been lost (screen lock, secure desktop, a stalled app). Reports up if the chord was down. */
  reset(): HotkeyEvent[] {
    const events: HotkeyEvent[] = this.#active ? [{ kind: "up" }] : [];
    this.#held.clear();
    this.#swallowedDown.clear();
    this.#active = false;
    return events;
  }

  #chordKey({ vk, down }: Stroke): Decision {
    if (down) {
      const repeat = this.#held.has(vk);
      this.#held.add(vk);
      if (repeat) return this.#swallowedDown.has(vk) ? SWALLOW : PASS;
      if (this.#active || !this.#chord.keys.every((k) => this.#held.has(k))) return PASS;
      this.#active = true;
      if (MODIFIERS.has(vk)) return { swallow: false, events: [{ kind: "down" }] };
      this.#swallowedDown.add(vk);
      return { swallow: true, events: [{ kind: "down" }] };
    }
    this.#held.delete(vk);
    const swallow = this.#swallowedDown.delete(vk);
    const events: HotkeyEvent[] = this.#active ? [{ kind: "up" }] : [];
    this.#active = false;
    return { swallow, events };
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
    return this.#active ? { swallow: false, events: [{ kind: "other", vk }] } : PASS;
  }
}

export const createChordTracker = (chord: Chord): ChordTracker => new ChordTracker(chord);
