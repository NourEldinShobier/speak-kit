import { apply, compile, type Compiled, type Phrase } from "./phrases";

const SYMBOLS: Record<string, Phrase[]> = {
  en: [
    { words: ["hashtag", "hash sign"], out: "#", join: "next" },
    { words: ["at sign"], out: "@", join: "both" },
    { words: ["underscore"], out: "_", join: "both" },
    { words: ["hyphen"], out: "-", join: "both" },
    { words: ["slash", "forward slash"], out: "/", join: "both" },
    { words: ["backslash"], out: "\\", join: "both" },
    { words: ["comma"], out: ",", join: "prev" },
    { words: ["semicolon"], out: ";", join: "prev" },
    { words: ["colon"], out: ":", join: "prev" },
  ],
  de: [
    { words: ["raute", "hashtag"], out: "#", join: "next" },
    { words: ["at-zeichen", "klammeraffe"], out: "@", join: "both" },
    { words: ["unterstrich"], out: "_", join: "both" },
    { words: ["bindestrich"], out: "-", join: "both" },
    { words: ["schrägstrich"], out: "/", join: "both" },
    { words: ["komma"], out: ",", join: "prev" },
    { words: ["semikolon", "strichpunkt"], out: ";", join: "prev" },
    { words: ["doppelpunkt"], out: ":", join: "prev" },
  ],
};

const FORMATTING: Record<string, Phrase[]> = {
  en: [
    { words: ["new paragraph"], out: "\n\n", join: "both" },
    { words: ["new line", "line break"], out: "\n", join: "both" },
    { words: ["open quote"], out: '"', join: "next" },
    { words: ["close quote"], out: '"', join: "prev" },
  ],
  de: [
    { words: ["neuer absatz"], out: "\n\n", join: "both" },
    { words: ["neue zeile", "zeilenumbruch"], out: "\n", join: "both" },
  ],
};

const compiled = new Map<string, Compiled>();
function tableFor(kind: "symbols" | "formatting", lang: string): Compiled | undefined {
  const key = `${kind}:${lang}`;
  const table = (kind === "symbols" ? SYMBOLS : FORMATTING)[lang];
  if (table && !compiled.has(key)) compiled.set(key, compile(table, kind === "formatting"));
  return compiled.get(key);
}

/** A language without a table keeps its text: only English and German have spoken symbols so far. */
export function spokenSymbols(text: string, lang: string): string {
  const table = tableFor("symbols", lang);
  return table ? apply(text, table) : text;
}

export function spokenFormatting(text: string, lang: string): string {
  const table = tableFor("formatting", lang);
  const paired = lang === "en" ? text.replace(/(?<![\p{L}\p{N}])quote[ \t]+([^\n]+?)[ \t]+unquote(?![\p{L}\p{N}])/giu, '"$1"') : text;
  return table ? apply(paired, table) : paired;
}
