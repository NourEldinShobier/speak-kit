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
}

export type NewEntry = Omit<HistoryEntry, "id">;

export interface HistoryQuery {
  /** Every word must appear in the text or the program name, in any case. */
  search?: string;
  limit?: number;
}

export interface History {
  add(entry: NewEntry): Promise<void>;
  /** Newest first, with expired entries already gone. */
  list(query?: HistoryQuery): Promise<HistoryEntry[]>;
  get(id: string): Promise<HistoryEntry | undefined>;
  remove(id: string): Promise<void>;
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

function matches(e: HistoryEntry, search: string): boolean {
  const hay = `${e.text}\n${e.app ?? ""}`.toLowerCase();
  return (search.toLowerCase().match(/\S+/g) ?? []).every((word) => hay.includes(word));
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

  async add(entry: NewEntry): Promise<void> {
    await this.prune();
    if (this.deps.retention() === "off") return;
    this.entries = [{ ...entry, id: freshId(this.entries, entry.at) }, ...this.entries].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
    await this.save();
  }

  async list(query: HistoryQuery = {}): Promise<HistoryEntry[]> {
    await this.prune();
    const { search } = query;
    const found = search ? this.entries.filter((e) => matches(e, search)) : this.entries;
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

  async clear(): Promise<void> {
    await this.ready();
    this.entries = [];
    await this.save();
  }
}

export const createHistory = (deps: Deps): History => new Store(deps);
