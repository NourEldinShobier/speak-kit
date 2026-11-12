import { keyLabel } from "../../shared/dictation/keys";
import type { CaptureConfig, CapturePatch, ExperimentId } from "../../shared/capture/settings";
import { chordsConflict } from "./gesture";

export interface PatchContext {
  /** The chord dictation uses now, when dictation is on. */
  dictationHotkey: string | undefined;
  os: string;
}

export interface PatchResult {
  /** Why a hotkey the person chose was not taken. */
  note: string | undefined;
  /** A key or an experiment changed: the key hooks must be started again. */
  keysChanged: boolean;
}

/** A hotkey is taken only when it does not collide with dictation or the other capture key; otherwise nothing changes and a note says whose it is. */
function changeHotkey(s: CaptureConfig, key: { which: "hotkey" | "screenshotHotkey"; next: string }, c: PatchContext): string | undefined {
  const { which, next } = key;
  if (c.dictationHotkey && chordsConflict(next, c.dictationHotkey))
    return `${c.dictationHotkey
      .split("+")
      .map((k) => keyLabel(k, c.os))
      .join(" + ")} belongs to Dictation`;
  if (chordsConflict(next, which === "hotkey" ? s.screenshotHotkey : s.hotkey)) return "The two capture keys cannot be the same";
  s[which] = next;
  return undefined;
}

/** Applies a settings change from the page to the config in place. */
export function applyPatch(s: CaptureConfig, patch: CapturePatch, c: PatchContext): PatchResult {
  const { experiments, hotkey, screenshotHotkey, ...rest } = patch;
  Object.assign(s, rest);
  for (const [k, on] of Object.entries(experiments ?? {})) if (on !== undefined) s.experiments[k as ExperimentId] = on;
  const notes = [
    hotkey !== undefined && changeHotkey(s, { which: "hotkey", next: hotkey }, c),
    screenshotHotkey !== undefined && changeHotkey(s, { which: "screenshotHotkey", next: screenshotHotkey }, c),
  ];
  return { note: notes.find((n): n is string => typeof n === "string"), keysChanged: hotkey !== undefined || screenshotHotkey !== undefined || !!experiments || patch.shiftInk !== undefined };
}
