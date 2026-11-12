import { EN, type StringKey } from "./en";

export type { StringKey };

export const LOCALES = ["en", "es", "de", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

/** What the Language setting stores. */
export const LANGUAGE_CHOICES = ["system", ...LOCALES] as const;

type Table = Record<StringKey, string>;

/** The tables loaded so far: English always, the others after `loadLocale` (they stay out of the first bundle). */
export const TABLES = { en: EN } as Record<Locale, Table>;

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<Table>> = {
  es: () => import("./es").then((m) => m.ES),
  de: () => import("./de").then((m) => m.DE),
  fr: () => import("./fr").then((m) => m.FR),
  ar: () => import("./ar").then((m) => m.AR),
};

/** Loads a language's table; until it is loaded `translate` shows English. */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale !== "en" && !TABLES[locale]) TABLES[locale] = await LOADERS[locale]();
}

/** Each language in its own name, for the language select. */
export const NATIVE_NAMES: Record<Locale, string> = { en: "English", es: "Español", de: "Deutsch", fr: "Français", ar: "العربية" };

/** The options of the language select: the system default, then each language in its own name. */
export const languageOptions = (systemLabel: string) => [{ value: "system", label: systemLabel }, ...LOCALES.map((l) => ({ value: l, label: NATIVE_NAMES[l] }))];

/** The writing direction of a language; the document takes it as `dir`. */
export const directionOf = (locale: Locale): "ltr" | "rtl" => (locale === "ar" ? "rtl" : "ltr");

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

/** The text for a key, with `{name}` placeholders filled in (a number in the language's own digits and grouping; pass an id such as a port as a string); a string a table lacks shows its English. */
export function translate(locale: Locale, key: StringKey, vars?: Readonly<Record<string, string | number>>): string {
  const text = TABLES[locale]?.[key] || EN[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? shown(locale, vars[name]!) : m)) : text;
}

/** Like `translate` for a key built at run time (a page or section id); the fallback is shown when no table has it. */
export function translateOr(locale: Locale, key: string, fallback: string): string {
  return key in EN ? translate(locale, key as StringKey) : fallback;
}

const shown = (locale: Locale, v: string | number) => (typeof v === "number" ? new Intl.NumberFormat(locale).format(v) : v);
