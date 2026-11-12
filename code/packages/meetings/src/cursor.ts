import type { Line } from "./store";

const keyOf = (l: Line) => `${l.who}\u0000${Math.round(l.start * 1000)}\u0000${l.text}`;

/**
 * "Copy new": remembers which lines of a meeting were already copied, so the next copy returns only what is new. Lines are told apart by who said them,
 * when, and what the text is, not by their place in the list, because a line that arrives later can land in the middle (the two tracks are transcribed
 * separately) and a corrected line counts as new.
 */
export class CopyCursor {
  readonly #seen = new Set<string>();

  /** The lines not copied yet, in time order. Marks them as copied. */
  take(lines: readonly Line[]): Line[] {
    const fresh = lines.filter((l) => !this.#seen.has(keyOf(l))).sort((a, b) => a.start - b.start || (a.who < b.who ? 1 : -1));
    for (const l of fresh) this.#seen.add(keyOf(l));
    return fresh;
  }

  /** How many lines are not copied yet, without marking them. */
  pending(lines: readonly Line[]): number {
    return lines.filter((l) => !this.#seen.has(keyOf(l))).length;
  }

  reset(): void {
    this.#seen.clear();
  }
}

/** Lines as text for the clipboard or a paste: with who spoke and the time when `labels` is set. */
export function linesText(lines: readonly Line[], labels = true): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return lines.map((l) => (labels ? `${l.who} ${fmt(l.start)}: ${l.text}` : l.text)).join("\n");
}
