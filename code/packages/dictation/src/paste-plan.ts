import type { InsertMode, Settings } from "./settings";

/** The foreground window at one moment. `id` changes whenever the focused window does. */
export interface Target {
  id: string;
  /** Executable name, for example "WindowsTerminal.exe". */
  exe: string;
  elevated: boolean;
  passwordField: boolean;
}

export type CopyReason = "setting" | "elevated" | "focus-changed" | "interrupted" | "no-target" | "manual";

export type PastePlan =
  | { method: "paste"; keys: "ctrl-v" | "ctrl-shift-v"; /** Wait before the key press. */ delayMs: number; /** Wait before the old clipboard comes back. */ restoreMs: number }
  | { method: "type" }
  | { method: "copy"; reason: CopyReason }
  | { method: "refuse"; reason: "password-field" };

export interface PlanInput {
  /** Foreground window when the key was pressed. */
  target: Target | undefined;
  /** Foreground window now; absent when it could not be read. */
  current: Target | undefined;
  settings: Pick<Settings, "insertMode" | "terminalPaste" | "appModes">;
  /** The recording stopped early (microphone lost), so the text may be partial. */
  interrupted: boolean;
}

const TERMINALS = new Set(["windowsterminal", "wt", "cmd", "powershell", "pwsh", "conhost", "openconsole", "mintty", "alacritty", "wezterm-gui", "kitty", "putty"]);
// The remote clipboard syncs late, so the key press and the restore both wait longer.
const REMOTE = new Set(["mstsc", "msrdc", "msrdcw"]);

const PASTE_DELAY_MS = 0;
const PASTE_RESTORE_MS = 500;
const REMOTE_DELAY_MS = 400;
const REMOTE_RESTORE_MS = 3000;

export const exeKey = (exe: string): string => exe.toLowerCase().replace(/\.exe$/, "");

function pastePlan(exe: string, terminalPaste: boolean): PastePlan {
  const remote = REMOTE.has(exe);
  const terminal = TERMINALS.has(exe) && terminalPaste;
  return {
    method: "paste",
    keys: terminal ? "ctrl-shift-v" : "ctrl-v",
    delayMs: remote ? REMOTE_DELAY_MS : PASTE_DELAY_MS,
    restoreMs: remote ? REMOTE_RESTORE_MS : PASTE_RESTORE_MS,
  };
}

function byMode(mode: InsertMode, exe: string, terminalPaste: boolean): PastePlan {
  if (mode === "copy") return { method: "copy", reason: "setting" };
  return mode === "type" ? { method: "type" } : pastePlan(exe, terminalPaste);
}

/** How to get the text into the window the user was in. Pure: the same window and settings always give the same plan. */
export function planPaste(input: PlanInput): PastePlan {
  const { target, current, settings, interrupted } = input;
  const now = current ?? target;
  if (!now || !target) return { method: "copy", reason: "no-target" };
  if (now.passwordField) return { method: "refuse", reason: "password-field" };
  if (interrupted) return { method: "copy", reason: "interrupted" };
  if (now.id !== target.id) return { method: "copy", reason: "focus-changed" };
  if (now.elevated) return { method: "copy", reason: "elevated" };
  const exe = exeKey(now.exe);
  return byMode(settings.appModes[exe] ?? settings.insertMode, exe, settings.terminalPaste);
}
