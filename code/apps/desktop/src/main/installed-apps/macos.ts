import type { InstalledApp } from "@speakkit/dictation";

export interface MacHost {
  /** Folders that hold applications, in order of preference. */
  roots(): string[];
  list(dir: string): Promise<string[]>;
  /** The bundle id of an .app folder, or null when its Info.plist cannot be read. */
  bundleId(app: string): Promise<string | null>;
  join(dir: string, name: string): string;
}

/** An app whose Info.plist cannot be read is left out of the list. */
const unreadable = (): null => null;
const MAX_APPS = 1500;
const WORKERS = 8;

/** Applications from the standard folders, one level of sub-folders deep (suites keep their apps there). The key is the bundle id, which is how the front app is named. */
export async function macosScan(h: MacHost): Promise<InstalledApp[]> {
  const apps: { path: string; name: string }[] = [];
  const visit = async (dir: string, nested: boolean): Promise<void> => {
    const names = await h.list(dir).catch(() => []);
    for (const n of names) {
      if (n.endsWith(".app")) apps.push({ path: h.join(dir, n), name: n.slice(0, -4) });
      else if (!nested && !n.startsWith(".") && !n.includes(".")) await visit(h.join(dir, n), true);
    }
  };
  for (const r of h.roots()) await visit(r, false);
  const todo = apps.slice(0, MAX_APPS);
  const found: InstalledApp[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, todo.length) }, async () => {
      while (next < todo.length) {
        const a = todo[next++]!;
        const id = await h.bundleId(a.path).catch(unreadable);
        if (id) found.push({ key: id, name: a.name });
      }
    }),
  );
  return found;
}
