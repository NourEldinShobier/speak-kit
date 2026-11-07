import * as v from "valibot";
import { PROXY_PATHS, type LibraryMethod } from "./channels";
import type { DesktopError } from "../errors";

export { LIBRARY_METHODS, libraryChannel, PROXY_CANCEL, PROXY_CHUNK, PROXY_OPEN, PROXY_PATHS } from "./channels";

/** The library's wire contract: shared by main (handlers), preload (channels) and renderer (types). No Electron imports here. */

export const BlockSchema = v.object({
  kind: v.picklist(["heading", "paragraph", "quote", "list-item"]),
  text: v.string(),
  level: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6))),
  /** 1-based PDF page the block sits on */
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});
export type Block = v.InferOutput<typeof BlockSchema>;

export const SOURCES = ["paste", "file", "url"] as const;
export const FORMATS = ["text", "markdown", "html", "pdf", "docx", "epub", "url"] as const;
export const EXTENSIONS = ["txt", "md", "markdown", "html", "htm", "pdf", "docx", "epub"] as const;
export type Source = (typeof SOURCES)[number];
export type Format = (typeof FORMATS)[number];

export interface Progress {
  /** index of the sentence heard last (reader sentence numbering) */
  sentence: number;
  /** 0..1 of the document */
  fraction: number;
}

export const BookmarkSchema = v.object({
  /** index of the bookmarked sentence (reader sentence numbering) */
  sentence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** the start of the sentence, so the list reads without opening the text */
  label: v.pipe(v.string(), v.maxLength(120)),
});
export type Bookmark = v.InferOutput<typeof BookmarkSchema>;

export interface DocMeta {
  id: string;
  title: string;
  source: Source;
  format: Format;
  /** host for web pages, file name for files */
  origin: string;
  /** absolute path of an imported file on this computer (for "Show in folder") */
  path?: string;
  addedAt: number;
  openedAt?: number;
  wordCount: number;
  pages?: number;
  /** per-document voice, overrides the app default */
  voice?: string;
  progress: Progress;
  finished: boolean;
  /** places the reader saved in the outline panel, in text order */
  bookmarks?: Bookmark[];
  /** a PDF without a text layer: the reader offers local OCR */
  needsOcr?: boolean;
}

export interface DocContent {
  blocks: Block[];
}

export interface SearchHit {
  id: string;
  /** a snippet of the text around the first match, when the match is in the body */
  snippet?: string;
}

export type ImportFailure = "unsupported" | "empty" | "unreadable" | "network" | "too-large";
export type ImportResult = { ok: true; doc: DocMeta } | { ok: false; reason: ImportFailure; error: DesktopError; name?: string };

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PASTE_CHARS = 2_000_000;

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const title = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));

/** Argument tuple per method, validated in main before a handler runs. */
export const LIBRARY_ARGS = {
  list: v.tuple([]),
  get: v.tuple([id]),
  search: v.tuple([v.pipe(v.string(), v.maxLength(200))]),
  importText: v.tuple([v.pipe(v.string(), v.maxLength(MAX_PASTE_CHARS)), v.optional(title), v.optional(id)]),
  importBytes: v.tuple([v.pipe(v.string(), v.minLength(1), v.maxLength(255)), v.instance(Uint8Array)]),
  pickFiles: v.tuple([]),
  importUrl: v.tuple([v.pipe(v.string(), v.maxLength(2048))]),
  rename: v.tuple([id, title]),
  setVoice: v.tuple([id, v.nullable(id)]),
  setFinished: v.tuple([id, v.boolean()]),
  setBookmarks: v.tuple([id, v.pipe(v.array(BookmarkSchema), v.maxLength(500))]),
  setProgress: v.tuple([id, v.object({ sentence: v.pipe(v.number(), v.integer(), v.minValue(0)), fraction: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) })]),
  markOpened: v.tuple([id]),
  remove: v.tuple([id]),
  restore: v.tuple([id]),
  showInFolder: v.tuple([id]),
  source: v.tuple([id]),
  replaceBlocks: v.tuple([id, v.pipe(v.array(BlockSchema), v.maxLength(200_000))]),
} as const satisfies Record<LibraryMethod, unknown>;

/** window.speakkitLibrary */
export interface LibraryApi {
  list(): Promise<DocMeta[]>;
  get(id: string): Promise<(DocMeta & DocContent) | null>;
  /** ids of documents whose title, origin or text contains every word of the query */
  search(query: string): Promise<SearchHit[]>;
  importText(text: string, title?: string, voice?: string): Promise<ImportResult>;
  importBytes(name: string, bytes: Uint8Array): Promise<ImportResult>;
  /** Opens the system file dialog and imports the chosen files; resolves to one result per file. */
  pickFiles(): Promise<ImportResult[]>;
  importUrl(url: string): Promise<ImportResult>;
  rename(id: string, title: string): Promise<DocMeta | null>;
  setVoice(id: string, voice: string | null): Promise<DocMeta | null>;
  setFinished(id: string, finished: boolean): Promise<DocMeta | null>;
  setBookmarks(id: string, bookmarks: Bookmark[]): Promise<DocMeta | null>;
  setProgress(id: string, progress: Progress): Promise<DocMeta | null>;
  markOpened(id: string): Promise<DocMeta | null>;
  /** Removes the reading from the library; it stays restorable until the app quits. */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<DocMeta | null>;
  showInFolder(id: string): Promise<void>;
  /** The original bytes of a PDF kept for OCR. */
  source(id: string): Promise<Uint8Array | null>;
  /** Replaces the text of a document (OCR result); clears needsOcr. */
  replaceBlocks(id: string, blocks: Block[]): Promise<DocMeta | null>;
}

export const ProxyRequestSchema = v.object({
  id: v.pipe(v.number(), v.integer()),
  path: v.picklist(PROXY_PATHS),
  method: v.picklist(["GET", "POST"]),
  body: v.optional(v.pipe(v.string(), v.maxLength(2_000_000))),
  replace: v.optional(v.pipe(v.string(), v.maxLength(64))),
});
export type ProxyRequest = v.InferOutput<typeof ProxyRequestSchema>;
export type ProxyChunk =
  | { id: number; type: "head"; status: number }
  | { id: number; type: "data"; data: Uint8Array }
  | { id: number; type: "end" }
  | { id: number; type: "error"; error: DesktopError };

/** What the preload exposes as window.speakkitLibrary. */
export interface LibraryBridge extends LibraryApi {
  proxyOpen(req: ProxyRequest): Promise<void>;
  proxyCancel(id: number): void;
  onProxyChunk(cb: (chunk: ProxyChunk) => void): () => void;
}
