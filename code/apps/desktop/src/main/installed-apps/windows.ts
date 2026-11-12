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
  /** Lets the app handle other work: shortcut reads block the main thread, so the scan pauses between batches. */
  pause(): Promise<void>;
}

const MAX_DEPTH = 4;
/** More shortcuts than this are not read; a Start Menu that large is not one person's programs. */
const MAX_SHORTCUTS = 1500;
const BATCH = 25;

/** Programs from the Start Menu shortcuts. Store apps have no program file in their shortcut and are not listed. */
export async function windowsScan(h: WindowsHost): Promise<InstalledApp[]> {
  const shortcuts: { path: string; name: string }[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await h.list(dir).catch(() => []); // a folder that cannot be read is skipped
    await Promise.all(
      entries.map((e) => {
        const full = h.join(dir, e.name);
        if (e.directory) return depth < MAX_DEPTH ? walk(full, depth + 1) : undefined;
        if (/\.lnk$/i.test(e.name) && shortcuts.length < MAX_SHORTCUTS) shortcuts.push({ path: full, name: e.name.replace(/\.lnk$/i, "") });
        return undefined;
      }),
    );
  };
  await Promise.all(h.roots().map((r) => walk(r, 0)));
  const found: InstalledApp[] = [];
  for (let i = 0; i < shortcuts.length; i += BATCH) {
    for (const s of shortcuts.slice(i, i + BATCH)) {
      const exe = h.target(s.path).replaceAll("/", "\\").split("\\").pop() ?? "";
      if (/\.exe$/i.test(exe)) found.push({ key: exe, name: s.name });
    }
    await h.pause();
  }
  return found;
}
