import type { Voice } from "@speakkit/protocol";
import { at } from "../../../shared/i18n";
import "../../../shared/i18n/packs/voices";

interface VoicesState {
  voices: Voice[];
  error: string;
  query: string;
}

type VoicesAction = { type: "loaded"; voices: Voice[] } | { type: "failed"; message: string } | { type: "query"; query: string };

export const initVoices = (): VoicesState => ({ voices: [], error: "", query: "" });

export function voicesReducer(s: VoicesState, a: VoicesAction): VoicesState {
  switch (a.type) {
    case "loaded":
      return { ...s, voices: a.voices, error: "" };
    case "failed":
      return { ...s, error: a.message };
    case "query":
      return { ...s, query: a.query };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** Voices whose name or traits contain the query (any case). */
export function filterVoices(voices: Voice[], query: string): Voice[] {
  const q = query.toLowerCase();
  return voices.filter((v) => !q || `${v.name} ${v.traits ?? ""}`.toLowerCase().includes(q));
}

export const previewText = (name: string): string => `Hello, I am ${name}. This is how I sound when reading to you.`;

export const langLabel = (v: Voice): string => at(v.lang === "en-US" ? "v.f.en-US" : "v.f.en-GB");
export const genderLabel = (v: Voice): string => at(v.gender === "female" ? "v.f.female" : "v.f.male");
