import { normalize, rank, type HistoryStats, historyStats } from "./history-search";
import type { Retention } from "./settings";
import type { Clock, HistoryStorage } from "./types";

export interface HistoryEntry {
  id: string;
  /** When it was dictated, in the clock's milliseconds. */
  at: number;
  /** What was inserted. */
  text: string;
  /** What the speech engine heard. */
  raw: string;
  /** Executable name of the program it went to. */
  app?: string;
  durationMs: number;
  language?: string;
  model?: string;
  /** Absent for a normal dictation. "raw": dictated with clean-up off. "printed": handed to a command and never pasted. "interrupted": the recording was cut short. */
  kind?: "raw" | "printed" | "interrupted";
  /** Name shown for the program, from its file description; the executable name stands in when there is none. */
  displayName?: string;
  /** Only when a rewrite ran: its name and, if it failed, why (the plain text was inserted instead). */
  mode?: { name: string; failure?: string };
  timings?: { transcribeMs?: number; insertMs?: number; pausesDroppedMs?: number };
  /** What really happened to the text. */
  outcome?: "sent" | "copied" | "failed";
}

export type NewEntry = Omit<HistoryEntry, "id">;

export interface HistoryQuery {
  /** Every word must be found in the text or the program name, in any case and without accents; the best matches come first. */
  search?: string;
  /** Other spellings for a word of the search (from the person's vocabulary). */
  aliases?: Readonly<Record<string, readonly string[]>>;
  limit?: number;
}

export interface History {
  /** Resolves the new entry's id; undefined when retention is off. */
  add(entry: NewEntry): Promise<string | undefined>;
  /** Corrects what is known only after the text was sent (what really happened to it). */
  update(id: string, patch: Partial<Pick<HistoryEntry, "outcome" | "timings">>): Promise<void>;
  /** Newest first, with expired entries already gone. */
  list(query?: HistoryQuery): Promise<HistoryEntry[]>;
  get(id: string): Promise<HistoryEntry | undefined>;
  remove(id: string): Promise<void>;
  removeMany(ids: readonly string[]): Promise<void>;
  stats(): Promise<HistoryStats>;
  clear(): Promise<void>;
  /** Drops what the retention no longer allows. */
  prune(): Promise<void>;
}

const DAY_MS = 86_400_000;
const WINDOW_MS: Record<Retention, number> = { off: 0, "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS, forever: Infinity };
/** Hard cap, whatever the retention says. */
export const MAX_ENTRIES = 500;

const isEntry = (v: unknown): v is HistoryEntry => {
  const e = v as Partial<Record<keyof HistoryEntry, unknown>> | null;
  return typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.at === "number" && typeof e.text === "string" && typeof e.raw === "string" && typeof e.durationMs === "number";
};

// Stored data is untrusted: keep what has the right shape, newest first.
const parse = (stored: unknown): HistoryEntry[] => (Array.isArray(stored) ? stored.filter(isEntry).sort((a, b) => b.at - a.at) : []);

function keep(all: HistoryEntry[], now: number, retention: Retention): HistoryEntry[] {
  if (retention === "off") return [];
  return all.filter((e) => now - e.at <= WINDOW_MS[retention]).slice(0, MAX_ENTRIES);
}

function freshId(entries: HistoryEntry[], at: number): string {
  let n = 0;
  while (entries.some((e) => e.id === `${at}-${n}`)) n++;
  return `${at}-${n}`;
}

// Search runs over a normalized copy of the text and program names, made once per entry and kept off the stored data.
const keys = new WeakMap<HistoryEntry, string>();
const keyOf = (e: HistoryEntry): string => {
  let key = keys.get(e);
  if (key === undefined) keys.set(e, (key = normalize([e.text, e.displayName ?? "", e.app ?? ""].join("\n"))));
  return key;
};

/** What `list` would return for stored data read straight from the file, without the app: the same shape check, retention and search. An unknown retention counts as the default. */
export function readStoredHistory(stored: unknown, o: { now: number; retention: unknown; search?: string; limit?: number }): HistoryEntry[] {
  const retention = typeof o.retention === "string" && o.retention in WINDOW_MS ? (o.retention as Retention) : "7d";
  const kept = keep(parse(stored), o.now, retention);
  const found = o.search ? kept.filter((e) => rank(keyOf(e), o.search!) > 0) : kept;
  return found.slice(0, o.limit ?? found.length);
}

interface Deps {
  storage: HistoryStorage;
  clock: Clock;
  retention: () => Retention;
}

class Store implements History {
  private entries: HistoryEntry[] = [];
  private loading: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();

  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  private ready(): Promise<void> {
    return (this.loading ??= (async () => {
      try {
        this.entries = parse(await this.deps.storage.load());
      } catch {
        // Unreadable storage leaves the history empty; the next save replaces it.
      }
    })());
  }

  private save(): Promise<void> {
    const snapshot = this.entries;
    this.writes = this.writes.then(async () => {
      try {
        await this.deps.storage.save(snapshot);
      } catch {
        // A failed save keeps the history in memory; the next change saves it again.
      }
    });
    return this.writes;
  }

  prune = async (): Promise<void> => {
    await this.ready();
    const kept = keep(this.entries, this.deps.clock.now(), this.deps.retention());
    if (kept.length === this.entries.length) return;
    this.entries = kept;
    await this.save();
  };

  async add(entry: NewEntry): Promise<string | undefined> {
    await this.prune();
    if (this.deps.retention() === "off") return undefined;
    const id = freshId(this.entries, entry.at);
    this.entries = [{ ...entry, id }, ...this.entries].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
    await this.save();
    return id;
  }

  async update(id: string, patch: Partial<Pick<HistoryEntry, "outcome" | "timings">>): Promise<void> {
    await this.ready();
    if (!this.entries.some((e) => e.id === id)) return;
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    await this.save();
  }

  async list(query: HistoryQuery = {}): Promise<HistoryEntry[]> {
    await this.prune();
    const { search } = query;
    const found = search?.trim()
      ? this.entries
          .map((e) => ({ e, score: rank(keyOf(e), search, query.aliases) }))
          .filter((x) => x.score > 0)
          // Entries are newest first already and the sort is stable, so equal scores stay newest first.
          .sort((a, b) => b.score - a.score)
          .map((x) => x.e)
      : this.entries;
    return found.slice(0, query.limit ?? found.length);
  }

  async get(id: string): Promise<HistoryEntry | undefined> {
    await this.prune();
    return this.entries.find((e) => e.id === id);
  }

  async remove(id: string): Promise<void> {
    await this.ready();
    this.entries = this.entries.filter((e) => e.id !== id);
    await this.save();
  }

  async removeMany(ids: readonly string[]): Promise<void> {
    await this.ready();
    const drop = new Set(ids);
    this.entries = this.entries.filter((e) => !drop.has(e.id));
    await this.save();
  }

  async stats(): Promise<HistoryStats> {
    await this.prune();
    return historyStats(this.entries);
  }

  async clear(): Promise<void> {
    await this.ready();
    this.entries = [];
    await this.save();
  }
}

export const createHistory = (deps: Deps): History => new Store(deps);
