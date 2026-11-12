import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadLocale, resolveLocale, translate, translateOr, type Locale, type StringKey } from "../shared/i18n";

export interface Translator {
  locale: Locale;
  t(key: StringKey, vars?: Readonly<Record<string, string | number>>): string;
  /** A label whose key is built from an id; the fallback shows when no table has it. */
  label(key: string, fallback: string): string;
}

const make = (locale: Locale): Translator => ({ locale, t: (k, vars) => translate(locale, k, vars), label: (k, f) => translateOr(locale, k, f) });

const Ctx = createContext<Translator>(make("en"));

/** Gives the screens below it the interface language chosen in Settings (English until one is provided). */
export function LocaleProvider({ choice, children }: { choice: string; children: ReactNode }) {
  const system = typeof navigator === "undefined" ? [] : navigator.languages;
  const locale = resolveLocale(choice, system);
  const [value, setValue] = useState(() => make(locale));
  useEffect(() => {
    let live = true;
    setValue(make(locale));
    void loadLocale(locale).then(() => live && setValue(make(locale))); // a new object re-renders the screens once the table arrives
    return () => void (live = false);
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = (): Translator => useContext(Ctx);
