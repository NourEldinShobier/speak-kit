import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_FILE_BYTES, type Block, type DocMeta, type Format, type ImportResult, type LibraryApi, type Progress, type Source } from "../../shared/library/contract";
import { fetchPage } from "./fetch-url";
import { ImportError } from "./parse";
import { runParseJob, type ParseFn } from "./parse/job";
import { textToBlocks, titleFromBlocks, wordCount, type Parsed } from "../../shared/library/text";
import { toDesktopError } from "../../shared/errors";
import { LibraryStore } from "./store";

interface LibraryDeps {
  dir: string;
  /** Fetches web addresses; the default refuses non-public addresses. Replaced in tests. */
  fetch?: typeof fetch;
  readClipboard(): Promise<string> | string;
  /** system open dialog: absolute paths of the chosen files (empty when cancelled) */
  chooseFiles(): Promise<string[]>;
  reveal(filePath: string): void;
  now?: () => number;
  /** Parses files and pages; the app passes one that runs in a worker thread. */
  parse?: ParseFn;
  /** The library index could not be read and was set aside at this path; the library starts empty. */
  onRecovered?(file: string): void;
}

const failure = (e: unknown, name?: string): ImportResult => {
  const reason = e instanceof ImportError ? e.reason : "unreadable";
  return { ok: false, reason, error: toDesktopError(e), ...(name ? { name } : {}) };
};

type AddInfo = { source: Source; format: Format; origin: string; title?: string; path?: string; voice?: string };

/** Turns bytes, text and fetched pages into documents in the store. */
function importers(store: LibraryStore, now: () => number, parse: NonNullable<LibraryDeps["parse"]>) {
  async function add(parsed: Parsed, info: AddInfo, original?: Uint8Array): Promise<ImportResult> {
    const meta: DocMeta = {
      id: randomUUID(),
      title: info.title?.trim() || parsed.title.trim() || titleFromBlocks(parsed.blocks, info.origin),
      source: info.source,
      format: info.format,
      origin: info.origin,
      ...(info.path ? { path: info.path } : {}),
      addedAt: now(),
      wordCount: wordCount(parsed.blocks),
      ...(parsed.pages ? { pages: parsed.pages } : {}),
      ...(info.voice ? { voice: info.voice } : {}),
      progress: { sentence: 0, fraction: 0 },
      finished: false,
      ...(parsed.needsOcr ? { needsOcr: true } : {}),
    };
    await store.add(meta, parsed.blocks, parsed.needsOcr ? original : undefined);
    return { ok: true, doc: meta };
  }

  async function importBytes(name: string, bytes: Uint8Array, filePath?: string): Promise<ImportResult> {
    try {
      if (bytes.length > MAX_FILE_BYTES) throw new ImportError("too-large", { code: "file-too-large", args: { name, mb: MAX_FILE_BYTES / 1024 / 1024 } });
      const { format, parsed } = await parse({ type: "file", name, bytes });
      const title = parsed.title || path.basename(name, path.extname(name));
      return await add({ ...parsed, title }, { source: "file", format, origin: path.basename(name), ...(filePath ? { path: filePath } : {}) }, bytes);
    } catch (e) {
      return failure(e, name);
    }
  }

  async function importText(text: string, title?: string, voice?: string): Promise<ImportResult> {
    const blocks = textToBlocks(text);
    if (!blocks.length) return failure(new ImportError("empty", { code: "nothing-to-add" }));
    return add({ title: "", blocks }, { source: "paste", format: "text", origin: "Pasted text", ...(title ? { title } : {}), ...(voice ? { voice } : {}) });
  }
  return { add, importBytes, importText };
}

/** One picked file: too large or unreadable files become a failure result, not an exception. */
async function importPicked(p: string, importBytes: (name: string, bytes: Uint8Array, filePath?: string) => Promise<ImportResult>): Promise<ImportResult> {
  try {
    if ((await stat(p)).size > MAX_FILE_BYTES) throw new ImportError("too-large", { code: "file-too-large", args: { name: path.basename(p), mb: MAX_FILE_BYTES / 1024 / 1024 } });
    return await importBytes(path.basename(p), await readFile(p), p);
  } catch (e) {
    return failure(e, path.basename(p));
  }
}

export async function createLibrary(deps: LibraryDeps): Promise<LibraryApi> {
  const store = await LibraryStore.open(deps.dir);
  if (store.recovered) deps.onRecovered?.(store.recovered);
  const now = deps.now ?? Date.now;
  const parse = deps.parse ?? runParseJob;
  const { add, importBytes, importText } = importers(store, now, parse);

  const patch = (id: string, p: Partial<DocMeta>) => store.update(id, p);

  return {
    list: async () => store.list(),
    get: async (id) => {
      const meta = store.get(id);
      const content = await store.content(id);
      return meta && content ? { ...meta, ...content } : null;
    },
    search: (q) => store.search(q),
    importText,
    importClipboard: async () => importText(await deps.readClipboard()),
    importBytes: (name, bytes) => importBytes(name, bytes),
    pickFiles: async () => Promise.all((await deps.chooseFiles()).map((p) => importPicked(p, importBytes))),
    importUrl: async (url) => {
      try {
        const page = await fetchPage(url, deps.fetch, parse);
        return await add(page, { source: "url", format: "url", origin: page.host });
      } catch (e) {
        return failure(e);
      }
    },
    rename: (id, title) => patch(id, { title }),
    setVoice: async (id, voice) => {
      const doc = store.get(id);
      if (!doc) return null;
      if (voice) return patch(id, { voice });
      delete doc.voice;
      return patch(id, {});
    },
    setFinished: (id, finished) => patch(id, { finished, ...(finished ? { progress: { sentence: 0, fraction: 1 } } : { progress: { sentence: 0, fraction: 0 } }) }),
    setBookmarks: (id, bookmarks) => patch(id, { bookmarks }),
    setProgress: (id, progress: Progress) => patch(id, { progress, finished: progress.fraction >= 1 }),
    markOpened: (id) => patch(id, { openedAt: now() }),
    remove: (id) => store.remove(id),
    restore: (id) => store.restore(id),
    showInFolder: async (id) => {
      const p = store.get(id)?.path;
      if (p) deps.reveal(p);
    },
    source: (id) => store.source(id),
    replaceBlocks: (id, blocks: Block[]) => store.replaceBlocks(id, blocks, wordCount(blocks)),
  };
}
