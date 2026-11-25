/** One word of a text, with where it sits. */
export interface Word {
  text: string;
  /** Lower case, the form words are compared in. */
  key: string;
  start: number;
  end: number;
}

// Letters, digits and the marks that make an accent, with an inner apostrophe or hyphen ("don't", "built-in"); punctuation and spaces separate words.
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu;

/** Offsets are those of `text` itself; the key is the word in composed form and lower case, so "Café" typed with a loose accent equals the composed one. */
export const wordsOf = (text: string): Word[] => [...text.matchAll(WORD)].map((m) => ({ text: m[0], key: m[0].normalize("NFC").toLowerCase(), start: m.index, end: m.index + m[0].length }));

/** Frequent English words that carry no content: an edit that only swaps these is a grammar fix, not a mishearing. */
const FUNCTION_WORDS = new Set(
  "a an the and or but nor so yet if then than that this these those there their they them he she it its his her we you your our i me my is are was were be been am do does did have has had will would can could should may might must not no to of in on at by for from with as into up out off over about after before so too very just also".split(
    " ",
  ),
);

export const isFunctionWord = (key: string): boolean => FUNCTION_WORDS.has(key);

/** Everyday English, which turns up in ordinary text: swapping such words everywhere would change sentences that were right. */
const EVERYDAY_WORDS = new Set(
  `all also any back because been come day each even find first get give go good great how its just know last like long look make many more most much new now number only other out people place right said same see seem
  some still take tell than them then think time two use very want way well what when where which while who why work world year able add after again against ago air always another answer ask away bad big book both bring build
  business call came car case change check child city clear close cloud code come company control country course cut data deal different does done door down early easy end enough every example face fact family far fast feel few field file
  fine form found friend full game gave group grow hand hard head hear help here high home hope hour house idea important information issue keep kind late lead learn leave left let life line list little live local lot love low main man
  mean meet might mind money month move name near need next night note once open order own page paper part past pay play point power problem program public put question quick read real reason red rest result room run say school
  second send set show side simple small sound speak start state stay story student study sure system talk team test thing thought three today together told took top town try turn under until user value voice wait walk water week
  white whole woman word write young app apple blue brown cat dog green fire gold light moon music paper race river rock sun star stone tree wind wood yes yellow zero`.split(/\s+/),
);

/** Every word of the phrase is a function word or an everyday one. */
export function isCommonPhrase(phrase: string): boolean {
  const words = wordsOf(phrase);
  return words.length > 0 && words.every((w) => FUNCTION_WORDS.has(w.key) || EVERYDAY_WORDS.has(w.key));
}

/** Figures, and links, paths, addresses and file names: nothing to learn from. */
export const hasDigits = (text: string): boolean => /\d/.test(text);
export const looksTechnical = (text: string): boolean => /https?:|www\.|[\\/@]|\w\.\w{2,}/i.test(text);
