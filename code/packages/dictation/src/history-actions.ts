import type { History } from "./history";
import { foreground } from "./pipeline";
import { planPaste } from "./paste-plan";
import type { Settings } from "./settings";
import type { DictationDeps } from "./types";

/** Inserts a history entry again into the window in front now. False when the entry is gone, the window refuses text or the insertion failed. */
export async function insertEntry({ store, deps, settings }: { store: History; deps: DictationDeps; settings: Settings }, id: string): Promise<boolean> {
  const entry = await store.get(id);
  if (!entry) return false;
  const target = await foreground(deps.inserter);
  const plan = planPaste({ target, current: target, settings, interrupted: false });
  if (plan.method === "refuse") return false;
  let ok = false;
  try {
    ok = (await deps.inserter.insert({ text: entry.text, plan })).ok;
  } catch {
    // The text stays in History; the caller reports that it did not go in.
  }
  if (ok) await store.update(id, { outcome: plan.method === "copy" ? "copied" : "sent" });
  return ok;
}

/** Puts a history entry on the clipboard. */
export async function copyEntry({ store, deps }: { store: History; deps: DictationDeps }, id: string): Promise<boolean> {
  const entry = await store.get(id);
  if (!entry) return false;
  try {
    return (await deps.inserter.insert({ text: entry.text, plan: { method: "copy", reason: "manual" } })).ok;
  } catch {
    return false; // the clipboard could not be written
  }
}
