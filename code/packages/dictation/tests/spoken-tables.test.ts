import { describe, expect, it } from "vite-plus/test";
import { applyRules, FORMATTING_LANGUAGES, SYMBOL_LANGUAGES, type RulesOptions } from "../src";

const off: RulesOptions = { fillers: false, spokenSymbols: false, spokenFormatting: false, autoCapitalize: false, trailingSpace: false, replacements: [], language: "en" };
const sym = (text: string, language: string) => applyRules(text, { ...off, spokenSymbols: true, language });
const fmt = (text: string, language: string) => applyRules(text, { ...off, spokenFormatting: true, language });

describe("which languages have tables", () => {
  it("lists them", () => {
    expect([...SYMBOL_LANGUAGES]).toEqual(["en", "de", "es", "ar"]);
    expect([...FORMATTING_LANGUAGES]).toEqual(["en", "de", "es"]);
  });
});

describe("spoken symbols, every phrase of every language", () => {
  const table: [string, string, string][] = [
    ["en", "tag hashtag launch", "tag #launch"],
    ["en", "tag hash sign launch", "tag #launch"],
    ["en", "a at sign b", "a@b"],
    ["en", "a underscore b", "a_b"],
    ["en", "a hyphen b", "a-b"],
    ["en", "a slash b", "a/b"],
    ["en", "a forward slash b", "a/b"],
    ["en", "a backslash b", "a\\b"],
    ["en", "a comma b", "a, b"],
    ["en", "a semicolon b", "a; b"],
    ["en", "a colon b", "a: b"],
    ["de", "tag raute start", "tag #start"],
    ["de", "tag hashtag start", "tag #start"],
    ["de", "a at-zeichen b", "a@b"],
    ["de", "a klammeraffe b", "a@b"],
    ["de", "a unterstrich b", "a_b"],
    ["de", "a bindestrich b", "a-b"],
    ["de", "a schrägstrich b", "a/b"],
    ["de", "a komma b", "a, b"],
    ["de", "a semikolon b", "a; b"],
    ["de", "a strichpunkt b", "a; b"],
    ["de", "a doppelpunkt b", "a: b"],
    ["de", "was fragezeichen wie", "was? wie"],
    ["de", "halt ausrufezeichen weiter", "halt! weiter"],
    ["es", "tag almohadilla inicio", "tag #inicio"],
    ["es", "tag hashtag inicio", "tag #inicio"],
    ["es", "a arroba b", "a@b"],
    ["es", "a guion bajo b", "a_b"],
    ["es", "a guion b", "a-b"],
    ["es", "a barra b", "a/b"],
    ["es", "a punto y coma b", "a; b"],
    ["es", "a dos puntos b", "a: b"],
    ["es", "a coma b", "a, b"],
    ["ar", "أ فاصلة منقوطة ب", "أ؛ ب"],
    ["ar", "أ فاصلة ب", "أ، ب"],
    ["ar", "أ علامة استفهام ب", "أ؟ ب"],
    ["ar", "أ نقطتان ب", "أ: ب"],
    ["ar", "أ شرطة سفلية ب", "أ_ب"],
    ["ar", "أ شرطة ب", "أ-ب"],
  ];
  it.each(table)("%s: %s", (lang, said, written) => {
    expect(sym(said, lang)).toBe(written);
  });
  it("keeps a trailing comma phrase's following space and takes the one before it", () => {
    expect(sym("a   comma   b", "en")).toBe("a, b");
    expect(sym("a comma", "en")).toBe("a,");
  });
});

describe("spoken symbols match whole phrases, ignoring case and accents", () => {
  it("ignores case", () => {
    expect(sym("a COMMA b", "en")).toBe("a, b");
    expect(sym("a SchrÄgstrich b", "de")).toBe("a/b");
  });
  it("matches a phrase written without its accent", () => {
    expect(sym("a schragstrich b", "de")).toBe("a/b");
    expect(sym("a PUNTO Y COMA b", "es")).toBe("a; b");
    expect(sym("a guión b", "es")).toBe("a-b");
  });
  it("leaves a phrase that is part of a longer word", () => {
    expect(sym("commas and slashes", "en")).toBe("commas and slashes");
    expect(sym("recolon", "en")).toBe("recolon");
    expect(sym("barras", "es")).toBe("barras");
    expect(sym("ñcoma", "es")).toBe("ñcoma");
  });
  it("prefers the longer phrase that starts with a shorter one", () => {
    expect(sym("a guion bajo b", "es")).toBe("a_b");
    expect(sym("a forward slash b", "en")).toBe("a/b");
  });
  it("takes no table for a language without one, or for a name that is on the object prototype", () => {
    expect(sym("a comma b", "fr")).toBe("a comma b");
    expect(sym("a comma b", "constructor")).toBe("a comma b");
    expect(sym("a comma b", "__proto__")).toBe("a comma b");
    expect(sym("a comma b", "")).toBe("a comma b");
  });
  it("does not use another language's table", () => {
    expect(sym("a komma b", "en")).toBe("a komma b");
    expect(sym("a comma b", "de")).toBe("a comma b");
  });
});

describe("spoken formatting, every phrase of every language", () => {
  const table: [string, string, string][] = [
    ["en", "one new paragraph two", "one\n\ntwo"],
    ["en", "one new line two", "one\ntwo"],
    ["en", "one line break two", "one\ntwo"],
    ["en", "say open quote hi close quote now", 'say "hi" now'],
    ["de", "eins neuer absatz zwei", "eins\n\nzwei"],
    ["de", "eins neue zeile zwei", "eins\nzwei"],
    ["de", "eins zeilenumbruch zwei", "eins\nzwei"],
    ["de", "sag anführungszeichen auf hallo anführungszeichen zu jetzt", "sag „hallo“ jetzt"],
    ["es", "uno nuevo párrafo dos", "uno\n\ndos"],
    ["es", "uno nueva línea dos", "uno\ndos"],
    ["es", "uno salto de línea dos", "uno\ndos"],
    ["es", "di abrir comillas hola cerrar comillas ya", "di «hola» ya"],
  ];
  it.each(table)("%s: %s", (lang, said, written) => {
    expect(fmt(said, lang)).toBe(written);
  });
  it("swallows one punctuation mark the model put after the phrase", () => {
    for (const mark of [".", ",", ";", "!", "?"]) expect(fmt(`one new paragraph${mark} two`, "en")).toBe("one\n\ntwo");
    expect(fmt("one new line.. two", "en")).toBe("one\n. two");
    expect(fmt("one neue zeile, zwei", "de")).toBe("one\nzwei");
  });
  it("matches accents loosely and ignores case", () => {
    expect(fmt("uno NUEVO PARRAFO dos", "es")).toBe("uno\n\ndos");
    expect(fmt("uno Nueva Linea dos", "es")).toBe("uno\ndos");
    expect(fmt("eins ANFÜHRUNGSZEICHEN AUF x anfuhrungszeichen zu", "de")).toBe("eins „x“");
  });
  it("needs whole words", () => {
    expect(fmt("renew line", "en")).toBe("renew line");
    expect(fmt("new lines", "en")).toBe("new lines");
  });
  it("has the quote and unquote pair for English only", () => {
    expect(fmt("he said quote hello there unquote ok", "en")).toBe('he said "hello there" ok');
    expect(fmt("he said QUOTE hello UNQUOTE ok", "en")).toBe('he said "hello" ok');
    expect(fmt("he said quote hello unquote ok", "de")).toBe("he said quote hello unquote ok");
    expect(fmt("quote hello", "en")).toBe("quote hello");
    expect(fmt("quote a\nb unquote", "en")).toBe("quote a\nb unquote");
    expect(fmt("requote hello unquote", "en")).toBe("requote hello unquote");
  });
  it("has no formatting for Arabic or an unknown language", () => {
    expect(fmt("a new line b", "ar")).toBe("a new line b");
    expect(fmt("a new line b", "xx")).toBe("a new line b");
  });
});
