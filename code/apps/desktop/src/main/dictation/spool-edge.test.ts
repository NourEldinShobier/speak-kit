import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createSpool } from "./spool";

let dir = "";
beforeEach(async () => void (dir = await mkdtemp(path.join(tmpdir(), "spool-edge-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

const spool = () => createSpool({ now: () => 10_000, dir, sleep: async () => undefined });
const second = (level: number, seconds = 1) => new Float32Array(16_000 * seconds).fill(level);
const files = async () => (await readdir(dir)).sort();
const manifest = (over: object) => ({ v: 1, id: "x", rate: 16_000, startedAt: 1, state: "pending", tries: 0, ...over });
const locked = (code: string) => async () => {
  throw Object.assign(new Error("locked"), { code });
};

describe("spool edge cases", () => {
  it("orders recovered takes by their start time, not by file name", async () => {
    const s = spool();
    const ten = await s.begin(16_000, 10);
    await s.append(ten, second(0.4));
    const nine = await s.begin(16_000, 9);
    await s.append(nine, second(0.4));
    expect((await spool().recover()).map((r) => r.startedAt)).toEqual([9, 10]);
  });

  it("keeps a take of exactly 400 ms and drops one a sample shorter", async () => {
    const s = spool();
    const exact = await s.begin(16_000, 1);
    await s.append(exact, new Float32Array(6400).fill(0.5));
    const short = await s.begin(16_000, 2);
    await s.append(short, new Float32Array(6399).fill(0.5));
    expect((await spool().recover()).map((r) => r.id)).toEqual([exact]);
  });

  it.each([
    ["a version it does not know", manifest({ v: 2 })],
    ["an id that is not a string", manifest({ id: 7 })],
    ["a rate of zero", manifest({ rate: 0 })],
    ["a negative rate", manifest({ rate: -16_000 })],
    ["a state it does not know", manifest({ state: "done" })],
    ["a start time that is not a number", manifest({ startedAt: "soon" })],
    ["a try count that is not a whole number", manifest({ tries: 0.5 })],
  ])("removes a take whose manifest has %s", async (_name, m) => {
    await writeFile(path.join(dir, "x.json"), JSON.stringify(m));
    await writeFile(path.join(dir, "x.pcm"), Buffer.alloc(64_000));
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("leaves files whose names are not take ids alone", async () => {
    await writeFile(path.join(dir, "a b.json"), JSON.stringify(manifest({ id: "a b" })));
    await writeFile(path.join(dir, "a b.pcm"), Buffer.alloc(64_000));
    await writeFile(path.join(dir, "notes.txt"), "keep");
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual(["a b.json", "a b.pcm", "notes.txt"]);
  });

  it("accepts an id of 64 characters and not one of 65", async () => {
    const ok = "a".repeat(64);
    const long = "b".repeat(65);
    for (const id of [ok, long]) {
      await writeFile(path.join(dir, `${id}.json`), JSON.stringify(manifest({ id })));
      await writeFile(path.join(dir, `${id}.pcm`), Buffer.alloc(64_000));
    }
    expect((await spool().recover()).map((r) => r.id)).toEqual([ok]);
    expect(await files()).toContain(`${long}.pcm`);
  });

  it("never writes outside the folder for an unsafe id", async () => {
    const inner = createSpool({ now: () => 10_000, dir: path.join(dir, "takes") }); // the escape lands in `dir`, which the test removes
    await inner.append("../escape", second(0.5));
    await expect(stat(path.join(dir, "escape.pcm"))).rejects.toThrow();
  });

  it("gives takes started in one millisecond different names, counting up", async () => {
    const s = createSpool({ dir, now: () => 7, sleep: async () => undefined });
    expect([await s.begin(16_000, 5), await s.begin(16_000, 5)]).toEqual(["5-7-0", "5-7-1"]);
  });

  it("does not create a manifest when sealing or finishing a take that does not exist", async () => {
    await spool().seal("ghost");
    await spool().finish("ghost");
    await createSpool({ now: () => 10_000, dir, sleep: async () => undefined, unlink: locked("EPERM") }).finish("ghost");
    expect(await files()).toEqual([]);
  });

  it("finishes a take whose audio file is already gone", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await rm(path.join(dir, `${id}.pcm`));
    await s.finish(id);
    expect(await files()).toEqual([]);
  });

  it.each(["EBUSY", "EPERM", "EACCES"])("retries a file held open four times for %s and then gives up", async (code) => {
    const slept: number[] = [];
    const s = createSpool({ now: () => 10_000, dir, sleep: async (ms) => void slept.push(ms), unlink: locked(code) });
    const id = await s.begin(16_000, 1);
    await s.append(id, second(0.5));
    await s.finish(id);
    expect(slept).toEqual([50, 50, 50, 50]);
  });

  it("does not retry an error that is not a lock", async () => {
    const slept: number[] = [];
    const s = createSpool({ now: () => 10_000, dir, sleep: async (ms) => void slept.push(ms), unlink: locked("ENOTEMPTY") });
    const id = await s.begin(16_000, 1);
    await s.finish(id);
    expect(slept).toEqual([]);
  });

  it("waits for real between retries when no sleep is given", async () => {
    let busy = 1;
    const s = createSpool({
      now: () => 10_000,
      dir,
      unlink: async (f) => {
        if (busy-- > 0) throw Object.assign(new Error("locked"), { code: "EBUSY" });
        await rm(f);
      },
    });
    const id = await s.begin(16_000, 1);
    const from = Date.now();
    await s.finish(id);
    expect(Date.now() - from).toBeGreaterThanOrEqual(40);
    expect(await files()).toEqual([]);
  });

  it("keeps the order of appends made without waiting for each", async () => {
    const s = spool();
    const id = await s.begin(16_000, 1);
    void s.append(id, new Float32Array(7000).fill(0.5));
    void s.append(id, new Float32Array(8000).fill(-0.5));
    await s.seal(id);
    const pcm = (await spool().recover())[0]!.clip.pcm;
    expect([pcm[0], pcm[6999], pcm[7000], pcm[14999]].map((x) => Math.sign(x!))).toEqual([1, 1, -1, -1]);
  });

  it("never recovers a cancelled take and removes its files", async () => {
    const s = spool();
    const id = await s.begin(16_000, 5);
    await s.append(id, second(0.5));
    await s.seal(id, "cancelled");
    expect(await spool().recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("removes a take older than a day without returning it, and keeps one just under a day", async () => {
    const day = 24 * 60 * 60 * 1000;
    const old = createSpool({ dir, now: () => 0, sleep: async () => undefined });
    const a = await old.begin(16_000, 0);
    await old.append(a, second(0.5));
    const b = await old.begin(16_000, 1);
    await old.append(b, second(0.5));
    const later = createSpool({ dir, now: () => day + 1, sleep: async () => undefined });
    expect((await later.recover()).map((t) => t.id)).toEqual([b]);
    expect(await files()).toEqual([`${b}.json`, `${b}.pcm`]);
    const gone = createSpool({ dir, now: () => day + 2, sleep: async () => undefined });
    expect(await gone.recover()).toEqual([]);
    expect(await files()).toEqual([]);
  });

  it("sweep removes aged and cancelled takes only, and reads no audio", async () => {
    const s = spool();
    const keep = await s.begin(16_000, 9_000);
    await s.append(keep, second(0.5));
    const cancelled = await s.begin(16_000, 9_001);
    await s.seal(cancelled, "cancelled");
    const aged = createSpool({ dir, now: () => 0 });
    await aged.begin(16_000, -100_000_000);
    await spool().sweep();
    expect(await files()).toEqual([`${keep}.json`, `${keep}.pcm`]);
    expect(JSON.parse(await readFile(path.join(dir, `${keep}.json`), "utf8")).tries).toBe(0);
  });

  it("clear removes every take", async () => {
    const s = spool();
    await s.append(await s.begin(16_000, 1), second(0.5));
    await s.begin(16_000, 2);
    await s.clear();
    expect(await files()).toEqual([]);
  });
});
