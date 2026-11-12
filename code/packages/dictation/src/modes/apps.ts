import { exeKey } from "../paste-plan";

/** A program the person has installed: `key` is what modes and the insert table store (file name without .exe, or the bundle id on macOS), `name` is what the picker shows. */
export interface InstalledApp {
  key: string;
  name: string;
}

export const MAX_INSTALLED_APPS = 2000;

/** Names that are installed next to a program but are not the program. */
const NOT_A_PROGRAM = /\b(uninstall|uninstaller|setup|installer|readme|release notes|documentation|help|website|license)\b/i;

/** One entry per key (the first name wins), no empty keys, no uninstallers, sorted by name. */
export function mergeApps(found: readonly InstalledApp[]): InstalledApp[] {
  const byKey = new Map<string, InstalledApp>();
  for (const a of found) {
    const key = exeKey(a.key.trim());
    const name = a.name.trim();
    if (!key || !name || NOT_A_PROGRAM.test(name) || byKey.has(key)) continue;
    byKey.set(key, { key, name });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })).slice(0, MAX_INSTALLED_APPS);
}

/** Apps whose name or key contains the text, names that start with it first. An empty query lists everything up to the limit. */
export function searchApps(apps: readonly InstalledApp[], query: string, limit = 50): InstalledApp[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps.slice(0, limit);
  const starts: InstalledApp[] = [];
  const inside: InstalledApp[] = [];
  for (const a of apps) {
    const name = a.name.toLowerCase();
    if (name.startsWith(q)) starts.push(a);
    else if (name.includes(q) || a.key.includes(q)) inside.push(a);
  }
  return [...starts, ...inside].slice(0, limit);
}
