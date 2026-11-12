import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { RecorderCommand, RecorderResult } from "../../../shared/capture/contract";
import type { Notice } from "../../../shared/capture/notices";
import type { CaptureConfig } from "../../../shared/capture/settings";
import { createBundle } from "../bundle";
import type { CapturePlatform } from "../platform/types";
import type { RecorderHost } from "../recorder-host";
import { createStore, type CaptureRecord, type StoreFs } from "../store";
import { createReplay, replayWanted } from ".";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "replay-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const memory = (): StoreFs => {
  let text: string | undefined;
  return { read: async () => text, write: async (_f, t) => void (text = t) };
};

type Call = DistributiveOmit<RecorderCommand, "id">;
type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;

interface Options {
  start?: RecorderResult;
  save?: RecorderResult;
  noScreen?: boolean;
  sheet?: Buffer | undefined;
}

const CLIP = {
  ok: true,
  durationMs: 9000,
  clip: { videos: [Uint8Array.of(1, 1), Uint8Array.of(2, 2)], frames: [0, 3000, 6000, 9000].map((atMs) => ({ atMs, jpeg: Uint8Array.of(atMs / 1000) })), durationMs: 9000 },
} as const satisfies RecorderResult;

function setup(o: Options = {}) {
  const calls: Call[] = [];
  const events: string[] = [];
  const notices: Notice[] = [];
  const saved: { record: CaptureRecord; sheet: Buffer | undefined }[] = [];
  const logs: string[] = [];
  const host = {
    call: async (cmd: Call) => {
      calls.push(cmd);
      if (cmd.op === "replay-start") return o.start ?? { ok: true };
      if (cmd.op === "replay-save") return o.save ?? CLIP;
      return { ok: true };
    },
  } as unknown as RecorderHost;
  const platform = {
    os: "win32",
    displays: () => [
      { id: "1", name: "Left", bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 },
      { id: "2", name: "Right", bounds: { x: 1000, y: 0, width: 1000, height: 800 }, scaleFactor: 1 },
    ],
    resolve: async (t: { displayId: string }) => (o.noScreen ? undefined : { sourceId: `screen:${t.displayId}`, title: "Left" }),
  } as unknown as CapturePlatform;
  const bundle = createBundle(dir);
  const store = createStore(memory(), "index.json");
  let n = 0;
  const replay = createReplay({
    host: () => host,
    bundle: () => bundle,
    store: () => store,
    platform,
    hideOwnWindows: (on) => events.push(`hide:${on}`),
    sheet: async () => ("sheet" in o ? o.sheet : Buffer.from("sheet")),
    saved: (record, sheet) => saved.push({ record, sheet }),
    notify: (x) => notices.push(x),
    changed: () => events.push("changed"),
    now: () => 5000,
    newId: () => `r${++n}`,
    log: (l) => logs.push(l),
  });
  return { replay, calls, events, notices, saved, logs, store, bundle };
}

describe("replay buffer", () => {
  it("starts on the first screen, with this app's own windows kept out of it", async () => {
    const t = setup();
    expect(await t.replay.arm()).toBe(true);
    expect(t.calls).toEqual([{ op: "replay-start", sourceId: "screen:1", frameEveryMs: 1000, maxSide: 1280, segmentMs: 3000 }]);
    expect(t.events).toEqual(["hide:true", "changed"]);
    expect(t.replay.on).toBe(true);
    expect(await t.replay.arm()).toBe(true);
    expect(t.calls.length).toBe(1);
  });

  it("says so and stays off when the screen cannot be reached, and when the recorder cannot start", async () => {
    const noScreen = setup({ noScreen: true });
    expect(await noScreen.replay.arm()).toBe(false);
    expect([noScreen.replay.on, noScreen.notices.map((n) => n.code), noScreen.logs]).toEqual([false, ["failed"], ["capture replay: no picture of the screen"]]);
    const denied = setup({ start: { ok: false, code: "denied" } });
    expect(await denied.replay.arm()).toBe(false);
    expect(denied.notices.map((n) => n.code)).toEqual(["permission-denied"]);
    expect(denied.events).toEqual(["hide:true", "hide:false"]);
    const broken = setup({ start: { ok: false, code: "encoder" } });
    expect(await broken.replay.arm()).toBe(false);
    expect(broken.notices.map((n) => n.code)).toEqual(["failed"]);
  });

  it("saves the last 15 seconds as a capture with its pieces, pictures and contact sheet, and keeps recording", async () => {
    const t = setup();
    await t.replay.arm();
    const record = await t.replay.save();
    expect(record).toMatchObject({ id: "r1", kind: "recording", title: "Replay · Left", at: 5000, durationMs: 9000, media: "video.webm", sheet: "sheet.jpg", chips: ["saved", "copied"] });
    expect(record?.frames).toEqual([0, 3000, 6000, 9000].map((ms) => path.join("frames", `f-${String(ms).padStart(8, "0")}.jpg`)));
    expect([...(await readFile(path.join(dir, "r1", "video.webm")))]).toEqual([1, 1]);
    expect([...(await readFile(path.join(dir, "r1", "video-2.webm")))]).toEqual([2, 2]);
    expect((await t.store.get("r1"))?.bytes).toBeGreaterThan(0);
    expect(t.saved.map((s) => [s.record.id, s.sheet?.toString()])).toEqual([["r1", "sheet"]]);
    expect([t.replay.on, t.replay.saving]).toEqual([true, false]);
  });

  it("shows that it is saving while it saves", async () => {
    const t = setup();
    await t.replay.arm();
    const seen: boolean[] = [];
    const finished = t.replay.save();
    seen.push(t.replay.saving);
    await finished;
    expect([...seen, t.replay.saving]).toEqual([true, false]);
    expect(await t.replay.save()).toBeDefined();
  });

  it("does not save a second replay while one is being saved, and does nothing while it is off", async () => {
    const t = setup();
    expect(await t.replay.save()).toBeUndefined();
    await t.replay.arm();
    const [a, b] = await Promise.all([t.replay.save(), t.replay.save()]);
    expect([!!a, !!b]).toEqual([true, false]);
  });

  it("says nothing was recorded when the recorder has no clip", async () => {
    const t = setup({ save: { ok: false, code: "source" } });
    await t.replay.arm();
    expect(await t.replay.save()).toBeUndefined();
    expect(t.notices.map((n) => n.code)).toEqual(["nothing-recorded"]);
    expect(t.replay.saving).toBe(false);
  });

  it("goes without a contact sheet when it cannot be made", async () => {
    const t = setup({ sheet: undefined });
    await t.replay.arm();
    const record = await t.replay.save();
    expect(record?.sheet).toBeUndefined();
    expect(t.saved[0]!.sheet).toBeUndefined();
  });

  it("stops and lets the windows be recorded again when turned off", async () => {
    const t = setup();
    await t.replay.arm();
    await t.replay.disarm();
    expect(t.calls.map((c) => c.op)).toEqual(["replay-start", "replay-stop"]);
    expect(t.events.slice(-2)).toEqual(["hide:false", "changed"]);
    expect(t.replay.on).toBe(false);
    await t.replay.disarm();
    expect(t.calls.length).toBe(2);
  });
});

describe("when the replay buffer runs", () => {
  const config = (o: Partial<Pick<CaptureConfig, "enabled" | "replayBuffer" | "replayConsented">> & { replay?: boolean } = {}) => ({
    enabled: true,
    replayBuffer: true,
    replayConsented: true,
    experiments: { replay: true } as CaptureConfig["experiments"],
    ...o,
    ...(o.replay === false && { experiments: { replay: false } as CaptureConfig["experiments"] }),
  });
  it("needs capture on, the experiment, the person's choice and their consent, on a supported system", () => {
    expect(replayWanted(config(), true)).toBe(true);
    expect(replayWanted(config(), false)).toBe(false);
    expect(replayWanted(config({ enabled: false }), true)).toBe(false);
    expect(replayWanted(config({ replay: false }), true)).toBe(false);
    expect(replayWanted(config({ replayBuffer: false }), true)).toBe(false);
    expect(replayWanted(config({ replayConsented: false }), true)).toBe(false);
  });
});
