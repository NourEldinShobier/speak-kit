import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isCustomModelId, type CustomSttModelId, type ModelFile, type SttModel, type SttModelId } from "./catalog";
import { LANGUAGES } from "./languages";

const MIN_MODEL_BYTES = 1_000_000;

export type ModelHeader = "ggml" | "gguf";

/** The first four bytes tell a whisper.cpp model file (the legacy "ggml" magic, stored little endian) from GGUF; anything else is not a model. */
export async function readHeader(path: string): Promise<ModelHeader | undefined> {
  const f = await open(path, "r");
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await f.read(buf, 0, 4, 0);
    if (bytesRead < 4) return undefined;
    if (buf.toString("latin1") === "lmgg") return "ggml";
    if (buf.toString("latin1") === "GGUF") return "gguf";
    return undefined;
  } finally {
    await f.close();
  }
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

export type Inspection =
  | { ok: true; header: ModelHeader; bytes: number; sha256: string; id: CustomSttModelId; name: string }
  | { ok: false; reason: "not-found" | "too-small" | "not-a-model"; message: string };

const FAIL = {
  "not-found": "That file could not be opened.",
  "too-small": "That file is too small to be a speech model. Nothing was copied.",
  "not-a-model": "That file is not a Whisper model (its header is wrong). Nothing was copied.",
} as const;

/** Size in bytes of a regular file; `missing` (default -1) when it is absent or cannot be read, which is a normal answer here. */
const sizeOf = (p: string, missing = -1): Promise<number> =>
  stat(p).then(
    (s) => (s.isFile() ? s.size : missing),
    () => missing,
  );

/** Checks the header and fingerprints the whole file; the fingerprint, not the name, is what identifies the model. */
export async function inspectModelFile(path: string): Promise<Inspection> {
  const fail = (reason: keyof typeof FAIL): Inspection => ({ ok: false, reason, message: FAIL[reason] });
  const bytes = await sizeOf(path);
  if (bytes < 0) return fail("not-found");
  if (bytes < MIN_MODEL_BYTES) return fail("too-small");
  const header = await readHeader(path).then(
    (h) => h,
    () => undefined,
  );
  if (!header) return fail("not-a-model");
  const sha256 = await sha256File(path);
  return { ok: true, header, bytes, sha256, id: `custom-${sha256.slice(0, 12)}`, name: basename(path).replace(/\.(bin|gguf)$/i, "") };
}

/** A model the person added from a file. The file lives in our folder under its fingerprint; the original is never touched. */
export interface ImportedModel {
  id: CustomSttModelId;
  name: string;
  file: string;
  sha256: string;
  bytes: number;
  engine: "whisper" | "parakeet";
  /** "multilingual" models take every language; "english" ones only English. */
  kind: "multilingual" | "english";
  addedAt: number;
  /** Where it was imported from, so the page can ask for it again when our copy goes missing. */
  sourcePath?: string;
}

const REGISTRY = "imported.json";
const sttDir = (modelsDir: string) => join(modelsDir, "stt");

export async function loadImported(modelsDir: string): Promise<ImportedModel[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(sttDir(modelsDir), REGISTRY), "utf8"));
    return Array.isArray(raw)
      ? raw.filter((r): r is ImportedModel => !!r && typeof r.id === "string" && isCustomModelId(r.id) && typeof r.file === "string" && typeof r.sha256 === "string" && typeof r.bytes === "number")
      : [];
  } catch {
    return [];
  }
}

async function saveImported(modelsDir: string, list: readonly ImportedModel[]): Promise<void> {
  await mkdir(sttDir(modelsDir), { recursive: true });
  const tmp = join(sttDir(modelsDir), `${REGISTRY}.tmp`);
  await writeFile(tmp, JSON.stringify(list, null, 2));
  await rename(tmp, join(sttDir(modelsDir), REGISTRY));
}

/** The catalog entry for an imported model. It has no address: it is never downloaded. */
export function importedAsModel(m: ImportedModel): SttModel {
  const english = m.kind === "english";
  return {
    id: m.id,
    engine: m.engine,
    name: m.name,
    label: "Added by you",
    tag: "Yours",
    description: "A model file you added.",
    file: m.file,
    url: "",
    sha256: m.sha256,
    bytes: m.bytes,
    languages: english ? ["en"] : ["auto", ...LANGUAGES.map((l) => l.code)],
    detects: !english,
    license: { name: "Not checked", url: "" },
    origin: "custom",
  };
}

export type ImportResult = { ok: true; model: ImportedModel; alreadyThere: boolean } | { ok: false; reason: "not-found" | "too-small" | "not-a-model" | "different-file" | "disk"; message: string };

export interface ImportOptions {
  modelsDir: string;
  source: string;
  kind?: ImportedModel["kind"];
  name?: string;
  /** Only this fingerprint is accepted: used when the person points at the file that went missing. */
  expectSha256?: string;
  now?: () => number;
}

/** Copies `source` to `dest` through a .part file, so a half copy never counts. Returns the failure message, or undefined when it worked. */
async function copyInto(source: string, dest: string): Promise<string | undefined> {
  try {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(source, `${dest}.part`);
    await rename(`${dest}.part`, dest);
    return undefined;
  } catch (e) {
    await rm(`${dest}.part`, { force: true });
    return `The file could not be copied: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function registryEntry(check: Extract<Inspection, { ok: true }>, known: ImportedModel | undefined, o: ImportOptions): ImportedModel {
  return {
    id: check.id,
    name: (o.name ?? known?.name ?? check.name).slice(0, 60) || check.id,
    file: `${check.id}.bin`,
    sha256: check.sha256,
    bytes: check.bytes,
    engine: known?.engine ?? "whisper",
    kind: o.kind ?? known?.kind ?? "multilingual",
    addedAt: known?.addedAt ?? (o.now ?? Date.now)(),
    sourcePath: o.source,
  };
}

/** Validates then copies. Nothing is copied unless the header is right; copying goes through a .part file so a half copy never counts. */
export async function importModelFile(o: ImportOptions): Promise<ImportResult> {
  const check = await inspectModelFile(o.source);
  if (!check.ok) return check;
  if (o.expectSha256 && check.sha256 !== o.expectSha256) return { ok: false, reason: "different-file", message: "That is not the same file: its fingerprint is different." };
  const list = await loadImported(o.modelsDir);
  const dest = join(sttDir(o.modelsDir), `${check.id}.bin`);
  const known = list.find((m) => m.id === check.id);
  const present = (await sizeOf(dest)) === check.bytes;
  if (known && present) return { ok: true, model: known, alreadyThere: true };
  const failure = present ? undefined : await copyInto(o.source, dest);
  if (failure) return { ok: false, reason: "disk", message: failure };
  const model = registryEntry(check, known, o);
  await saveImported(o.modelsDir, [...list.filter((m) => m.id !== model.id), model]);
  return { ok: true, model, alreadyThere: false };
}

/** Imported models whose copy in our folder is gone or has the wrong size. */
export async function missingImported(modelsDir: string, list: readonly ImportedModel[]): Promise<ImportedModel[]> {
  const out: ImportedModel[] = [];
  for (const m of list) if ((await sizeOf(join(sttDir(modelsDir), m.file))) !== m.bytes) out.push(m);
  return out;
}

export async function removeImported(modelsDir: string, id: string): Promise<void> {
  const list = await loadImported(modelsDir);
  await saveImported(
    modelsDir,
    list.filter((m) => m.id !== id),
  );
}

export interface FoundModel {
  id: SttModelId;
  /** Where the identical file sits now. */
  path: string;
}

/**
 * Looks in `dirs` (not below them) for files that are exactly a catalog model: same size first, then the same SHA-256. Read-only. A file with the
 * right name but another fingerprint is ignored, so a renamed or broken file is never used.
 */
export async function findModelsOnDisk(dirs: readonly string[], catalog: readonly (ModelFile & { id: SttModelId })[]): Promise<FoundModel[]> {
  const found = new Map<string, FoundModel>();
  for (const dir of dirs) {
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const path = join(dir, name);
      const size = await sizeOf(path);
      for (const m of catalog) {
        if (size !== m.bytes || found.has(m.id)) continue;
        if ((await sha256File(path).catch(() => "")) === m.sha256) found.set(m.id, { id: m.id, path });
      }
    }
  }
  return [...found.values()];
}

/** Copies a found file into our folder under the catalog name, so it is used like a download that already finished. */
export async function adoptFound(modelsDir: string, found: FoundModel, m: ModelFile): Promise<void> {
  const dest = join(sttDir(modelsDir), m.file);
  if (resolve(found.path) === resolve(dest)) return;
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(found.path, `${dest}.part`);
  await rename(`${dest}.part`, dest);
}

export interface DiskUse {
  perModel: Record<string, number>;
  /** Our folder only: files the person keeps elsewhere are never counted. */
  total: number;
}

/** Bytes each model takes in our folder (finished files and partial downloads). */
export async function diskUse(modelsDir: string, models: readonly Pick<SttModel, "id" | "file">[]): Promise<DiskUse> {
  const perModel: Record<string, number> = {};
  let total = 0;
  for (const m of models) {
    const base = join(sttDir(modelsDir), m.file);
    const n = (await sizeOf(base, 0)) + (await sizeOf(`${base}.part`, 0));
    if (n > 0) perModel[m.id] = n;
    total += n;
  }
  return { perModel, total };
}

const inside = (root: string, p: string) => {
  const rel = relative(resolve(root), resolve(p));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Removes the model file and its partial download, only when they sit inside our folder. Returns the bytes freed. */
export async function deleteModelFiles(modelsDir: string, m: Pick<ModelFile, "file">): Promise<number> {
  const base = join(sttDir(modelsDir), m.file);
  if (!inside(sttDir(modelsDir), base)) throw new Error("refusing to delete a file outside the models folder");
  let freed = 0;
  for (const p of [base, `${base}.part`]) {
    freed += await sizeOf(p, 0);
    await rm(p, { force: true });
  }
  return freed;
}
