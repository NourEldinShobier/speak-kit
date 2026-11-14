import { Fragment, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadLocale, resolveLocale, setActiveLocale, translate, translateOr, type Locale, type StringKey } from "../shared/i18n";

export interface Translator {
  locale: Locale;
  t(key: StringKey, vars?: Readonly<Record<string, string | number>>): string;
  /** A label whose key is built from an id; the fallback shows when no table has it. */
  label(key: string, fallback: string): string;
}

const make = (locale: Locale): Translator => ({ locale, t: (k, vars) => translate(locale, k, vars), label: (k, f) => translateOr(locale, k, f) });

/** The English translator, for code that runs without a screen. */
export const ENGLISH = make("en");

const Ctx = createContext<Translator>(ENGLISH);

/** Gives the screens below it the interface language chosen in Settings (English until one is provided). */
export function LocaleProvider({ choice, children }: { choice: string; children: ReactNode }) {
  const system = typeof navigator === "undefined" ? [] : navigator.languages;
  const locale = resolveLocale(choice, system);
  setActiveLocale(locale); // text built outside a screen (error sentences, the engine label) follows the same language
  const [value, setValue] = useState(() => make(locale));
  useEffect(() => {
    let live = true;
    setValue(make(locale));
    void loadLocale(locale).then(() => live && setValue(make(locale))); // a new object re-renders the screens once the table arrives
    return () => void (live = false);
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Text with `**bold**` parts, which a translation keeps in its own word order. */
export const Rich = ({ text }: { text: string }) => (
  <>
    {text.split("**").map((part, i) => (
      <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
    ))}
  </>
);

export const useT = (): Translator => useContext(Ctx);
