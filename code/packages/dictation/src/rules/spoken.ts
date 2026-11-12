import { apply, compile, type Compiled, type Phrase } from "./phrases";

const symbolTables: Record<string, Phrase[]> = {
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
    { words: ["fragezeichen"], out: "?", join: "prev" },
    { words: ["ausrufezeichen"], out: "!", join: "prev" },
  ],
  es: [
    { words: ["almohadilla", "hashtag"], out: "#", join: "next" },
    { words: ["arroba"], out: "@", join: "both" },
    { words: ["guion bajo"], out: "_", join: "both" },
    { words: ["guion"], out: "-", join: "both" },
    { words: ["barra"], out: "/", join: "both" },
    { words: ["punto y coma"], out: ";", join: "prev" },
    { words: ["dos puntos"], out: ":", join: "prev" },
    { words: ["coma"], out: ",", join: "prev" },
  ],
  // Written for Arabic punctuation: the comma and semicolon are the Arabic ones.
  ar: [
    { words: ["فاصلة منقوطة"], out: "؛", join: "prev" },
    { words: ["فاصلة"], out: "،", join: "prev" },
    { words: ["علامة استفهام"], out: "؟", join: "prev" },
    { words: ["نقطتان"], out: ":", join: "prev" },
    { words: ["شرطة سفلية"], out: "_", join: "both" },
    { words: ["شرطة"], out: "-", join: "both" },
  ],
};

const formattingTables: Record<string, Phrase[]> = {
  en: [
    { words: ["new paragraph"], out: "\n\n", join: "both" },
    { words: ["new line", "line break"], out: "\n", join: "both" },
    { words: ["open quote"], out: '"', join: "next" },
    { words: ["close quote"], out: '"', join: "prev" },
  ],
  de: [
    { words: ["neuer absatz"], out: "\n\n", join: "both" },
    { words: ["neue zeile", "zeilenumbruch"], out: "\n", join: "both" },
    { words: ["anführungszeichen auf"], out: "„", join: "next" },
    { words: ["anführungszeichen zu"], out: "“", join: "prev" },
  ],
  es: [
    { words: ["nuevo párrafo"], out: "\n\n", join: "both" },
    { words: ["nueva línea", "salto de línea"], out: "\n", join: "both" },
    { words: ["abrir comillas"], out: "«", join: "next" },
    { words: ["cerrar comillas"], out: "»", join: "prev" },
  ],
};

/** Languages that have a table. Others keep their text: the page says so in the row. */
export const SYMBOL_LANGUAGES: readonly string[] = Object.keys(symbolTables);
export const FORMATTING_LANGUAGES: readonly string[] = Object.keys(formattingTables);

// Compiled once at load; a Map, so a language code such as "constructor" finds nothing.
const compileAll = (tables: Record<string, Phrase[]>, attached: boolean): Map<string, Compiled> => new Map(Object.entries(tables).map(([lang, table]) => [lang, compile(table, attached)]));
const SYMBOLS = compileAll(symbolTables, false);
const FORMATTING = compileAll(formattingTables, true);

/** A language without a table keeps its text: English, German, Spanish and Arabic have spoken symbols; Arabic has no spoken formatting. */
export function spokenSymbols(text: string, lang: string): string {
  const table = SYMBOLS.get(lang);
  return table ? apply(text, table) : text;
}

export function spokenFormatting(text: string, lang: string): string {
  const table = FORMATTING.get(lang);
  const paired = lang === "en" ? text.replace(/(?<![\p{L}\p{N}])quote[ \t]+([^\n]+?)[ \t]+unquote(?![\p{L}\p{N}])/giu, '"$1"') : text;
  return table ? apply(paired, table) : paired;
}
