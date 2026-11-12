/** One capture in the list. */
export interface CaptureRecord {
  id: string;
  kind: "recording" | "screenshot";
  title: string;
  at: number;
  /** Folder of the capture, relative to the captures folder. */
  dir: string;
  durationMs?: number;
  /** Words with their times, for search and the opened view. */
  words?: { text: string; startMs: number; endMs: number }[];
  bytes: number;
  media: string;
  frames: string[];
  sheet?: string;
  /** What happened to it so far. */
  chips: ("copied" | "saved" | "sent")[];
  /** Still being finished after a crash or a stop; the list shows "Finishing". */
  finishing?: boolean;
}

export interface StoreFs {
  read(file: string): Promise<string | undefined>;
  /** Replaces the file atomically. */
  write(file: string, text: string): Promise<void>;
}

export interface CaptureStore {
  list(search?: string): Promise<CaptureRecord[]>;
  get(id: string): Promise<CaptureRecord | undefined>;
  add(r: CaptureRecord): Promise<void>;
  update(id: string, patch: Partial<CaptureRecord>): Promise<CaptureRecord | undefined>;
  /** Removes these ids from the index. Always works on the index as it is now, never on a copy read earlier. Returns the records removed. */
  remove(ids: readonly string[]): Promise<CaptureRecord[]>;
}

const isRecord = (x: unknown): x is CaptureRecord =>
  !!x && typeof x === "object" && typeof (x as CaptureRecord).id === "string" && typeof (x as CaptureRecord).at === "number" && typeof (x as CaptureRecord).dir === "string";

async function loadAll(fs: StoreFs, file: string): Promise<CaptureRecord[]> {
  const text = await fs.read(file);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    // an unreadable index reads as empty: the captures stay on disk
    return [];
  }
}

const haystack = (r: CaptureRecord) => `${r.title} ${r.words?.map((w) => w.text).join(" ") ?? ""}`.toLowerCase();

/** The index of captures (index.json). Every change reads the file again inside a queue, so two changes at once, or a sweep that began earlier, cannot write an old list back. */
/** Keeps the queue going after a failed change; the failure itself reaches the caller. */
const settle = (): void => undefined;

export function createStore(fs: StoreFs, file: string): CaptureStore {
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(settle, settle);
    return run;
  };
  const load = () => loadAll(fs, file);
  const save = (items: CaptureRecord[]) => fs.write(file, JSON.stringify(items));

  return {
    async list(search) {
      const all = (await load()).sort((a, b) => b.at - a.at);
      const q = search?.trim().toLowerCase();
      return q ? all.filter((r) => haystack(r).includes(q)) : all;
    },
    async get(id) {
      return (await load()).find((r) => r.id === id);
    },
    add: (r) =>
      exclusive(async () => {
        const items = (await load()).filter((x) => x.id !== r.id);
        await save([...items, r]);
      }),
    update: (id, patch) =>
      exclusive(async () => {
        const items = await load();
        const i = items.findIndex((x) => x.id === id);
        if (i < 0) return undefined;
        items[i] = { ...items[i]!, ...patch, id };
        await save(items);
        return items[i];
      }),
    remove: (ids) =>
      exclusive(async () => {
        const set = new Set(ids);
        const items = await load();
        const gone = items.filter((x) => set.has(x.id));
        if (gone.length) await save(items.filter((x) => !set.has(x.id)));
        return gone;
      }),
  };
}

export { dayLabel, groupByDay } from "../../../shared/capture/days";
