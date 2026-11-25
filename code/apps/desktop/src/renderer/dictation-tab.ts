import type { DictationTab } from "../shared/ipc";

/** Whatever opens Dictation can ask for a tab: the open page switches at once, a page that is not open yet takes it once when it mounts. */
let wanted: DictationTab | null = null;
const listeners = new Set<(tab: DictationTab) => void>();

export function requestDictationTab(tab: DictationTab): void {
  if (listeners.size) listeners.forEach((l) => l(tab));
  else wanted = tab;
}

export function takeDictationTab(): DictationTab | null {
  const t = wanted;
  wanted = null;
  return t;
}

/** Calls `listener` for each later request while the page is open; returns the way to stop. */
export function onDictationTab(listener: (tab: DictationTab) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
