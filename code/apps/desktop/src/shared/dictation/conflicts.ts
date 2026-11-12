import { hotkeyKeys } from "./keys";

/** Every shortcut the app owns that a recorder can set. The first seven are key chords read by the key hook, the last three are the reader's global accelerators ("Ctrl+Alt+S"). */
export const HOOK_SLOTS = ["dictation", "second", "mouse", "raw", "pasteLast", "transform", "cancel"] as const;
export const ACCELERATOR_SLOTS = ["read-selection", "play-pause", "stop"] as const;
export type Slot = (typeof HOOK_SLOTS)[number] | (typeof ACCELERATOR_SLOTS)[number];
export type Shortcuts = Partial<Record<Slot, string>>;

export const SLOT_NAMES: Record<Slot, string> = {
  dictation: "Dictation shortcut",
  second: "Second shortcut",
  mouse: "Mouse button",
  raw: "Dictate without processing",
  pasteLast: "Paste last dictation",
  transform: "Clean up the field",
  cancel: "Cancel key",
  "read-selection": "Read selection",
  "play-pause": "Play or pause",
  stop: "Stop reading",
};

const isHook = (s: Slot): boolean => (HOOK_SLOTS as readonly string[]).includes(s);
const SIDELESS = /^(Control|Alt|Shift|Meta)(Left|Right)$/;
const ACCEL: Record<string, string> = { ctrl: "Control", control: "Control", alt: "Alt", option: "Alt", shift: "Shift", super: "Meta", meta: "Meta", win: "Meta" };

function acceleratorToken(t: string): string {
  const named = ACCEL[t.toLowerCase()];
  if (named) return named;
  if (/^[a-z]$/i.test(t)) return `Key${t.toUpperCase()}`;
  return /^\d$/.test(t) ? `Digit${t}` : t;
}

/** The keys of one shortcut with left and right modifiers folded together, so an accelerator and a chord can be compared. */
function tokens(slot: Slot, value: string): Set<string> {
  if (isHook(slot)) return new Set(hotkeyKeys(value).map((k) => k.replace(SIDELESS, "$1")));
  return new Set(value.split("+").map((p) => acceleratorToken(p.trim())));
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((k) => b.has(k));

/** The slot that already uses `value`, or undefined. Equal key sets clash; two chords also clash when one contains the other with the same sides (pressing the larger one presses the smaller one). */
export function findConflict(all: Shortcuts, slot: Slot, value: string): Slot | undefined {
  if (!value) return undefined;
  const mine = tokens(slot, value);
  for (const [other, theirs] of Object.entries(all) as [Slot, string | undefined][]) {
    if (other === slot || !theirs) continue;
    const t = tokens(other, theirs);
    if (slot === "cancel" || other === "cancel") {
      const [cancel, chord] = slot === "cancel" ? [mine, t] : [t, mine];
      if ([...cancel].every((k) => chord.has(k))) return other;
      continue;
    }
    if (sameSet(mine, t)) return other;
    if (isHook(slot) && isHook(other)) {
      const a = new Set(hotkeyKeys(value));
      const b = new Set(hotkeyKeys(theirs));
      const [small, big] = a.size <= b.size ? [a, b] : [b, a];
      if ([...small].every((k) => big.has(k))) return other;
    }
  }
  return undefined;
}

/** The first pair of slots that share a shortcut, for a settings file or an import that bypasses the recorder. */
export function firstClash(all: Shortcuts): [Slot, Slot] | undefined {
  for (const slot of Object.keys(all) as Slot[]) {
    const other = findConflict(all, slot, all[slot] ?? "");
    if (other) return [slot, other];
  }
  return undefined;
}
