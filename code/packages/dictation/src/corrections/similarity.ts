/** Letters and digits only, lower case, no accents: "VS Code" and "vscode" give the same key. */
export const compact = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Jaro-Winkler similarity of two strings, 0 to 1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const used = Array.from({ length: b.length }, () => false);
  const matched: string[] = [];
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j <= Math.min(b.length - 1, i + window); j++) {
      if (used[j] || a[i] !== b[j]) continue;
      used[j] = true;
      matched.push(a[i] as string);
      break;
    }
  }
  if (!matched.length) return 0;
  const order = b.split("").filter((_, j) => used[j]);
  const swaps = matched.filter((c, i) => c !== order[i]).length / 2;
  const jaro = (matched.length / a.length + matched.length / b.length + (matched.length - swaps) / matched.length) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Sounds that English speech models confuse: voiced and unvoiced pairs share a letter.
const SOUND_SWAPS: [RegExp, string][] = [
  [/ph/g, "f"],
  [/ck|q/g, "k"],
  [/c(?=[eiy])/g, "s"],
  [/[cx]/g, "k"],
  [/wh/g, "w"],
  [/[gk]/g, "k"],
  [/[dt]/g, "t"],
  [/[bp]/g, "p"],
  [/[vf]/g, "f"],
  [/[zs]/g, "s"],
];

/** A rough English sound key: voiced and unvoiced consonants merge, vowels after the first letter go, repeats collapse. "cloud code" and "Claude Code" share one. */
export function soundKey(text: string): string {
  let s = compact(text);
  for (const [from, to] of SOUND_SWAPS) s = s.replace(from, to);
  return (s.charAt(0) + s.slice(1).replace(/[aeiouyhw]/g, "")).replace(/(.)\1+/g, "$1");
}

/** How alike two phrases are, 0 to 1: spelling with spaces ignored, plus a bonus when they sound the same. */
export function likeness(a: string, b: string): number {
  const x = compact(a);
  const y = compact(b);
  const spelled = jaroWinkler(x, y);
  return soundKey(x) === soundKey(y) ? Math.min(1, spelled + 0.1) : spelled;
}
