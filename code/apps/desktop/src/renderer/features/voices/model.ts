import type { Voice } from "@speakkit/protocol";
import { at } from "../../../shared/i18n";
import "../../../shared/i18n/packs/voices";

export type VoiceFilter = "all" | "en-US" | "en-GB" | "female" | "male";

const FILTER_KEYS = { all: "v.f.all", "en-US": "v.f.en-US", "en-GB": "v.f.en-GB", female: "v.f.female", male: "v.f.male" } as const;
const FILTER_VALUE_KEYS = { all: "v.fl.all", "en-US": "v.fl.en-US", "en-GB": "v.fl.en-GB", female: "v.fl.female", male: "v.fl.male" } as const;

/** The filters in the order the dropdown lists them, each with its label in the chosen language. */
export const voiceFilters = (): { id: VoiceFilter; label: string }[] => (Object.keys(FILTER_KEYS) as VoiceFilter[]).map((id) => ({ id, label: at(FILTER_KEYS[id]) }));

/** The text on the toolbar dropdown: "Voices: all". */
export const voiceFilterLabel = (f: VoiceFilter): string => at(FILTER_VALUE_KEYS[f]);

interface VoicesState {
  voices: Voice[];
  error: string;
  query: string;
  filter: VoiceFilter;
}

type VoicesAction = { type: "loaded"; voices: Voice[] } | { type: "failed"; message: string } | { type: "query"; query: string } | { type: "filter"; filter: VoiceFilter };

export const initVoices = (): VoicesState => ({ voices: [], error: "", query: "", filter: "all" });

export function voicesReducer(s: VoicesState, a: VoicesAction): VoicesState {
  switch (a.type) {
    case "loaded":
      return { ...s, voices: a.voices, error: "" };
    case "failed":
      return { ...s, error: a.message };
    case "query":
      return { ...s, query: a.query };
    case "filter":
      return { ...s, filter: a.filter };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** Voices whose name or traits contain the query (any case) and that match the language or gender filter. */
export function filterVoices(voices: Voice[], query: string, filter: VoiceFilter): Voice[] {
  const q = query.toLowerCase();
  return voices.filter((v) => {
    if (q && !`${v.name} ${v.traits ?? ""}`.toLowerCase().includes(q)) return false;
    return filter === "all" || filter === v.lang || filter === v.gender;
  });
}

export const previewText = (name: string): string => `Hello, I am ${name}. This is how I sound when reading to you.`;

export const langLabel = (v: Voice): string => at(v.lang === "en-US" ? "v.f.en-US" : "v.f.en-GB");
export const genderLabel = (v: Voice): string => at(v.gender === "female" ? "v.f.female" : "v.f.male");
