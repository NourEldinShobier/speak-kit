import { describe, expect, it } from "vite-plus/test";
import { MENU, SETTINGS_NAV } from "../../renderer/routes";
import { EN } from "./en";
import { LOCALES, resolveLocale, TABLES, translate, translateOr, type StringKey } from "./index";

const keys = Object.keys(EN) as StringKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("string tables", () => {
  it.each(LOCALES)("%s has exactly the keys English has, none empty", (l) => {
    expect(Object.keys(TABLES[l]).sort()).toEqual([...keys].sort());
    expect(keys.filter((k) => !TABLES[l][k].trim())).toEqual([]);
  });

  it.each(LOCALES)("%s keeps the placeholders of every English string", (l) => {
    expect(keys.filter((k) => placeholders(TABLES[l][k]).join() !== placeholders(EN[k]).join())).toEqual([]);
  });

  it("has a name for every menu group and page and every settings group and section", () => {
    const wanted = [...MENU.flatMap((g) => [`group.${g.group}`, ...g.items.map((i) => `page.${i.page}`)]), ...SETTINGS_NAV.flatMap((g) => [`group.${g.group}`, ...g.items.map((i) => `sub.${i.id}`)])];
    expect(wanted.filter((k) => !(k in EN))).toEqual([]);
  });

  it("translates a page title", () => {
    expect(translate("es", "sub.storage")).toBe("Almacenamiento");
  });
});

describe("resolveLocale", () => {
  it.each([
    ["es", ["en-US"], "es"],
    ["en", ["es-ES"], "en"],
    ["system", ["fr-FR", "es-MX", "en-US"], "es"],
    ["system", ["ES"], "es"],
    ["system", ["fr-FR"], "en"],
    ["system", [], "en"],
    ["fr", ["es"], "en"],
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
