/** One-shot: the page that opens Vocabulary can ask for a tab, and the page takes it once when it mounts. */
import type { VocabularyTab } from "./VocabularyPage";

let wanted: VocabularyTab | null = null;

export const requestVocabularyTab = (tab: VocabularyTab): void => void (wanted = tab);

export function takeVocabularyTab(): VocabularyTab | null {
  const t = wanted;
  wanted = null;
  return t;
}
