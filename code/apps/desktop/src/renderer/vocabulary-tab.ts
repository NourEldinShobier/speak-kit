/** One-shot: the page that opens Vocabulary can ask for a tab, and the page takes it once when it mounts. */
export type VocabularyTab = "heard" | "read";

let wanted: VocabularyTab | null = null;

export const requestVocabularyTab = (tab: VocabularyTab): void => void (wanted = tab);

export function takeVocabularyTab(): VocabularyTab | null {
  const t = wanted;
  wanted = null;
  return t;
}
