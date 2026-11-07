import type { Voice } from "@speakkit/protocol";

export type VoiceFilter = "all" | "en-US" | "en-GB" | "female" | "male";

export const VOICE_FILTERS: { id: VoiceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "en-US", label: "US English" },
  { id: "en-GB", label: "UK English" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

const FILTER_NAME: Record<VoiceFilter, string> = { all: "all", "en-US": "US English", "en-GB": "UK English", female: "female", male: "male" };

/** The text on the toolbar dropdown: "Voices: all". */
export const voiceFilterLabel = (f: VoiceFilter): string => `Voices: ${FILTER_NAME[f]}`;

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

/** What a voice says when previewed. */
export const previewText = (name: string): string => `Hello, I am ${name}. This is how I sound when reading to you.`;

export const langLabel = (v: Voice): string => (v.lang === "en-US" ? "US English" : "UK English");
export const genderLabel = (v: Voice): string => (v.gender === "female" ? "Female" : "Male");
