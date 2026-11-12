/** Phrases speech models invent when they are given silence at the end of a recording (credits learned from subtitles). */
const CREDITS = [
  "thanks for watching",
  "thank you for watching",
  "subtitles by the amara.org community",
  "subtitles by amara.org",
  "sous-titrage st' 501",
  "sous-titres réalisés par la communauté d'amara.org",
  "untertitel im auftrag des zdf",
  "untertitelung des zdf, 2020",
  "ترجمة نانسي قنقر",
  "اشتركوا في القناة",
];

const TAIL_MS = 1000;
const QUIET_RMS = 0.01;

const squash = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\s.!?,"“”]+$/u, "")
    .trimEnd();

/** True when the last second has no sound above room noise (the average removed, as everywhere else in capture). */
function tailIsQuiet(pcm: Float32Array, sampleRate: number): boolean {
  const tail = pcm.subarray(Math.max(0, pcm.length - Math.round((sampleRate * TAIL_MS) / 1000)));
  if (!tail.length) return true;
  let mean = 0;
  for (const x of tail) mean += x;
  mean /= tail.length;
  let sum = 0;
  for (const x of tail) sum += (x - mean) ** 2;
  return Math.sqrt(sum / tail.length) < QUIET_RMS;
}

/**
 * Removes a known credit from the very end of a transcript, but only when the recording itself ended in silence: a person who really says one of
 * these phrases is speaking at the end, so the text is left alone. Text before the credit is kept; a transcript that was only the credit becomes empty.
 */
export function stripTailCredit(text: string, pcm: Float32Array, sampleRate: number): string {
  if (!tailIsQuiet(pcm, sampleRate)) return text;
  const lower = text.toLowerCase();
  for (const credit of CREDITS) {
    const body = squash(lower);
    if (!body.endsWith(credit)) continue;
    const at = body.length - credit.length;
    // Only a whole phrase: "…forwatching" is not a credit.
    if (at > 0 && /[\p{L}\p{N}]/u.test(body[at - 1]!)) continue;
    return text.slice(0, at).trimEnd();
  }
  return text;
}
