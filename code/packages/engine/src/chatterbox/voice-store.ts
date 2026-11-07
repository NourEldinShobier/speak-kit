import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
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
    exaggeration: v.exactOptional(v.number()),
    pace: v.exactOptional(v.number()),
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

  /* oxlint-disable node/no-sync -- startup: the index is read once when the engine is built */
  constructor(dir: string) {
    this.#dir = dir;
    const file = join(dir, "index.json");
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return; // no index yet: start empty
    }
    try {
      const r = v.safeParse(IndexSchema, JSON.parse(text));
      if (r.success) {
        this.#index = r.output.filter((e) => existsSync(this.path(e.id)));
        return;
      }
    } catch {
      // not JSON: set aside below
    }
    try {
      renameSync(file, file + ".bad");
    } catch {
      // the file vanished or cannot be moved; the store still starts empty
    }
  }
  /* oxlint-enable node/no-sync */

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

  list(): ClonedVoice[] {
    return this.#index.map(({ id, name, durationMs, createdAt, checks, exaggeration, pace }) => ({
      id,
      name,
      durationMs,
      createdAt,
      checks,
      ...(exaggeration !== undefined && { exaggeration }),
      ...(pace !== undefined && { pace }),
    }));
  }

  /** Changes the name or the style of a voice; undefined when there is no such voice. A failed write leaves the voice as it was. */
  update(id: string, patch: { name?: string | undefined; exaggeration?: number | undefined; pace?: number | undefined }): Promise<ClonedVoice | undefined> {
    return this.#serial(async () => {
      const i = this.#index.findIndex((x) => x.id === id);
      if (i < 0) return undefined;
      const before = this.#index[i]!;
      this.#index[i] = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)) };
      try {
        await this.#save();
      } catch (err) {
        this.#index[i] = before; // the old object, so a key the patch added is gone again
        throw err;
      }
      return this.list().find((x) => x.id === id);
    });
  }

  /** The style the sidecar sends to the model for this voice; empty when the person never changed it. */
  style(id: string): { exaggeration?: number; pace?: number } {
    const e = this.#index.find((x) => x.id === id);
    return { ...(e?.exaggeration !== undefined && { exaggeration: e.exaggeration }), ...(e?.pace !== undefined && { pace: e.pace }) };
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
