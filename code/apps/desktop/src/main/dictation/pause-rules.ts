import type { PauseRules } from "../../shared/dictation/settings";

export interface ForegroundFacts {
  /** File name of the program in front, null when unknown. */
  exe: string | null;
  fullscreen: boolean;
}

const key = (exe: string) =>
  exe
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, "");

/**
 * Whether the shortcuts should stand down for the program in front. "block": pause in the listed programs. "allow": pause everywhere except the listed ones.
 * A program that cannot be identified is never paused by a list (an allow list would otherwise switch dictation off by accident); full screen applies on its own.
 */
export function pausedFor(rules: PauseRules, fg: ForegroundFacts | null): boolean {
  if (!fg) return false;
  if (rules.fullscreen && fg.fullscreen) return true;
  if (rules.mode === "off" || fg.exe === null || rules.apps.length === 0) return false;
  const listed = rules.apps.some((a) => key(a) === key(fg.exe!));
  return rules.mode === "block" ? listed : !listed;
}
