import { SLOT_NAMES } from "../shared/dictation/conflicts";
import type { DictationStatus } from "../shared/dictation/contract";
import type { DictationPatch } from "../shared/dictation/settings";
import type { ImportOutcome, SettingsResult, ShortcutResult } from "../shared/ipc";
import type { VoiceChatVoice } from "@speakkit/protocol";
import { validateChange, type AreaName } from "../shared/control/settings-registry";
import { NEEDS_CONFIRMATION, planImport } from "../shared/settings/import";
import type { ConfigPatch } from "../shared/schemas";
import type { ShortcutId } from "../shared/shortcuts";

export interface ChangeTargets {
  /** The shortcut it clashes with when the dictation settings were refused. */
  patchDictation(patch: DictationPatch): Promise<DictationStatus["rejected"]>;
  patchApp(patch: ConfigPatch): Promise<unknown>;
  /** Capture, transcripts, meetings and engines keep their settings with the feature. */
  patchArea(area: AreaName, patch: Record<string, unknown>): Promise<unknown>;
  setShortcut(id: ShortcutId, accelerator: string): Promise<ShortcutResult>;
  /** Puts every shortcut back to its default. */
  resetShortcuts(): Promise<unknown>;
  setLaunchAtLogin(on: boolean): Promise<unknown>;
  setVoiceChatVoice(voice: VoiceChatVoice): void;
  /** Restarts the server on the port; it throws when the port cannot be used. */
  setPort(port: number): Promise<unknown>;
}

/** The one way a Settings page or an import changes settings: validated by the registry, then stored. Nothing is stored when any part is refused. */
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
    if (checked.system.port !== undefined) await t.setPort(checked.system.port);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

export interface ImportSources {
  /** The file the person picked; null when the dialog was cancelled. */
  pick(): Promise<string | null>;
  read(file: string): Promise<string>;
  /** The settings in use now, shaped like the settings file. */
  current(): Record<string, unknown>;
  /** Asks whether to apply these settings too (their plain names); false leaves them out. */
  confirm(what: string[]): Promise<boolean>;
}

/** Imports a settings file the person picks: what the registry accepts is applied, the rest is reported by name. */
export async function importSettings(src: ImportSources, t: ChangeTargets): Promise<ImportOutcome> {
  const file = await src.pick();
  if (file === null) return { status: "cancelled" };
  let text: string;
  try {
    text = await src.read(file);
  } catch {
    return { status: "failed", message: "the file could not be read." };
  }
  const plan = planImport(text, src.current());
  if (!plan.ok) return { status: "failed", message: plan.message };
  let { change, skipped, changed } = plan;
  if (plan.needsConfirmation.length && !(await src.confirm([...new Set(plan.needsConfirmation.map((k) => NEEDS_CONFIRMATION[k]!.what))]))) {
    const held = new Set(plan.needsConfirmation);
    change = Object.fromEntries(Object.entries(change).filter(([k]) => !held.has(k)));
    skipped = [...skipped, ...plan.needsConfirmation];
    changed = changed.filter((k) => !held.has(k));
    if (!Object.keys(change).length) return { status: "cancelled" };
  }
  const done = await applyChange(t, change);
  if (!done.ok) return { status: "failed", message: done.message };
  return { status: "imported", applied: Object.keys(change).length, changed, skipped };
}
