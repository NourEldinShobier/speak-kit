import type { Voice } from "@speakkit/protocol";

export type VoiceFilter = "all" | "en-US" | "en-GB" | "female" | "male";

export const VOICE_FILTERS: { id: VoiceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "en-US", label: "US English" },
  { id: "en-GB", label: "UK English" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

interface VoicesState {
  voices: Voice[];
  /** Id of the default voice. */
  def: string;
  error: string;
  query: string;
  filter: VoiceFilter;
}

type VoicesAction = { type: "loaded"; voices: Voice[]; def: string } | { type: "failed"; message: string } | { type: "query"; query: string } | { type: "filter"; filter: VoiceFilter };

export const initVoices = (): VoicesState => ({ voices: [], def: "", error: "", query: "", filter: "all" });

export function voicesReducer(s: VoicesState, a: VoicesAction): VoicesState {
  switch (a.type) {
    case "loaded":
      return { ...s, voices: a.voices, def: a.def, error: "" };
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
