import type { DesktopError } from "./errors";

/** Global shortcuts: ids, defaults and the pure rules (validation, conflicts, recording). Registration with the OS lives in main/shortcuts.ts. */
export const SHORTCUT_IDS = ["read-selection", "play-pause", "stop", "record-toggle"] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];
export type Bindings = Record<ShortcutId, string>;

export const DEFAULT_SHORTCUTS: Bindings = {
  "read-selection": "Ctrl+Alt+S",
  "play-pause": "Ctrl+Alt+Space",
  stop: "Ctrl+Alt+X",
  "record-toggle": "Ctrl+Alt+R",
};

/** "Ctrl+Alt+S, Space, X and R", built from the defaults. */
export const resetText = (platform: string, and = "and"): string => {
  const keys = SHORTCUT_IDS.map((id) => DEFAULT_SHORTCUTS[id]);
  const head = showAccelerator(keys[0]!, platform, "global");
  const rest = keys.slice(1).map((k) => showAccelerator(k, platform, "global").split("+").pop()!);
  return `${head}, ${rest.slice(0, -1).join(", ")} ${and} ${rest.at(-1)}`;
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

/**
 * How an accelerator reads on this platform. On macOS Alt is Option; Ctrl is Cmd only for keys the app handles itself ("app"),
 * because a global Electron accelerator "Ctrl" is the Control key.
 */
export function showAccelerator(accelerator: string, platform: string, scope: "app" | "global"): string {
  if (platform !== "darwin") return accelerator;
  const names: Record<string, string> = { Alt: "Option", ...(scope === "app" ? { Ctrl: "Cmd" } : {}) };
  return accelerator
    .split("+")
    .map((k) => names[k] ?? k)
    .join("+");
}

// Combinations Windows or every app already owns; registering them would break the system.
const RESERVED = new Set(["Alt+F4", "Alt+Tab", "Alt+Space", "Ctrl+Alt+Delete", "Ctrl+Alt+Tab", "Ctrl+Shift+Escape"]);

/** Why this accelerator cannot be a global shortcut, or null when it can. */
export function checkAccelerator(raw: string): DesktopError | null {
  const p = parseAccelerator(raw);
  if (!p) return { code: "shortcut-invalid" };
  if (!p.mods.includes("Ctrl") && !p.mods.includes("Alt")) return { code: "shortcut-needs-modifier" };
  const fKey = /^F\d+$/.test(p.key);
  if (p.mods.length < 2 && !fKey) return { code: "shortcut-needs-two" };
  if (RESERVED.has([...p.mods, p.key].join("+"))) return { code: "shortcut-reserved" };
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
type Recorded = { kind: "cancel" } | { kind: "waiting" } | { kind: "invalid"; reason: DesktopError } | { kind: "accelerator"; accelerator: string };

function keyOfCode(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return /^F\d+$/.test(code) ? code : CODE_KEY[code];
}

/** Turns one keydown into the recorder's next step (`platform` names the reserved key in the message). Escape alone cancels, a lone modifier keeps waiting. */
export function recordKey(e: KeyEventLike, platform: string): Recorded {
  const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (e.code === "Escape" && !hasMod) return { kind: "cancel" };
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(e.code)) return { kind: "waiting" };
  const key = keyOfCode(e.code);
  if (!key) return { kind: "invalid", reason: { code: "shortcut-bad-key" } };
  if (e.metaKey) return { kind: "invalid", reason: { code: "shortcut-meta-key", args: { platform } } };
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
