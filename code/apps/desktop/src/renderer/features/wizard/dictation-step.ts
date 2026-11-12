import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { accuracyText, languageName, sizeText } from "../../speech-text";

/** The languages the first screen lists; every other language is behind "Other language". */
export const FIRST_LANGUAGES = ["en", "de", "ar", "auto"] as const;

export type DictationPhase = "language" | "model" | "practice";

/** The language preselected on the first screen: the system language when dictation handles it, English otherwise. */
export function defaultLanguage(systemLocale: string, offered: readonly string[]): string {
  const code = systemLocale.toLowerCase().split(/[-_]/)[0] ?? "";
  return offered.includes(code) && code !== "auto" ? code : "en";
}

export interface LanguageChoice {
  language: string;
  title: string;
  model: ModelCard;
  /** "Uses Parakeet v3, 356 MB. Very fast, about 1 wrong word in 18." */
  detail: string;
  /** The model is already on this computer (installed, or found on disk): nothing to download. */
  noDownload: boolean;
}

const EXTRA: Record<string, string> = { auto: "Slower, handles mixed languages. It can mistranscribe close languages." };

/** What the person is told about choosing a language: which model that picks, how big it is, and how good it is, with its test language. */
export function languageChoice(view: SpeechModelsView, language: string, foundIds: readonly string[] = []): LanguageChoice | undefined {
  const row = view.table.find((r) => r.language === language);
  const model = row && view.models.find((m) => m.id === row.recommended);
  if (!row || !model) return undefined;
  const speed = model.speedSeconds !== undefined && model.speedSeconds <= 1 ? "Very fast. " : "";
  const quality = model.accuracy ? `${accuracyText(model).replace(/^About /, "")}.` : "";
  const detail = `Uses ${model.name}, ${sizeText(model.bytes)}. ${EXTRA[language] ?? `${speed}${quality}`}`.trim();
  return { language, title: languageName(language), model, detail, noDownload: model.installed || foundIds.includes(model.id) };
}

export interface ChecklistRow {
  id: "microphone" | "hotkey" | "model";
  title: string;
  detail: string;
  ok: boolean;
  /** The button that fixes it, when there is one. */
  fix?: "fix-hotkey" | "download";
}

export interface ChecklistInput {
  mic: "granted" | "denied" | "prompt" | "unknown";
  hotkeyLabel: string;
  hotkeyReady: boolean;
  hotkeyFailed: boolean;
  modelName: string;
  modelBytes: number;
  modelInstalled: boolean;
}

function hotkeyDetail(i: ChecklistInput): string {
  if (i.hotkeyFailed) return `${i.hotkeyLabel} could not start. Another app may be using it.`;
  return i.hotkeyReady ? `${i.hotkeyLabel} is ready.` : "Not started yet.";
}

/** The live checklist of the welcome-back screen: what is ready and the one-click fix for what is not. */
export function checklist(i: ChecklistInput): ChecklistRow[] {
  return [
    {
      id: "microphone",
      title: "Microphone",
      ok: i.mic !== "denied",
      detail: i.mic === "denied" ? "Blocked. Allow microphone access for Speak Kit in your system settings." : "Allowed. Speak Kit can hear your default microphone.",
    },
    {
      id: "hotkey",
      title: "Hotkey",
      ok: i.hotkeyReady && !i.hotkeyFailed,
      detail: hotkeyDetail(i),
      ...(!(i.hotkeyReady && !i.hotkeyFailed) && { fix: "fix-hotkey" as const }),
    },
    {
      id: "model",
      title: "Speech model",
      ok: i.modelInstalled,
      detail: i.modelInstalled ? `${i.modelName} is installed, ${sizeText(i.modelBytes)}.` : `${i.modelName} is not installed yet.`,
      ...(!i.modelInstalled && { fix: "download" as const }),
    },
  ];
}

/** Practice worked when something other than blanks landed in the field. */
export const practiceDone = (text: string): boolean => text.trim().length > 0;

/** What Continue does on the language screen: the model is used from disk, or downloaded now (never before this press). */
export function afterLanguage(choice: LanguageChoice, found: boolean): "use" | "adopt" | "download" {
  if (choice.model.installed) return "use";
  return found ? "adopt" : "download";
}
