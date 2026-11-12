import { SLOT_NAMES } from "../shared/dictation/conflicts";
import type { DictationStatus } from "../shared/dictation/contract";
import type { DictationPatch } from "../shared/dictation/settings";
import type { ImportOutcome, SettingsResult } from "../shared/ipc";
import { validateChange } from "../shared/control/settings-registry";
import { planImport } from "../shared/settings/import";
import type { ConfigPatch } from "../shared/schemas";

export interface ChangeTargets {
  /** The shortcut it clashes with when the dictation settings were refused. */
  patchDictation(patch: DictationPatch): Promise<DictationStatus["rejected"]>;
  patchApp(patch: ConfigPatch): Promise<unknown>;
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
  if (Object.keys(checked.app).length) await t.patchApp(checked.app);
  return { ok: true };
}

export interface ImportSources {
  /** The file the person picked; null when the dialog was cancelled. */
  pick(): Promise<string | null>;
  read(file: string): Promise<string>;
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
  const plan = planImport(text);
  if (!plan.ok) return { status: "failed", message: plan.message };
  const done = await applyChange(t, plan.change);
  if (!done.ok) return { status: "failed", message: done.message };
  return { status: "imported", applied: Object.keys(plan.change).length, skipped: plan.skipped };
}
