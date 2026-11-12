import type { InstalledApp } from "@speakkit/dictation";

export interface DirEntry {
  name: string;
  directory: boolean;
}

/** What the Windows scan needs from the system, so tests can fake it. */
export interface WindowsHost {
  /** The Start Menu program folders that exist for this person and for everyone. */
  roots(): string[];
  list(dir: string): Promise<DirEntry[]>;
  /** The program a shortcut starts; "" for shortcuts that start a Store app or nothing. */
  target(shortcut: string): string;
  join(dir: string, name: string): string;
}

const MAX_DEPTH = 4;

/** Programs from the Start Menu shortcuts. Store apps have no program file in their shortcut and are not listed. */
export async function windowsScan(h: WindowsHost): Promise<InstalledApp[]> {
  const found: InstalledApp[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await h.list(dir).catch(() => []); // a folder that cannot be read is skipped
    await Promise.all(
      entries.map(async (e) => {
        const full = h.join(dir, e.name);
        if (e.directory) return depth < MAX_DEPTH ? walk(full, depth + 1) : undefined;
        if (!/\.lnk$/i.test(e.name)) return;
        const exe = h.target(full).replaceAll("/", "\\").split("\\").pop() ?? "";
        if (/\.exe$/i.test(exe)) found.push({ key: exe, name: e.name.replace(/\.lnk$/i, "") });
      }),
    );
  };
  await Promise.all(h.roots().map((r) => walk(r, 0)));
  return found;
}
