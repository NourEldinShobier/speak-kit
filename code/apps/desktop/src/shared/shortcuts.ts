/** Global shortcuts: ids, defaults and the pure rules (validation, conflicts, recording). Registration with the OS lives in main/shortcuts.ts. */
export const SHORTCUT_IDS = ["read-selection", "play-pause", "stop", "read-clipboard"] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];
export type Bindings = Record<ShortcutId, string>;

export const DEFAULT_SHORTCUTS: Bindings = {
  "read-selection": "Ctrl+Alt+S",
  "play-pause": "Ctrl+Alt+Space",
  stop: "Ctrl+Alt+X",
  "read-clipboard": "Ctrl+Alt+C",
};

export const SHORTCUT_LABELS: Record<ShortcutId, { title: string; description: string }> = {
  "read-selection": { title: "Read selection", description: "Reads the text selected in any app." },
  "play-pause": { title: "Play or pause", description: "Pauses and resumes the current reading." },
  stop: { title: "Stop", description: "Stops the reading and closes the mini player." },
  "read-clipboard": { title: "Read clipboard", description: "Reads whatever text you copied last." },
};

const MODIFIERS = ["Ctrl", "Alt", "Shift"] as const;
const NAMED = new Set(["Space", "Tab", "Backspace", "Delete", "Insert", "Enter", "Up", "Down", "Left", "Right", "Home", "End", "PageUp", "PageDown"]);

const isKey = (k: string) => /^[A-Z0-9]$/.test(k) || /^F([1-9]|1\d|2[0-4])$/.test(k) || NAMED.has(k) || /^[-=,./;'[\]\\`]$/.test(k);

const keyName = (part: string): string | null => {
  const key = part.length === 1 ? part.toUpperCase() : ([...NAMED].find((n) => n.toLowerCase() === part.toLowerCase()) ?? part.toUpperCase());
  return isKey(key) ? key : null;
};

/** Splits "ctrl+alt+s" into canonical modifiers and key, or null when it is not an accelerator this app accepts. */
function parseAccelerator(raw: string): { mods: (typeof MODIFIERS)[number][]; key: string } | null {
  const mods = new Set<(typeof MODIFIERS)[number]>();
  let key: string | null = null;
  for (const part of raw.split("+").map((p) => p.trim())) {
    const m = MODIFIERS.find((x) => x.toLowerCase() === part.toLowerCase()) ?? (part.toLowerCase() === "control" ? "Ctrl" : undefined);
    if (m) mods.add(m);
    else if (key === null) key = keyName(part);
    else return null;
  }
  return key ? { mods: MODIFIERS.filter((m) => mods.has(m)), key } : null;
}

/** Canonical spelling ("Ctrl+Alt+S"), used to compare bindings. */
export function normalize(raw: string): string | null {
  const p = parseAccelerator(raw);
  return p ? [...p.mods, p.key].join("+") : null;
}

// Combinations Windows or every app already owns; registering them would break the system.
const RESERVED = new Set(["Alt+F4", "Alt+Tab", "Alt+Space", "Ctrl+Alt+Delete", "Ctrl+Alt+Tab", "Ctrl+Shift+Escape"]);

/** Why this accelerator cannot be a global shortcut, or null when it can. */
export function checkAccelerator(raw: string): string | null {
  const p = parseAccelerator(raw);
  if (!p) return "That is not a valid key combination.";
  if (!p.mods.includes("Ctrl") && !p.mods.includes("Alt")) return "Use Ctrl or Alt together with another key.";
  const fKey = /^F\d+$/.test(p.key);
  if (p.mods.length < 2 && !fKey) return "Use at least two modifier keys, such as Ctrl+Alt, so normal typing is not blocked.";
  if (RESERVED.has([...p.mods, p.key].join("+"))) return "Windows uses that combination.";
  return null;
}

/** Ids whose accelerator is also used by another id of this app. */
export function duplicateIds(b: Bindings): Set<ShortcutId> {
  const seen = new Map<string, ShortcutId>();
  const dup = new Set<ShortcutId>();
  for (const id of SHORTCUT_IDS) {
    const n = normalize(b[id]) ?? b[id];
    const other = seen.get(n);
    if (other) {
      dup.add(id);
      dup.add(other);
    } else seen.set(n, id);
  }
  return dup;
}

/** One free alternative for a taken accelerator: the same key with Shift added, then neighbouring letters. Never overrides silently. */
export function suggestAlternative(raw: string, taken: ReadonlySet<string>): string | null {
  const p = parseAccelerator(raw);
  if (!p) return null;
  const free = (acc: string) => (checkAccelerator(acc) === null && !taken.has(normalize(acc)!) ? normalize(acc) : null);
  const withShift = free([...new Set([...p.mods, "Shift"])].join("+") + `+${p.key}`);
  if (withShift) return withShift;
  for (const k of "QWERTYUIOPASDFGHJKLZXCVBNM") {
    const alt = free([...p.mods, k].join("+"));
    if (alt) return alt;
  }
  return null;
}

const CODE_KEY: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Enter: "Enter",
  NumpadEnter: "Enter",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
};

interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}
type Recorded = { kind: "cancel" } | { kind: "waiting" } | { kind: "invalid"; reason: string } | { kind: "accelerator"; accelerator: string };

/** Turns one keydown into the recorder's next step. Escape alone cancels, a lone modifier keeps waiting. */
export function recordKey(e: KeyEventLike): Recorded {
  const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (e.code === "Escape" && !hasMod) return { kind: "cancel" };
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(e.code)) return { kind: "waiting" };
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : CODE_KEY[e.code];
  if (!key) return { kind: "invalid", reason: "That key cannot be used." };
  if (e.metaKey) return { kind: "invalid", reason: "The Windows key is reserved for Windows." };
  const accelerator = normalize([e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", key].filter(Boolean).join("+"))!;
  const reason = checkAccelerator(accelerator);
  return reason ? { kind: "invalid", reason } : { kind: "accelerator", accelerator };
}

export interface ShortcutConflict {
  accelerator: string;
  /** "taken": the OS refused it because another app owns it. "duplicate": two actions of this app share it. */
  reason: "taken" | "duplicate";
  suggestion: string | null;
}
