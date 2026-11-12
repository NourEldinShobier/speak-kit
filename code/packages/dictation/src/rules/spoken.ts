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
  fr: [
    { words: ["dièse", "hashtag"], out: "#", join: "next" },
    { words: ["arobase"], out: "@", join: "both" },
    { words: ["tiret bas", "tiret du bas"], out: "_", join: "both" },
    { words: ["tiret"], out: "-", join: "both" },
    { words: ["barre oblique", "slash"], out: "/", join: "both" },
    { words: ["antislash"], out: "\\", join: "both" },
    { words: ["virgule"], out: ",", join: "prev" },
    { words: ["point-virgule", "point virgule"], out: ";", join: "prev" },
    { words: ["deux-points", "deux points"], out: ":", join: "prev" },
    { words: ["point d'interrogation"], out: "?", join: "prev" },
    { words: ["point d'exclamation"], out: "!", join: "prev" },
  ],
  it: [
    { words: ["cancelletto", "hashtag"], out: "#", join: "next" },
    { words: ["chiocciola"], out: "@", join: "both" },
    { words: ["trattino basso"], out: "_", join: "both" },
    { words: ["trattino"], out: "-", join: "both" },
    { words: ["barra rovesciata"], out: "\\", join: "both" },
    { words: ["barra"], out: "/", join: "both" },
    { words: ["virgola"], out: ",", join: "prev" },
    { words: ["punto e virgola"], out: ";", join: "prev" },
    { words: ["due punti"], out: ":", join: "prev" },
    { words: ["punto interrogativo"], out: "?", join: "prev" },
    { words: ["punto esclamativo"], out: "!", join: "prev" },
  ],
  pt: [
    { words: ["jogo da velha", "hashtag"], out: "#", join: "next" },
    { words: ["arroba"], out: "@", join: "both" },
    { words: ["sublinhado", "underline"], out: "_", join: "both" },
    { words: ["hífen"], out: "-", join: "both" },
    { words: ["barra invertida"], out: "\\", join: "both" },
    { words: ["barra"], out: "/", join: "both" },
    { words: ["vírgula"], out: ",", join: "prev" },
    { words: ["ponto e vírgula"], out: ";", join: "prev" },
    { words: ["dois pontos"], out: ":", join: "prev" },
    { words: ["ponto de interrogação"], out: "?", join: "prev" },
    { words: ["ponto de exclamação"], out: "!", join: "prev" },
  ],
  nl: [
    { words: ["hekje", "hashtag"], out: "#", join: "next" },
    { words: ["apenstaartje"], out: "@", join: "both" },
    { words: ["underscore", "laag streepje"], out: "_", join: "both" },
    { words: ["streepje"], out: "-", join: "both" },
    { words: ["schuine streep"], out: "/", join: "both" },
    { words: ["backslash"], out: "\\", join: "both" },
    { words: ["komma"], out: ",", join: "prev" },
    { words: ["puntkomma"], out: ";", join: "prev" },
    { words: ["dubbele punt"], out: ":", join: "prev" },
    { words: ["vraagteken"], out: "?", join: "prev" },
    { words: ["uitroepteken"], out: "!", join: "prev" },
  ],
  tr: [
    { words: ["diyez", "hashtag"], out: "#", join: "next" },
    { words: ["et işareti", "at işareti"], out: "@", join: "both" },
    { words: ["alt çizgi"], out: "_", join: "both" },
    { words: ["tire"], out: "-", join: "both" },
    { words: ["ters eğik çizgi"], out: "\\", join: "both" },
    { words: ["eğik çizgi"], out: "/", join: "both" },
    { words: ["noktalı virgül"], out: ";", join: "prev" },
    { words: ["virgül"], out: ",", join: "prev" },
    { words: ["iki nokta"], out: ":", join: "prev" },
    { words: ["soru işareti"], out: "?", join: "prev" },
    { words: ["ünlem işareti"], out: "!", join: "prev" },
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
  fr: [
    { words: ["nouveau paragraphe"], out: "\n\n", join: "both" },
    { words: ["nouvelle ligne", "retour à la ligne"], out: "\n", join: "both" },
    { words: ["ouvrez les guillemets", "ouvrir les guillemets"], out: "«", join: "next" },
    { words: ["fermez les guillemets", "fermer les guillemets"], out: "»", join: "prev" },
  ],
  it: [
    { words: ["nuovo paragrafo"], out: "\n\n", join: "both" },
    { words: ["nuova riga", "a capo"], out: "\n", join: "both" },
    { words: ["apri virgolette"], out: "«", join: "next" },
    { words: ["chiudi virgolette"], out: "»", join: "prev" },
  ],
  pt: [
    { words: ["novo parágrafo"], out: "\n\n", join: "both" },
    { words: ["nova linha", "quebra de linha"], out: "\n", join: "both" },
    { words: ["abrir aspas"], out: "“", join: "next" },
    { words: ["fechar aspas"], out: "”", join: "prev" },
  ],
  nl: [
    { words: ["nieuwe alinea"], out: "\n\n", join: "both" },
    { words: ["nieuwe regel"], out: "\n", join: "both" },
    { words: ["aanhalingstekens openen"], out: "“", join: "next" },
    { words: ["aanhalingstekens sluiten"], out: "”", join: "prev" },
  ],
  tr: [
    { words: ["yeni paragraf"], out: "\n\n", join: "both" },
    { words: ["yeni satır"], out: "\n", join: "both" },
    { words: ["tırnak aç"], out: "“", join: "next" },
    { words: ["tırnak kapat"], out: "”", join: "prev" },
  ],
};

/** Languages that have a table. Others keep their text: the page says so in the row. */
export const SYMBOL_LANGUAGES: readonly string[] = Object.keys(symbolTables);
export const FORMATTING_LANGUAGES: readonly string[] = Object.keys(formattingTables);

// Compiled once at load; a Map, so a language code such as "constructor" finds nothing.
const compileAll = (tables: Record<string, Phrase[]>, attached: boolean): Map<string, Compiled> => new Map(Object.entries(tables).map(([lang, table]) => [lang, compile(table, attached)]));
const SYMBOLS = compileAll(symbolTables, false);
const FORMATTING = compileAll(formattingTables, true);

/** A language without a table keeps its text: every language in SYMBOL_LANGUAGES has spoken symbols; Arabic has no spoken formatting. */
export function spokenSymbols(text: string, lang: string): string {
  const table = SYMBOLS.get(lang);
  return table ? apply(text, table) : text;
}

export function spokenFormatting(text: string, lang: string): string {
  const table = FORMATTING.get(lang);
  const paired = lang === "en" ? text.replace(/(?<![\p{L}\p{N}])quote[ \t]+([^\n]+?)[ \t]+unquote(?![\p{L}\p{N}])/giu, '"$1"') : text;
  return table ? apply(paired, table) : paired;
}
