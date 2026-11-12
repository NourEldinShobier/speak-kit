/** What the field holds around the caret, as far as the platform could read it. */
export interface CaretContext {
  /** The character just before the caret; "" at the start of the field. */
  before: string;
  /** Text is selected, so the paste replaces it and nothing is added. */
  selected: boolean;
}

const WORD = /[\p{L}\p{N}]/u;
const CLOSING = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}", "%", '"', "'", "’", "”", "»", "…"]);
const NO_SPACE_AFTER_SPACE = /^[\s.,;:!?)\]}%…]/u;

/**
 * The text with a space in front when the character before the caret is a letter, digit or closing punctuation and the text does not start with a space or
 * punctuation itself. An unreadable field (undefined) or a selection leaves the text as it is.
 */
export function spaceBefore(text: string, caret: CaretContext | undefined): string {
  if (!caret || caret.selected || !text || NO_SPACE_AFTER_SPACE.test(text)) return text;
  const last = [...caret.before].at(-1);
  if (last === undefined) return text;
  return WORD.test(last) || CLOSING.has(last) ? ` ${text}` : text;
}
