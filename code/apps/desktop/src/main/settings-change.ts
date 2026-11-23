import { SLOT_NAMES } from "../shared/dictation/conflicts";
import type { DictationStatus } from "../shared/dictation/contract";
import type { DictationPatch } from "../shared/dictation/settings";
import type { SettingsResult, ShortcutResult } from "../shared/ipc";
import type { VoiceChatVoice } from "@speakkit/protocol";
import { validateChange, type AreaName } from "../shared/control/settings-registry";
import type { ConfigPatch } from "../shared/schemas";
import type { ShortcutId } from "../shared/shortcuts";

export interface ChangeTargets {
  /** The shortcut it clashes with when the dictation settings were refused. */
  patchDictation(patch: DictationPatch): Promise<DictationStatus["rejected"]>;
  patchApp(patch: ConfigPatch): Promise<unknown>;
  /** Transcripts and engines keep their settings with the feature. */
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  setShortcut(id: ShortcutId, accelerator: string): Promise<ShortcutResult>;
  /** Puts every shortcut back to its default. */
  resetShortcuts(): Promise<unknown>;
  setLaunchAtLogin(on: boolean): Promise<unknown>;
  setVoiceChatVoice(voice: VoiceChatVoice): void;
}

/** The one way a Settings page changes settings: validated by the registry, then stored. Nothing is stored when any part is refused. */
export async function applyChange(t: ChangeTargets, change: Readonly<Record<string, unknown>>): Promise<SettingsResult> {
  const checked = validateChange(change);
  if (!checked.ok) return checked;
  // Dictation first: a refused shortcut must leave every other setting of the same change unsaved too.
  if (Object.keys(checked.dictation).length) {
    const rejected = await t.patchDictation(checked.dictation);
    if (rejected) return { ok: false, message: `That shortcut is already used by ${SLOT_NAMES[rejected.with]}.` };
  }
  try {
    if (checked.resetShortcuts) await t.resetShortcuts();
    for (const [id, accelerator] of Object.entries(checked.shortcuts)) {
      const r = await t.setShortcut(id as ShortcutId, accelerator);
      if (!r.ok) return { ok: false, message: "That shortcut cannot be used.", shortcut: r };
    }
    if (Object.keys(checked.app).length) await t.patchApp(checked.app);
    for (const [area, patch] of Object.entries(checked.areas)) await t.patchArea(area as AreaName, patch);
    if (checked.system.voiceChatVoice !== undefined) t.setVoiceChatVoice(checked.system.voiceChatVoice);
    if (checked.system.launchAtLogin !== undefined) await t.setLaunchAtLogin(checked.system.launchAtLogin);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}
