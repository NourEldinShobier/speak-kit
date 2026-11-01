import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

  constructor(dir: string) {
    this.#dir = dir;
    try {
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

  add(o: { name: string; wav: Uint8Array; durationMs: number; checks: CloneCheck[]; gender?: "female" | "male" }): ClonedVoice {
    const id = `cb_${randomBytes(4).toString("hex")}`;
    mkdirSync(this.#dir, { recursive: true });
    writeFileSync(this.path(id), o.wav);
    const e: Entry = { id, name: o.name, durationMs: o.durationMs, createdAt: Date.now(), gender: o.gender ?? "female", checks: o.checks };
    this.#index.push(e);
    this.#save();
    return { id, name: e.name, durationMs: e.durationMs, createdAt: e.createdAt, checks: e.checks };
  }

  remove(id: string): boolean {
    const i = this.#index.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.#index.splice(i, 1);
    rmSync(this.path(id), { force: true });
    this.#save();
    return true;
  }

  list(): ClonedVoice[] {
    return this.#index.map(({ id, name, durationMs, createdAt, checks }) => ({ id, name, durationMs, createdAt, checks }));
  }

  voices(): Voice[] {
    return this.#index.map((e) => ({ id: e.id, name: e.name, lang: "en-US", gender: e.gender, quality: "A", cloned: true }));
  }

  #save(): void {
    const file = join(this.#dir, "index.json");
    writeFileSync(file + ".tmp", JSON.stringify(this.#index));
    renameSync(file + ".tmp", file);
  }
}
