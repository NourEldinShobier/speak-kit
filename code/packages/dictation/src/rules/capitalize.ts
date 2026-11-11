// A full stop after these does not end a sentence.
const ABBREVIATION = /(?:^|[^\p{L}])(?:\p{L}|mr|mrs|ms|dr|prof|vs)$/iu;
const SENTENCE_START = /(?<lead>^|[.!?]\s+|\n[ \t]*)(?<quote>["“'([]?)(?<letter>\p{Ll})/gu;

/** Capital letter at the start of the text, after a line break and after a sentence end. */
export function capitalize(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(SENTENCE_START)) {
    const { lead, quote, letter } = m.groups as Record<"lead" | "quote" | "letter", string>;
    if (lead.startsWith(".") && ABBREVIATION.test(text.slice(0, m.index))) continue;
    out += text.slice(last, m.index) + lead + quote + letter.toUpperCase();
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}
