import { EXAMPLE } from "./templates";

const ARABIC_EXAMPLE = 'Example: <dictation>ممكن يعني تبعتلي الملف</dictation> becomes "ممكن تبعتلي الملف؟"';
const ARABIC_LINE =
  " The dictation is in Arabic. Write your reply in Arabic script, in the same dialect; never translate it or spell it in Latin letters. Keep English words that are in the text as they are.";

/** Letters of Persian and Urdu (their yeh and kaf, and Urdu's own) that Arabic text does not use. The dictation's language cannot tell: the app offers neither. */
const OTHER_LETTERS = /[یکٹڈڑںھہے]/;

/** A request to translate, or to write in another language, in English or Arabic. */
const TRANSLATE = /translat|ترجم/i;
const IN_LANGUAGE =
  /\b(?:in|into|to) (?:english|german|french|spanish|italian|portuguese|dutch|polish|turkish|russian|ukrainian|lithuanian|swedish|hindi|japanese|korean|chinese)\b|(?:بال|لل|(?:باللغة|للغة|إلى|الى) ال)(?:[إأا]نجليزي|[إأا]لماني|فرنساوي|فرنسي|[إأا]سباني)/i;
/** "Keep technical terms in English" is about single words, not the text. */
const ABOUT_WORDS = /\b(?:words?|terms?|names?)\b|كلمات|مصطلح|[أا]سماء/i;
const NEGATED = /\b(?:not|no|never|without|avoid|dont)\b|n['’]t\b|(?:^|\s)و?(?:لا|بدون|دون|من غير|بلا|عدم|مش|بلاش|ممنوع)(?=\s)|ترجم\S*ش(?!\S)/i;

/** File paths, URLs and dotted or hyphenated names: code, whatever language is spoken around it. */
const CODE = /[^\s\p{Script=Arabic}]*[a-z0-9][./\\_@:-][a-z0-9][^\s\p{Script=Arabic}]*/giu;
const QUOTE = /"[^"]*"|“[^”]*”|«[^»]*»/g;

const wordsIn = (text: string): string[] => text.replace(CODE, " ").match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
const isArabic = (word: string): boolean => /\p{Script=Arabic}/u.test(word);

/** The share of the words that are in Arabic script, 0 when there are no words. Code is not counted. */
export function arabicShare(text: string): number {
  const words = wordsIn(text);
  return words.length ? words.filter(isArabic).length / words.length : 0;
}

/** At least half, or from 0.3 when it starts in Arabic (Arabic speech with many English tech words). Quoted words do not count unless nothing else is there. */
export function isMostlyArabic(text: string): boolean {
  const unquoted = text.replace(QUOTE, " ");
  const own = wordsIn(unquoted).length ? unquoted : text;
  const share = arabicShare(own);
  return share >= 0.5 || (share >= 0.3 && isArabic(wordsIn(own)[0]!));
}

/** Whether a style the person wrote asks for translation, so an answer in another script is what they want. A clause that says not to does not count. */
export const asksTranslation = (prompt: string): boolean =>
  prompt.split(/[.,;:!?،؛؟\n]+/).some((clause) => !NEGATED.test(clause) && (TRANSLATE.test(clause) || (IN_LANGUAGE.test(clause) && !ABOUT_WORDS.test(clause))));

/** Whether the writer is to be told the text is Arabic. */
export const tellsArabic = (text: string): boolean => isMostlyArabic(text) && !OTHER_LETTERS.test(text);

/** The system prompt for Arabic text: the Arabic example in place of the English one, and a line naming the language. */
export const arabicSystem = (system: string): string => system.replace(EXAMPLE, ARABIC_EXAMPLE) + ARABIC_LINE;
