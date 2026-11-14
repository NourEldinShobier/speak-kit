/** The English of every feature pack imported so far. A feature imports its own pack, so its text loads with its code and stays out of the first bundle. */
export const PACK_EN: Record<string, string> = {};

/** Registers a feature's English strings; the other languages carry the same keys in their tables, so a missing one fails the type check. */
export function definePack<const T extends Record<string, string>>(en: T): T {
  Object.assign(PACK_EN, en);
  return en;
}
