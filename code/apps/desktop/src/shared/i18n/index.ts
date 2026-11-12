import { EN, type StringKey } from "./en";
import { ES } from "./es";

export type { StringKey };

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

/** What the Language setting stores. */
export const LANGUAGE_CHOICES = ["system", ...LOCALES] as const;

export const TABLES: Record<Locale, Record<StringKey, string>> = { en: EN, es: ES };

/** The language the interface shows: the chosen one, or for "system" the first system language that has a table. Anything unknown is English. */
export function resolveLocale(choice: string, systemLanguages: readonly string[]): Locale {
  const pick = (tag: string) => LOCALES.find((l) => tag.toLowerCase() === l || tag.toLowerCase().startsWith(`${l}-`));
  if (choice !== "system") return pick(choice) ?? "en";
  for (const tag of systemLanguages) {
    const l = pick(tag);
    if (l) return l;
  }
  return "en";
}

/** The text for a key, with `{name}` placeholders filled in; a string a table lacks shows its English. */
export function translate(locale: Locale, key: StringKey, vars?: Readonly<Record<string, string | number>>): string {
  const text = TABLES[locale][key] || EN[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

/** Like `translate` for a key built at run time (a page or section id); the fallback is shown when no table has it. */
export function translateOr(locale: Locale, key: string, fallback: string): string {
  return key in EN ? translate(locale, key as StringKey) : fallback;
}
