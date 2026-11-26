import { EXAMPLE } from "./templates";

/** The words of a style prompt that ask for another language, in one language of the prompt. */
interface StyleWords {
  translate: RegExp;
  /** A named language to write in. */
  inLanguage: RegExp;
  /** "Keep technical terms in English" is about single words, not the text. */
  aboutWords: RegExp;
  negated: RegExp;
}

/** What the rewrite needs to keep a dictation in its language: how the text is recognised, what the writer is told, and how a style asks for translation. */
export interface LanguageProfile {
  name: string;
  /** The Unicode properties of the letters, as the inside of a character class. */
  script: string;
  /** Letters of other languages in the same script: the writer is not told such text is in this one. */
  otherLetters?: RegExp;
  /** Added to the system prompt, after a space. */
  line: string;
  /** Takes the place of the guard's English example. */
  example: string;
  /** Takes the place of the reminder after the dictated text. */
  reminder: string;
  /** In this language; English prompts are understood for every language. */
  styleWords: StyleWords;
}

export const LANGUAGES: readonly LanguageProfile[] = [
  {
    name: "Arabic",
    script: String.raw`\p{Script=Arabic}`,
    // Persian and Urdu (their yeh and kaf, and Urdu's own). The dictation's language cannot tell: the app offers neither.
    otherLetters: /[یکٹڈڑںھہے]/,
    line: "The dictation is in Arabic. Write your reply in Arabic script, in the same dialect; never translate it or spell it in Latin letters. Keep English words that are in the text as they are.",
    example: 'Example: <dictation>ممكن يعني تبعتلي الملف</dictation> becomes "ممكن تبعتلي الملف؟"',
    reminder: "Rewrite the text above in Arabic, do not translate. Output the result only, without tags.",
    styleWords: {
      translate: /ترجم/,
      inLanguage: /(?:بال|لل|(?:باللغة|للغة|إلى|الى) ال)(?:[إأا]نجليزي|[إأا]لماني|فرنساوي|فرنسي|[إأا]سباني)/,
      aboutWords: /كلمات|مصطلح|[أا]سماء/,
      negated: /(?:^|\s)و?(?:لا|بدون|دون|من غير|بلا|عدم|مش|بلاش|ممنوع)(?=\s)|ترجم\S*ش(?!\S)/,
    },
  },
];

const ENGLISH_STYLE_WORDS: StyleWords = {
  translate: /translat/i,
  inLanguage: /\b(?:in|into|to) (?:english|german|french|spanish|italian|portuguese|dutch|polish|turkish|russian|ukrainian|lithuanian|swedish|hindi|japanese|korean|chinese)\b/i,
  aboutWords: /\b(?:words?|terms?|names?)\b/i,
  negated: /\b(?:not|no|never|without|avoid|dont)\b|n['’]t\b/i,
};

const QUOTE = /"[^"]*"|“[^”]*”|«[^»]*»/g;

/** The words without file paths, URLs and dotted or hyphenated names: that is code, whatever language is spoken around it. */
function wordsIn(text: string, { script }: LanguageProfile): string[] {
  const code = new RegExp(String.raw`[^\s${script}]*[a-z0-9][./\\_@:-][a-z0-9][^\s${script}]*`, "giu");
  return text.replace(code, " ").match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
}

const isIn = (word: string, { script }: LanguageProfile): boolean => new RegExp(`[${script}]`, "u").test(word);

/** The share of the words that are in the language's script, 0 when there are no words. Code is not counted. */
export function scriptShare(text: string, language: LanguageProfile): number {
  const words = wordsIn(text, language);
  return words.length ? words.filter((w) => isIn(w, language)).length / words.length : 0;
}

/** At least half, or from 0.3 when it starts in the script (speech with many English tech words). Quoted words do not count unless nothing else is there. */
function isMostlyIn(text: string, language: LanguageProfile): boolean {
  const unquoted = text.replace(QUOTE, " ");
  const own = wordsIn(unquoted, language).length ? unquoted : text;
  const share = scriptShare(own, language);
  return share >= 0.5 || (share >= 0.3 && isIn(wordsIn(own, language)[0]!, language));
}

/** The language whose script the text is mostly in. */
export const languageOf = (text: string): LanguageProfile | undefined => LANGUAGES.find((l) => isMostlyIn(text, l));

/** Whether a style the person wrote asks for translation, so an answer in another script is what they want. A clause that says not to does not count. */
export function asksTranslation(prompt: string, { styleWords }: LanguageProfile): boolean {
  const has = (clause: string, kind: keyof StyleWords): boolean => ENGLISH_STYLE_WORDS[kind].test(clause) || styleWords[kind].test(clause);
  return prompt.split(/[.,;:!?،؛؟\n]+/).some((clause) => !has(clause, "negated") && (has(clause, "translate") || (has(clause, "inLanguage") && !has(clause, "aboutWords"))));
}

/** The system prompt for text in `language`: its example in place of the English one, and its line. Without a language the prompt is unchanged. */
export const systemFor = (system: string, language?: LanguageProfile): string => (language ? `${system.replace(EXAMPLE, language.example)} ${language.line}` : system);
