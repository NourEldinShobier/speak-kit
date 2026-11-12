/** Languages dictation offers, with the model the app recommends for each. Every code here is one the engine accepts. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "lt", label: "Lithuanian" },
  { code: "sv", label: "Swedish" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
] as const;

export type SpokenLanguage = (typeof LANGUAGES)[number]["code"];
export type SttLanguage = "auto" | SpokenLanguage;
export const AUTO_LABEL = "Detect automatically";
export const STT_LANGUAGE_CODES: readonly SttLanguage[] = ["auto", ...LANGUAGES.map((l) => l.code)];

export const isSttLanguage = (x: unknown): x is SttLanguage => typeof x === "string" && (STT_LANGUAGE_CODES as readonly string[]).includes(x);

export const languageLabel = (code: SttLanguage): string => (code === "auto" ? AUTO_LABEL : (LANGUAGES.find((l) => l.code === code)?.label ?? code));

/** What a model must say about itself for the language rules. */
export interface LanguageFacts {
  id: string;
  languages: readonly SttLanguage[];
  /** The model can pick the language itself. */
  detects: boolean;
}

export interface LanguageRow {
  language: SttLanguage;
  /** The model Speak Kit picks for this language. */
  recommended: string;
  /** Other models that handle it. */
  alsoWorks: string[];
}

/** One row per language: the preferred model that handles it is recommended, else the first that does; the rest "also work". */
export function languageTable(models: readonly LanguageFacts[], preference: Record<string, string>): LanguageRow[] {
  const rows: LanguageRow[] = [];
  for (const language of STT_LANGUAGE_CODES) {
    const fits = models.filter((m) => m.languages.includes(language) && (language !== "auto" || m.detects));
    if (fits.length === 0) continue;
    const pick = fits.find((m) => m.id === preference[language]) ?? fits[0]!;
    rows.push({ language, recommended: pick.id, alsoWorks: fits.filter((m) => m !== pick).map((m) => m.id) });
  }
  return rows;
}

export interface ResolvedPair {
  language: SttLanguage;
  /** The saved language was not one this model handles, so English was chosen; the row says so. */
  changed: boolean;
}

/** Makes a saved (model, language) pair valid: a language the model lacks becomes English, and automatic detection stays only on models that detect. */
export function resolveLanguage(model: LanguageFacts, language: unknown): ResolvedPair {
  if (isSttLanguage(language) && model.languages.includes(language) && (language !== "auto" || model.detects)) return { language, changed: false };
  const english = model.languages.includes("en");
  return { language: english ? "en" : (model.languages.find((l) => l !== "auto") ?? "en"), changed: true };
}
