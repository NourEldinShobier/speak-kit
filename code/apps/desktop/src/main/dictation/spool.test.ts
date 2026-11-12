import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createSpool, MAX_TRIES } from "./spool";

let dir = "";
beforeEach(async () => void (dir = await mkdtemp(path.join(tmpdir(), "spool-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const spool = () => createSpool({ now: () => 10_000, dir, sleep: async () => undefined });
const second = (level: number, seconds = 1) => new Float32Array(16_000 * seconds).fill(level);
const files = async () => (await readdir(dir)).sort();

describe("spool", () => {
  it("keeps the samples of a take on disk as they arrive, with a manifest that says it is still recording", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1000);
    await s.append(id, second(0.5, 0.5));
    await s.append(id, second(-0.25, 0.5));
    expect(await files()).toEqual([`${id}.json`, `${id}.pcm`]);
    expect((await readFile(path.join(dir, `${id}.pcm`))).length).toBe(2 * 8000 * 2);
    expect(JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8"))).toEqual({ v: 1, id, rate: 16_000, startedAt: 1000, state: "recording", tries: 0 });
  });

  it("marks the take pending when the recording ends", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.seal(id);
    expect(JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")).state).toBe("pending");
  });

  it("removes both files when the take is finished, and finishing twice is harmless", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.finish(id);
    await s.finish(id);
    expect(await files()).toEqual([]);
  });

  it("recovers a take cut off in the middle of recording, with the samples to within one 16-bit step", async () => {
    const first = spool();
    const id = await first.begin(16_000, 5);
    await first.append(id, second(0.5));
    // the app stops here: a new process opens the same folder
    const got = await spool().recover();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id, startedAt: 5, state: "recording" });
    expect(got[0]!.clip.sampleRate).toBe(16_000);
    expect(got[0]!.clip.pcm).toHaveLength(16_000);
    expect(got[0]!.clip.pcm[0]).toBeCloseTo(0.5, 3);
    expect(got[0]!.clip.peak).toBeCloseTo(0.5, 3);
  });

  it("recovers a pending take and orders takes oldest first", async () => {
    const s = spool();
    const late = await s.begin(16_000, 200);
    await s.append(late, second(0.4));
    await s.seal(late);
    const early = await s.begin(16_000, 100);
    await s.append(early, second(0.4));
    const got = await spool().recover();
    expect(got.map((r) => [r.startedAt, r.state])).toEqual([
      [100, "recording"],
      [200, "pending"],
    ]);
  });

  it("ignores a half sample at the end of a cut-off write", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    const pcm = path.join(dir, `${id}.pcm`);
    await writeFile(pcm, Buffer.concat([await readFile(pcm), Buffer.from([0x7f])]));
    expect((await spool().recover())[0]!.clip.pcm).toHaveLength(16_000);
  });

  it("drops a take shorter than 400 ms", async () => {
    const s = spool();
    await s.append(await s.begin(16_000, 1), second(0.5, 0.3));
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("counts each recovery and gives a take up after three tries", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    for (let i = 0; i < MAX_TRIES; i++) expect(await spool().recover()).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")).tries).toBe(MAX_TRIES);
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("removes a manifest that never finished writing and a pcm file without a manifest", async () => {
    await writeFile(path.join(dir, "bad.json"), "{not json");
    await writeFile(path.join(dir, "bad.pcm"), Buffer.alloc(64_000));
    await writeFile(path.join(dir, "orphan.pcm"), Buffer.alloc(64_000));
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("never reads a file outside the folder through a manifest id", async () => {
    await writeFile(path.join(dir, "x.json"), JSON.stringify({ v: 1, id: "../x", rate: 16_000, startedAt: 1, state: "pending", tries: 0 }));
    expect(await spool().recover()).toEqual([]);
  });

  it("recovers nothing from a folder that does not exist", async () => {
    expect(await createSpool({ now: () => 10_000, dir: path.join(dir, "missing") }).recover()).toEqual([]);
  });

  it("does not write empty chunks or chunks for an unsafe id", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, new Float32Array(0));
    await s.append("../evil", second(0.5));
    expect(await files()).toEqual([`${id}.json`, `${id}.pcm`]);
    expect((await readFile(path.join(dir, `${id}.pcm`))).length).toBe(0);
  });

  it("clips samples outside -1 to 1 instead of wrapping them", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, new Float32Array(16_000).fill(3));
    const got = await spool().recover();
    expect(got[0]!.clip.pcm[0]).toBeCloseTo(1, 3);
  });

  it("retries a file another program holds open for a moment", async () => {
    let busy = 2;
    const slept: number[] = [];
    const s = createSpool({
      now: () => 10_000,
      dir,
      sleep: async (ms) => void slept.push(ms),
      unlink: async (f) => {
        if (busy-- > 0) throw Object.assign(new Error("locked"), { code: "EBUSY" });
        await rm(f);
      },
    });
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.finish(id);
    expect(await files()).toEqual([]);
    expect(slept).toEqual([50, 50]);
  });

  it("marks a take it cannot delete as tried out, so the next start removes it instead of transcribing it twice", async () => {
    const s = createSpool({
      now: () => 10_000,
      dir,
      sleep: async () => undefined,
      unlink: async () => {
        throw Object.assign(new Error("locked"), { code: "EPERM" });
      },
    });
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.finish(id);
    expect(JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")).tries).toBe(MAX_TRIES);
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("does not hide an error that is not a lock", async () => {
    const s = createSpool({
      now: () => 10_000,
      dir,
      unlink: async () => {
        throw Object.assign(new Error("io"), { code: "EIO" });
      },
    });
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.finish(id);
    expect(JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")).tries).toBe(MAX_TRIES);
  });
});
