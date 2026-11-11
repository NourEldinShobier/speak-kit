// "er" and "um" are real words in German and Portuguese, so the caller applies this to English only.
// Whole words in lowercase or with a first capital: "umbrella", "error", "Uhura", "uh-huh" and "ER" stay.
const FILLER = /[ \t]*(?<![\p{L}\p{N}'’_-])([Uu]mm?|[Uu]hh?|[Ee]rm?|[Aa]h)(?:\.{3}|…|,)?(?![\p{L}\p{N}'’_-])/gu;
// Stands where a capitalised filler was, so the next word can take over the sentence-start capital.
const CAPITAL = "";

export function stripFillers(text: string): string {
  let removed = false;
  const out = text.replace(FILLER, (match: string, word: string) => {
    removed = true;
    return /^\p{Lu}/u.test(word) ? match.slice(0, match.indexOf(word)) + CAPITAL : "";
  });
  if (!removed) return text;
  return out
    .replace(/[ \t]*(\p{Ll})?/gu, (_m: string, letter?: string) => letter?.toUpperCase() ?? "")
    .replace(/,(?=[ \t]*(?:[.!?]|$))/gm, "")
    .replace(/(^|\n)[ \t]+/g, "$1");
}
