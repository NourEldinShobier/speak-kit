import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as v from "valibot";
import type { CloneCheck, ClonedVoice, Voice } from "@speakkit/protocol";

const IndexSchema = v.array(
  v.object({
    id: v.pipe(v.string(), v.regex(/^cb_[0-9a-f]{8}$/)),
    name: v.string(),
    durationMs: v.number(),
    createdAt: v.number(),
    gender: v.picklist(["female", "male"]),
    checks: v.array(
      v.object({
        id: v.picklist(["length", "sample-rate", "loudness", "silence", "noise"]),
        ok: v.boolean(),
        message: v.string(),
      }),
    ),
  }),
);
type Entry = v.InferOutput<typeof IndexSchema>[number];

/** Cloned voices on disk: `<dir>/<id>.wav` (the reference clip) and `<dir>/index.json`. */
export class ClonedVoiceStore {
  #dir: string;
  #index: Entry[] = [];
  #chain: Promise<unknown> = Promise.resolve();

  constructor(dir: string) {
    this.#dir = dir;
    try {
      // oxlint-disable-next-line node/no-sync -- startup: the index is read once when the engine is built
      const r = v.safeParse(IndexSchema, JSON.parse(readFileSync(join(dir, "index.json"), "utf8")));
      if (r.success) this.#index = r.output.filter((e) => existsSync(this.path(e.id)));
    } catch {
      // missing or corrupt index: start empty; clips stay on disk
    }
  }

  path(id: string): string {
    return join(this.#dir, `${id}.wav`);
  }

  has(id: string): boolean {
    return this.#index.some((e) => e.id === id);
  }

  /** Runs `fn` after every earlier write finished, so index.json is never written by two calls at once. */
  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#chain.then(fn);
    this.#chain = run.catch(() => {});
    return run;
  }

  /** Stores the clip and adds the voice. A failed write leaves neither the clip nor an index entry behind. */
  create(o: { name: string; wav: Uint8Array; durationMs: number; checks: CloneCheck[]; gender?: "female" | "male" }): Promise<ClonedVoice> {
    const id = `cb_${randomBytes(4).toString("hex")}`;
    const e: Entry = { id, name: o.name, durationMs: o.durationMs, createdAt: Date.now(), gender: o.gender ?? "female", checks: o.checks };
    return this.#serial(async () => {
      await mkdir(this.#dir, { recursive: true });
      await writeFile(this.path(id), o.wav);
      this.#index.push(e);
      try {
        await this.#save();
      } catch (err) {
        this.#index.pop();
        await rm(this.path(id), { force: true });
        throw err;
      }
      return { id, name: e.name, durationMs: e.durationMs, createdAt: e.createdAt, checks: e.checks };
    });
  }

  /** Deletes a voice and its clip; false when there is no such voice. */
  delete(id: string): Promise<boolean> {
    return this.#serial(async () => {
      const i = this.#index.findIndex((e) => e.id === id);
      if (i < 0) return false;
      this.#index.splice(i, 1);
      await rm(this.path(id), { force: true });
      await this.#save();
      return true;
    });
  }

  /* oxlint-disable node/no-sync -- deprecated synchronous forms, kept until the server calls create() and delete() */
  /** @deprecated Blocks the event loop while it writes the clip; use `create`. */
  add(o: { name: string; wav: Uint8Array; durationMs: number; checks: CloneCheck[]; gender?: "female" | "male" }): ClonedVoice {
    const id = `cb_${randomBytes(4).toString("hex")}`;
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(this.path(id), o.wav);
    const e: Entry = { id, name: o.name, durationMs: o.durationMs, createdAt: Date.now(), gender: o.gender ?? "female", checks: o.checks };
    this.#index.push(e);
    const file = join(this.#dir, "index.json");
    writeFileSync(file + ".tmp", JSON.stringify(this.#index));
    renameSync(file + ".tmp", file);
    return { id, name: e.name, durationMs: e.durationMs, createdAt: e.createdAt, checks: e.checks };
  }

  /** @deprecated Blocks the event loop; use `delete`. */
  remove(id: string): boolean {
    const i = this.#index.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.#index.splice(i, 1);
    rmSync(this.path(id), { force: true });
    const file = join(this.#dir, "index.json");
    writeFileSync(file + ".tmp", JSON.stringify(this.#index));
    renameSync(file + ".tmp", file);
    return true;
  }
  /* oxlint-enable node/no-sync */

  list(): ClonedVoice[] {
    return this.#index.map(({ id, name, durationMs, createdAt, checks }) => ({ id, name, durationMs, createdAt, checks }));
  }

  voices(): Voice[] {
    return this.#index.map((e) => ({ id: e.id, name: e.name, lang: "en-US", gender: e.gender, quality: "A", cloned: true }));
  }

  async #save(): Promise<void> {
    const file = join(this.#dir, "index.json");
    await writeFile(file + ".tmp", JSON.stringify(this.#index));
    await rename(file + ".tmp", file);
  }
}
