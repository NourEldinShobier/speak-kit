/** m:ss, or h:mm:ss from one hour; clamped at 0. Shared by the extension, the desktop reader and the library. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(m).padStart(2, "0")}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

const pluralRules = new Intl.PluralRules("en");
/** `count` with the right noun form: plural(3, "page", "pages") is "3 pages". English rules via Intl.PluralRules, so a locale can replace them later. */
export function plural(count: number, one: string, other: string): string {
  return `${count} ${pluralRules.select(count) === "one" ? one : other}`;
}

/** Collator-based name comparison for sorting lists the user reads: case-insensitive, numbers in natural order ("Voice 2" before "Voice 10"). */
export const compareNames: (a: string, b: string) => number = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;
