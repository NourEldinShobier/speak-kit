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
type KeyName = "hotkey" | "screenshotHotkey" | "recordingHotkey";
const KEYS: readonly KeyName[] = ["hotkey", "screenshotHotkey", "recordingHotkey"];

function changeHotkey(s: CaptureConfig, key: { which: KeyName; next: string }, c: PatchContext): string | undefined {
  const { which, next } = key;
  if (c.dictationHotkey && chordsConflict(next, c.dictationHotkey))
    return `${c.dictationHotkey
      .split("+")
      .map((k) => keyLabel(k, c.os))
      .join(" + ")} belongs to Dictation`;
  if (KEYS.some((other) => other !== which && chordsConflict(next, s[other]))) return "The two capture keys cannot be the same";
  s[which] = next;
  return undefined;
}

/** Applies a settings change from the page to the config in place. */
export function applyPatch(s: CaptureConfig, patch: CapturePatch, c: PatchContext): PatchResult {
  const { experiments, hotkey, screenshotHotkey, recordingHotkey, ...rest } = patch;
  Object.assign(s, rest);
  for (const [k, on] of Object.entries(experiments ?? {})) if (on !== undefined) s.experiments[k as ExperimentId] = on;
  const notes = [
    hotkey !== undefined && changeHotkey(s, { which: "hotkey", next: hotkey }, c),
    screenshotHotkey !== undefined && changeHotkey(s, { which: "screenshotHotkey", next: screenshotHotkey }, c),
    recordingHotkey !== undefined && changeHotkey(s, { which: "recordingHotkey", next: recordingHotkey }, c),
  ];
  return {
    note: notes.find((n): n is string => typeof n === "string"),
    keysChanged: hotkey !== undefined || screenshotHotkey !== undefined || recordingHotkey !== undefined || !!experiments || patch.shiftInk !== undefined,
  };
}
