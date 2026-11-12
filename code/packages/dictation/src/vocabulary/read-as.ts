/** How the reader says a written form: "k8s" is read "kubernetes". Separate from the words dictation hears. */
export interface Pronunciation {
  id: string;
  written: string;
  spoken: string;
}

export const MAX_PRONUNCIATIONS = 200;
export const MAX_WRITTEN = 60;
export const MAX_SPOKEN = 120;

export type PronunciationError = "empty" | "too-long" | "duplicate" | "full" | "same";

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function addPronunciation(list: readonly Pronunciation[], input: { written: string; spoken: string }): { ok: true; list: Pronunciation[] } | { ok: false; error: PronunciationError } {
  const written = input.written.trim();
  const spoken = input.spoken.trim();
  if (!written || !spoken) return { ok: false, error: "empty" };
  if ([...written].length > MAX_WRITTEN || [...spoken].length > MAX_SPOKEN) return { ok: false, error: "too-long" };
  if (written === spoken) return { ok: false, error: "same" };
  if (list.some((p) => same(p.written, written))) return { ok: false, error: "duplicate" };
  if (list.length >= MAX_PRONUNCIATIONS) return { ok: false, error: "full" };
  return { ok: true, list: [...list, { id: `p${Date.now().toString(36)}${list.length}${Math.random().toString(36).slice(2, 5)}`, written, spoken }] };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text with every written form replaced by how it is said; whole words only, longest form first, never replaced twice. */
export function applyReadAs(text: string, list: readonly Pronunciation[]): string {
  if (!list.length) return text;
  const forms = [...list].sort((a, b) => b.written.length - a.written.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${forms.map((p) => escape(p.written)).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  return text.replace(re, (m) => forms.find((p) => same(p.written, m))?.spoken ?? m);
}
