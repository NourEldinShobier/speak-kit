import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import type { Block, DocContent, DocMeta, SearchHit } from "./contract";

interface Index {
  docs: DocMeta[];
}

const SNIPPET_RADIUS = 48;
const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Documents in userData/library: an index (library.json, atomic writes through lowdb) and one JSON file per document body,
 * so the list never loads text. Removed documents stay restorable in memory until the app quits; files of documents that
 * were never restored are deleted at the next start (gc).
 */
export class LibraryStore {
  private trash = new Map<string, DocMeta>();
  private text = new Map<string, string>();

  private constructor(
    private dir: string,
    private db: Low<Index>,
  ) {}

  static async open(dir: string): Promise<LibraryStore> {
    await mkdir(path.join(dir, "docs"), { recursive: true });
    const db = new Low<Index>(new JSONFile<Index>(path.join(dir, "library.json")), { docs: [] });
    await db.read();
    db.data.docs ??= [];
    const store = new LibraryStore(dir, db);
    await store.gc();
    return store;
  }

  private body = (id: string) => new JSONFile<DocContent>(path.join(this.dir, "docs", `${id}.json`));
  private sourcePath = (id: string) => path.join(this.dir, "docs", `${id}.src`);
  private save = () => this.db.write();

  list(): DocMeta[] {
    return this.db.data.docs;
  }

  get(id: string): DocMeta | undefined {
    return this.db.data.docs.find((d) => d.id === id);
  }

  async content(id: string): Promise<DocContent | null> {
    return this.get(id) ? ((await this.body(id).read()) ?? { blocks: [] }) : null;
  }

  async add(meta: DocMeta, blocks: Block[], source?: Uint8Array): Promise<void> {
    await this.body(meta.id).write({ blocks });
    if (source) await writeFile(this.sourcePath(meta.id), source);
    this.db.data.docs.push(meta);
    await this.save();
  }

  async update(id: string, patch: Partial<DocMeta>): Promise<DocMeta | null> {
    const doc = this.get(id);
    if (!doc) return null;
    Object.assign(doc, patch);
    await this.save();
    return doc;
  }

  async replaceBlocks(id: string, blocks: Block[], patch: Partial<DocMeta>): Promise<DocMeta | null> {
    if (!this.get(id)) return null;
    await this.body(id).write({ blocks });
    this.text.delete(id);
    return this.update(id, patch);
  }

  async source(id: string): Promise<Uint8Array | null> {
    return this.get(id) ? readFile(this.sourcePath(id)).then((b) => new Uint8Array(b), () => null) : null;
  }

  async remove(id: string): Promise<void> {
    const doc = this.get(id);
    if (!doc) return;
    this.trash.set(id, doc);
    this.db.data.docs = this.db.data.docs.filter((d) => d.id !== id);
    await this.save();
  }

  async restore(id: string): Promise<DocMeta | null> {
    const doc = this.trash.get(id);
    if (!doc) return null;
    this.trash.delete(id);
    this.db.data.docs.push(doc);
    await this.save();
    return doc;
  }

  /** Documents whose title, origin or text contain every word of the query. */
  async search(query: string): Promise<SearchHit[]> {
    const terms = words(query);
    if (!terms.length) return [];
    const hits: SearchHit[] = [];
    for (const d of this.db.data.docs) {
      const head = `${d.title} ${d.origin}`.toLowerCase();
      const body = await this.lowerText(d.id);
      if (!terms.every((t) => head.includes(t) || body.includes(t))) continue;
      const at = terms.every((t) => head.includes(t)) ? -1 : body.indexOf(terms.find((t) => !head.includes(t))!);
      hits.push(at < 0 ? { id: d.id } : { id: d.id, snippet: await this.snippet(d.id, at, query) });
    }
    return hits;
  }

  private async lowerText(id: string): Promise<string> {
    let t = this.text.get(id);
    if (t === undefined) {
      t = ((await this.content(id))?.blocks ?? []).map((b) => b.text).join("\n").toLowerCase();
      this.text.set(id, t);
    }
    return t;
  }

  /** Original-case text around a match found in the lower-case copy (same length, so offsets agree). */
  private async snippet(id: string, at: number, query: string): Promise<string> {
    const full = ((await this.content(id))?.blocks ?? []).map((b) => b.text).join("\n");
    const from = Math.max(0, at - SNIPPET_RADIUS);
    const len = words(query)[0]?.length ?? 0;
    const piece = full.slice(from, at + len + SNIPPET_RADIUS).replace(/\s+/g, " ");
    return `${from > 0 ? "..." : ""}${piece}${at + len + SNIPPET_RADIUS < full.length ? "..." : ""}`;
  }

  private async gc(): Promise<void> {
    const keep = new Set(this.db.data.docs.map((d) => d.id));
    for (const f of await readdir(path.join(this.dir, "docs")))
      if (!keep.has(f.replace(/\.(json|src)$/, ""))) await rm(path.join(this.dir, "docs", f), { force: true });
  }
}
