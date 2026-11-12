import type { DictationBridge, DictationStatus } from "../../../shared/dictation/contract";
import type { DictationPatch } from "../../../shared/dictation/settings";
import { patchViaRegistry } from "../../registry-patch";

declare global {
  interface Window {
    speakkitDictation: DictationBridge;
  }
}

/** The preload's dictation bridge (window.speakkitDictation). */
export const dictation: DictationBridge = window.speakkitDictation;

/** Changes dictation settings through the settings registry; the status says which shortcut a refused hotkey clashes with. */
export const patchDictation = (patch: DictationPatch): Promise<DictationStatus> =>
  // An empty patch changes nothing and only acknowledges the notice about a reset shortcut, which the registry has no key for.
  Object.keys(patch).length === 0 ? dictation.patchSettings(patch) : patchViaRegistry("dictation", patch, { status: () => dictation.status(), explained: (s) => !!s.rejected });
