import type { RewriteOutcome } from "./modes/rewrite";
import type { Retention } from "./settings";
import type { Clock, HistoryStorage } from "./types";
import { matchTerms, type Term } from "./vocabulary/terms";

/** One transcription of a recording. The first is what dictation made; more come from "Transcribe again". */
export interface Version {
  id: string;
  model: string;
  at: number;
  text: string;
  /** How long the model took. */
  ms: number;
}

export interface HistoryEntry {
  id: string;
  /** When it was dictated, in the clock's milliseconds. */
  at: number;
  /** What was inserted (or, after "Use this text", what the chosen version says). */
  text: string;
  /** What the speech engine heard. */
  raw: string;
  /** Executable name of the program it went to. */
  app?: string;
  durationMs: number;
  language?: string;
  model?: string;
  /** What the rewrite pass did, when the mode asked for one. */
  rewrite?: RewriteOutcome;
  /** The kept recording, by the name the audio store knows it under. */
  audio?: string;
  /** The recording was removed on its own (the size limit) while the text stays. */
  audioRemoved?: boolean;
  versions?: Version[];
  /** The version whose text is in use. */
  version?: string;
}

export type NewEntry = Omit<HistoryEntry, "id">;

export interface HistoryQuery {
  /** Every word must appear in the text or the program name, in any case; a sounds-like spelling of a vocabulary word finds that word too. */
  search?: string;
  limit?: number;
}

export type HistoryHit = HistoryEntry & { via?: { word: string; heard: string } };

/** Where recordings live. Moving a file to the Recycle Bin can fail; the history keeps the file then and says so. */
export interface AudioTrash {
  trash(file: string): Promise<boolean>;
}

export interface RemoveReport {
  /** Recordings that could not be moved to the Recycle Bin and are still on disk. */
  kept: string[];
}

export type HistoryStatus = "ok" | "newer";

export interface History {
  /** Resolves to the new entry's id, or undefined when nothing is kept (retention "off"). */
  add(entry: NewEntry): Promise<string | undefined>;
  /** Newest first, with expired entries already gone. */
  list(query?: HistoryQuery): Promise<HistoryHit[]>;
  get(id: string): Promise<HistoryEntry | undefined>;
  remove(id: string): Promise<RemoveReport>;
  clear(): Promise<RemoveReport>;
  /** Drops what the retention no longer allows. */
  prune(): Promise<RemoveReport>;
  patch(id: string, patch: Partial<Pick<HistoryEntry, "audio" | "audioRemoved" | "versions" | "version" | "text">>): Promise<void>;
  /** Adds a version made by "Transcribe again"; the text in use does not change. */
  addVersion(id: string, v: Omit<Version, "id">): Promise<string | undefined>;
  /** Makes one version's text the entry's text. */
  useVersion(id: string, versionId: string): Promise<boolean>;
  /** Forgets recordings that were deleted from disk. The entries keep their text. */
  dropAudio(files: readonly string[]): Promise<void>;
  /** "newer": the file was written by a newer version of the app; it is left alone and the history stays empty in this session. */
  status(): HistoryStatus;
}

const DAY_MS = 86_400_000;
export const WINDOW_MS: Record<Retention, number> = { off: 0, "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS, forever: Infinity };
/** Hard cap, whatever the retention says. */
export const MAX_ENTRIES = 500;
export const HISTORY_VERSION = 1;

/** Milliseconds left before the entry is removed; Infinity when it is kept for ever. */
export const timeLeft = (e: Pick<HistoryEntry, "at">, now: number, retention: Retention): number => (retention === "forever" ? Infinity : Math.max(0, e.at + WINDOW_MS[retention] - now));

const isEntry = (v: unknown): v is HistoryEntry => {
  const e = v as Partial<Record<keyof HistoryEntry, unknown>> | null;
  return typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.at === "number" && typeof e.text === "string" && typeof e.raw === "string" && typeof e.durationMs === "number";
};

type Parsed = { entries: HistoryEntry[]; newer: boolean };

// Stored data is untrusted: keep what has the right shape, newest first. A bare array is the first format; an object carries a version.
function parse(stored: unknown): Parsed {
  let list: unknown = stored;
  if (!Array.isArray(stored) && typeof stored === "object" && stored !== null) {
    const o = stored as { version?: unknown; entries?: unknown };
    if (typeof o.version === "number" && o.version > HISTORY_VERSION) return { entries: [], newer: true };
    list = o.entries;
  }
  return { entries: Array.isArray(list) ? list.filter(isEntry).sort((a, b) => b.at - a.at) : [], newer: false };
}

function keep(all: HistoryEntry[], now: number, retention: Retention): HistoryEntry[] {
  if (retention === "off") return [];
  return all.filter((e) => now - e.at <= WINDOW_MS[retention]).slice(0, MAX_ENTRIES);
}

function freshId(entries: HistoryEntry[], at: number): string {
  let n = 0;
  while (entries.some((e) => e.id === `${at}-${n}`)) n++;
  return `${at}-${n}`;
}

const words = (s: string): string[] => s.toLowerCase().match(/\S+/g) ?? [];

function matches(e: HistoryEntry, search: string): boolean {
  const hay = `${e.text}\n${e.app ?? ""}`.toLowerCase();
  return words(search).every((word) => hay.includes(word));
}

interface Deps {
  storage: HistoryStorage;
  clock: Clock;
  retention: () => Retention;
  audio?: AudioTrash;
  /** The vocabulary, for finding a word by its sounds-like spelling. */
  terms?: () => readonly Term[];
}

class Store implements History {
  private entries: HistoryEntry[] = [];
  private loading: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private newer = false;
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  private ready(): Promise<void> {
    return (this.loading ??= (async () => {
      try {
        const p = parse(await this.deps.storage.load());
        this.entries = p.entries;
        this.newer = p.newer;
        if (p.newer) await this.deps.storage.preserve?.("newer");
      } catch {
        // Unreadable storage leaves the history empty; the next save replaces it.
      }
    })());
  }

  status = (): HistoryStatus => (this.newer ? "newer" : "ok");

  private save(): Promise<void> {
    if (this.newer) return this.writes; // a newer app's file is never overwritten
    const snapshot = { version: HISTORY_VERSION, entries: this.entries };
    this.writes = this.writes.then(async () => {
      try {
        await this.deps.storage.save(snapshot);
      } catch {
        // A failed save keeps the history in memory; the next change saves it again.
      }
    });
    return this.writes;
  }

  /** Moves the recordings of removed entries to the Recycle Bin; one that cannot be moved stays on disk and is reported. */
  private async dispose(gone: HistoryEntry[]): Promise<RemoveReport> {
    const kept: string[] = [];
    for (const e of gone) {
      if (!e.audio || !this.deps.audio) continue;
      let ok = false;
      try {
        ok = await this.deps.audio.trash(e.audio);
      } catch {
        ok = false;
      }
      if (!ok) kept.push(e.audio);
    }
    return { kept };
  }

  prune = async (): Promise<RemoveReport> => {
    await this.ready();
    const kept = keep(this.entries, this.deps.clock.now(), this.deps.retention());
    if (kept.length === this.entries.length) return { kept: [] };
    const gone = this.entries.filter((e) => !kept.includes(e));
    this.entries = kept;
    await this.save();
    return this.dispose(gone);
  };

  async add(entry: NewEntry): Promise<string | undefined> {
    await this.prune();
    if (this.deps.retention() === "off") return undefined;
    const id = freshId(this.entries, entry.at);
    const evicted = [{ ...entry, id }, ...this.entries].sort((a, b) => b.at - a.at);
    this.entries = evicted.slice(0, MAX_ENTRIES);
    await this.save();
    await this.dispose(evicted.slice(MAX_ENTRIES));
    return id;
  }

  async list(query: HistoryQuery = {}): Promise<HistoryHit[]> {
    await this.prune();
    const { search } = query;
    let found: HistoryHit[] = this.entries;
    if (search?.trim()) {
      const aliases = matchTerms(this.deps.terms?.() ?? [], search);
      found = [];
      for (const e of this.entries) {
        if (matches(e, search)) found.push(e);
        else {
          const hit = aliases.find((a) => e.text.toLowerCase().includes(a.term.word.toLowerCase()));
          if (hit) found.push({ ...e, via: { word: hit.term.word, heard: hit.via } });
        }
      }
    }
    return found.slice(0, query.limit ?? found.length);
  }

  async get(id: string): Promise<HistoryEntry | undefined> {
    await this.prune();
    return this.entries.find((e) => e.id === id);
  }

  async remove(id: string): Promise<RemoveReport> {
    await this.ready();
    const gone = this.entries.filter((e) => e.id === id);
    this.entries = this.entries.filter((e) => e.id !== id);
    await this.save();
    return this.dispose(gone);
  }

  async clear(): Promise<RemoveReport> {
    await this.ready();
    const gone = this.entries;
    this.entries = [];
    await this.save();
    return this.dispose(gone);
  }

  async patch(id: string, patch: Parameters<History["patch"]>[1]): Promise<void> {
    await this.ready();
    if (!this.entries.some((e) => e.id === id)) return;
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    await this.save();
  }

  async addVersion(id: string, v: Omit<Version, "id">): Promise<string | undefined> {
    await this.ready();
    const e = this.entries.find((x) => x.id === id);
    if (!e) return undefined;
    // The first version is what dictation made, so it exists before any other does.
    const first: Version = { id: "v1", model: e.model ?? "", at: e.at, text: e.versions?.[0]?.text ?? e.text, ms: 0 };
    const all = e.versions ?? [first];
    const vid = `v${all.length + 1}`;
    await this.patch(id, { versions: [...all, { ...v, id: vid }], version: e.version ?? first.id });
    return vid;
  }

  async useVersion(id: string, versionId: string): Promise<boolean> {
    await this.ready();
    const v = this.entries.find((e) => e.id === id)?.versions?.find((x) => x.id === versionId);
    if (!v) return false;
    await this.patch(id, { text: v.text, version: v.id });
    return true;
  }

  async dropAudio(files: readonly string[]): Promise<void> {
    await this.ready();
    if (!this.entries.some((e) => e.audio && files.includes(e.audio))) return;
    this.entries = this.entries.map((e) => {
      if (!e.audio || !files.includes(e.audio)) return e;
      const { audio: _gone, ...rest } = e;
      return { ...rest, audioRemoved: true };
    });
    await this.save();
  }
}

export const createHistory = (deps: Deps): History => new Store(deps);

export interface HistoryStats {
  dictations: number;
  words: number;
  wordsPerMinute: number;
  listeningMs: number;
}

/** The numbers above the list. Words per minute counts the time spent speaking, not the time between dictations. */
export function historyStats(entries: readonly Pick<HistoryEntry, "text" | "durationMs">[]): HistoryStats {
  const words = entries.reduce((n, e) => n + (e.text.match(/\S+/g)?.length ?? 0), 0);
  const listeningMs = entries.reduce((n, e) => n + e.durationMs, 0);
  return { dictations: entries.length, words, listeningMs, wordsPerMinute: listeningMs > 0 ? Math.round(words / (listeningMs / 60_000)) : 0 };
}

export const MAX_AUDIO_BYTES = 512 * 1024 * 1024;

/** Which recordings to delete so the folder fits the limit after `incoming` bytes are added: the oldest first. */
export function planEviction(files: readonly { file: string; bytes: number; at: number }[], limit: number, incoming: number): string[] {
  let total = files.reduce((n, f) => n + f.bytes, 0) + incoming;
  const out: string[] = [];
  for (const f of [...files].sort((a, b) => a.at - b.at)) {
    if (total <= limit) break;
    out.push(f.file);
    total -= f.bytes;
  }
  return out;
}
