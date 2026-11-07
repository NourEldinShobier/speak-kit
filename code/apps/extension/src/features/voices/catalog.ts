import type { Voice } from "@speakkit/protocol";
import type { VoiceInfo } from "../../shared/internal";

/** The voice list comes from the app (GET /v1/voices); nothing is bundled. These helpers only format and filter it. */
export type AccentFilter = "any" | "en-US" | "en-GB";
export type GenderFilter = "any" | "female" | "male";

// Sub-grades shown for the top voices.
const SUB: Record<string, string> = { af_bella: "A-", af_nicole: "B-", bf_emma: "B-" };

export const langLabel = (l: Voice["lang"]) => (l === "en-US" ? "US English" : "UK English");
export const qualityLabel = (x: Pick<Voice, "id" | "quality">) => SUB[x.id] ?? x.quality;
export const toInfo = (v: Voice): VoiceInfo => ({ id: v.id, name: v.name, desc: langLabel(v.lang), quality: qualityLabel(v), gender: v.gender, lang: v.lang });

interface VoiceQuery {
  q: string;
  accent?: AccentFilter;
  gender?: GenderFilter;
}

export function filterVoices(list: Voice[], { q, accent = "any", gender = "any" }: VoiceQuery): Voice[] {
  const s = q.trim().toLowerCase();
  return list.filter(
    (x) =>
      (accent === "any" || x.lang === accent) &&
      (gender === "any" || x.gender === gender) &&
      (!s || x.name.toLowerCase().includes(s) || langLabel(x.lang).toLowerCase().includes(s) || x.gender.includes(s) || (x.traits ?? "").toLowerCase().includes(s)),
  );
}

/** "Heart · US English"; the id is prettified when the list has not arrived yet. */
export function voiceLine(list: Voice[], id: string): string {
  const v = list.find((x) => x.id === id);
  return v ? `${v.name} · ${langLabel(v.lang)}` : prettyId(id);
}
export const voiceName = (list: Voice[], id: string) => list.find((x) => x.id === id)?.name ?? prettyId(id).split(" · ")[0]!;
const prettyId = (id: string) => id.replace(/^[a-z]{2}_/, "").replace(/^./, (c) => c.toUpperCase());
