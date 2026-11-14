import { beforeAll, describe, expect, it } from "vite-plus/test";
import { LOCALES as _L } from "./index";
import { MENU, SETTINGS_NAV } from "../../renderer/routes";
import { EN } from "./en";
import { PACK_EN } from "./pack";
import "./packs/apps";
import "./packs/shell";
import "./packs/settings";
import "./packs/main";
import "./packs/experiments";
import "./packs/export";
import "./packs/library";
import { directionOf, languageOptions, listOf, loadLocale, LOCALES, NATIVE_NAMES, resolveLocale, TABLES, translate, translateOr, type StringKey } from "./index";

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));

const ALL: Record<string, string> = { ...EN, ...PACK_EN };
const table = (l: (typeof LOCALES)[number]): Record<string, string> => (l === "en" ? ALL : TABLES[l]);
const keys = Object.keys(ALL) as StringKey[];
/** The variables of a string, including the number a plural reads. */
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)(?:\}|, plural)/g)].map((m) => m[1]).sort();

describe("string tables", () => {
  it.each(LOCALES)("%s has exactly the keys English has, none empty", (l) => {
    expect(Object.keys(table(l)).sort()).toEqual([...keys].sort());
    expect(keys.filter((k) => !table(l)[k]?.trim())).toEqual([]);
  });

  it.each(LOCALES)("%s keeps the placeholders of every English string", (l) => {
    expect(keys.filter((k) => placeholders(table(l)[k] ?? "").join() !== placeholders(ALL[k]!).join())).toEqual([]);
  });

  it("has a name for every menu group and page and every settings group and section", () => {
    const wanted = [...MENU.flatMap((g) => [`group.${g.group}`, ...g.items.map((i) => `page.${i.page}`)]), ...SETTINGS_NAV.flatMap((g) => [`group.${g.group}`, ...g.items.map((i) => `sub.${i.id}`)])];
    expect(wanted.filter((k) => !(k in EN))).toEqual([]);
  });

  it("translates a page title", () => {
    expect(translate("es", "sub.storage")).toBe("Almacenamiento");
    expect(translate("de", "sub.storage")).toBe("Speicher");
    expect(translate("fr", "sub.storage")).toBe("Stockage");
    expect(translate("ar", "sub.storage")).toBe("التخزين");
  });

  it("names each language in its own name and gives each a direction", () => {
    expect(LOCALES.map((l) => NATIVE_NAMES[l])).toEqual(["English", "Español", "Deutsch", "Français", "العربية"]);
    expect(LOCALES.map(directionOf)).toEqual(["ltr", "ltr", "ltr", "ltr", "rtl"]);
  });

  it("offers the system default first, then each language in its own name", () => {
    expect(languageOptions("Systemstandard")).toEqual([
      { value: "system", label: "Systemstandard" },
      { value: "en", label: "English" },
      { value: "es", label: "Español" },
      { value: "de", label: "Deutsch" },
      { value: "fr", label: "Français" },
      { value: "ar", label: "العربية" },
    ]);
  });

  it("writes a number in the grouping of the language and leaves a string as it is", () => {
    expect(translate("en", "fold.count", { n: 1234 })).toBe("1,234 settings");
    expect(translate("de", "fold.count", { n: 1234 })).toBe("1.234 Einstellungen");
    expect(translate("ar", "fold.count", { n: 1234 })).toBe("1,234 إعدادات");
    expect(translate("fr", "home.portBusy", { port: "47615" })).toBe("Le port 47615 est utilisé");
  });
});

describe("resolveLocale", () => {
  it.each([
    ["es", ["en-US"], "es"],
    ["en", ["es-ES"], "en"],
    ["system", ["pt-BR", "es-MX", "en-US"], "es"],
    ["system", ["ES"], "es"],
    ["system", ["fr-FR"], "fr"],
    ["system", ["it-IT", "de-AT"], "de"],
    ["system", ["ar-EG"], "ar"],
    ["system", ["pt-BR"], "en"],
    ["system", [], "en"],
    ["fr", ["es"], "fr"],
    ["pt", ["es"], "en"],
    ["", ["es"], "en"],
    ["system", ["esperanto"], "en"],
  ])("choice %j with system %j shows %s", (choice, system, shown) => {
    expect(resolveLocale(choice, system)).toBe(shown);
  });
});

describe("translate", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(translate("en", "general.importSkipped", { n: 3, skipped: "a, b" })).toBe("Imported 3 settings. Left out: a, b.");
    expect(translate("es", "general.importDone", { n: 1 })).toBe("Se importaron 1 ajustes.");
    expect(translate("en", "general.importDone")).toBe("Imported {n} settings.");
    expect(translate("en", "general.importDone", { x: 1 })).toBe("Imported {n} settings.");
  });

  it("shows English for a string a table lacks", () => {
    const saved = TABLES.es["nav.menu"];
    TABLES.es["nav.menu"] = "";
    expect(translate("es", "nav.menu")).toBe("Menu");
    TABLES.es["nav.menu"] = saved;
  });

  it("translateOr uses the fallback for a key no table has", () => {
    expect(translateOr("es", "page.home", "Home")).toBe("Inicio");
    expect(translateOr("es", "page.nothing", "Nothing")).toBe("Nothing");
  });
});

describe("plurals and lists", () => {
  it("picks the form of the language's own plural rule", () => {
    expect([1, 2].map((n) => translate("en", "quit.exports", { n }))).toEqual(["The export is cancelled", "The exports are cancelled"]);
    expect([1, 5].map((n) => translate("es", "pal.count", { n }))).toEqual(["1 resultado", "5 resultados"]);
    expect([0, 1, 2, 3, 11].map((n) => translate("ar", "lib.readings", { n }))).toEqual(["0 قراءة", "قراءة واحدة", "قراءتان", "3 قراءات", "11 قراءة"]);
    expect(translate("de", "export.chaptersFound", { n: 2 })).toBe("2 Überschriften im Text gefunden.");
  });

  it("groups the number a plural shows in the language's digits", () => {
    expect(translate("de", "pal.count", { n: 1234 })).toBe("1.234 Ergebnisse");
  });

  it("joins a list the way the language does", () => {
    expect(listOf("en", ["a", "b", "c"])).toBe("a, b, and c");
    expect(listOf("es", ["a", "b"])).toBe("a y b");
    expect(translate("de", "quit.leadBusy", { busy: listOf("de", ["1 Vorlesung läuft", "2 Exporte werden erstellt"]) })).toBe(
      "1 Vorlesung läuft und 2 Exporte werden erstellt. Beim Beenden stoppt Folgendes:",
    );
  });

  it("keeps feature text out of the base table", () => {
    expect(Object.keys(PACK_EN).filter((k) => k in EN)).toEqual([]);
    expect(translate("en", "lib.deleted", { title: "Notes" })).toBe('Deleted "Notes".');
    expect(translate("fr", "lib.deleted", { title: "Notes" })).toBe("« Notes » a été supprimée.");
  });
});
