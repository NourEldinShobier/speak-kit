import type { History } from "./history";
import { foreground } from "./pipeline";
import { planPaste } from "./paste-plan";
import type { Settings } from "./settings";
import type { Clip, Dictation, DictationDeps } from "./types";

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

/** The kept recording of an entry; a recording that cannot be read is no recording. */
async function recording({ store, deps }: { store: History; deps: DictationDeps }, id: string): Promise<Clip | undefined> {
  const file = (await store.get(id))?.audio;
  if (!file || !deps.audio) return undefined;
  try {
    return await deps.audio.load(file);
  } catch {
    return undefined;
  }
}

/** The history part of the dictation object: the store's reads and removals, and what acts on an entry (copy, insert again, its recording). */
export function historyApi(h: { store: History; deps: DictationDeps; settings(): Settings; disposed(): boolean }): Dictation["history"] {
  const { store, deps } = h;
  return {
    list: (query) => store.list(query),
    get: (id) => store.get(id),
    copy: (id) => copyEntry({ store, deps }, id),
    insert: (id) => (h.disposed() ? Promise.resolve(false) : insertEntry({ store, deps, settings: h.settings() }, id)),
    recent: async (n) => (await store.list({ limit: n })).map(({ via: _via, ...e }) => e),
    remove: (id) => store.remove(id),
    removeMany: (ids) => store.removeMany(ids),
    stats: () => store.stats(),
    clear: () => store.clear(),
    status: () => store.status(),
    preservedAs: () => store.preservedAs(),
    addVersion: (id, v) => store.addVersion(id, v),
    useVersion: (id, vid) => store.useVersion(id, vid),
    audio: (id) => recording({ store, deps }, id),
    dropAudio: (files) => store.dropAudio(files),
  };
}
