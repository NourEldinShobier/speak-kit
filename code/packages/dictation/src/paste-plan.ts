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

/** Which way the text goes in. The keys, waits and clipboard restore of a paste belong to the operating system layer, which knows the program (terminals, remote desktop). */
export type PastePlan =
  | { method: "paste" }
  | { method: "type" }
  | { method: "copy"; reason: CopyReason }
  | { method: "refuse"; reason: "password-field" };

export interface PlanInput {
  /** Foreground window when the key was pressed. */
  target: Target | undefined;
  /** Foreground window now; absent when it could not be read. */
  current: Target | undefined;
  settings: Pick<Settings, "insertMode" | "appModes">;
  /** The recording stopped early (microphone lost), so the text may be partial. */
  interrupted: boolean;
}

export const exeKey = (exe: string): string => exe.toLowerCase().replace(/\.exe$/, "");

function byMode(mode: InsertMode): PastePlan {
  if (mode === "copy") return { method: "copy", reason: "setting" };
  return mode === "type" ? { method: "type" } : { method: "paste" };
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
  return byMode(settings.appModes[exeKey(now.exe)] ?? settings.insertMode);
}
