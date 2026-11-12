import { describe, expect, it } from "vite-plus/test";
import type { AudioStore } from "../src";
import { fakeStorage, rig } from "./fakes";

const never = () => new Promise<never>(() => undefined);

type Broken = { name: string; run(r: Awaited<ReturnType<typeof rig>>): void; extra?: Parameters<typeof rig>[2]; settings?: Parameters<typeof rig>[0]; storage?: ReturnType<typeof fakeStorage> };

const audio = (save: AudioStore["save"]): AudioStore => ({ save, load: async () => undefined, remove: async () => undefined, removeMany: async () => undefined }) as unknown as AudioStore;

// Every dependency that is not needed to produce the text: whichever one fails or hangs, the key still dictates and the text still arrives.
const BROKEN: Broken[] = [
  { name: "history save fails", run: () => undefined, storage: Object.assign(fakeStorage(), {}) },
  { name: "history save never answers", run: () => undefined },
  { name: "window read throws", run: (r) => void (r.ins.state.targetThrows = true) },
  { name: "window read never answers", run: (r) => void (r.ins.inserter.target = never) },
  { name: "recording store throws", run: () => undefined, settings: { keepReady: true, keepRecordings: true }, extra: { audio: audio(async () => Promise.reject(new Error("disk"))) } },
  { name: "recording store returns nothing", run: () => undefined, settings: { keepReady: true, keepRecordings: true }, extra: { audio: audio(async () => undefined) } },
  { name: "log sink throws", run: (r) => void (r.ins.inserter.target = never), extra: { log: () => { throw new Error("log closed"); } } },
  { name: "keep-clip sink throws", run: () => undefined, extra: { keepClip: () => { throw new Error("full"); } } },
];

describe("a failing optional dependency never stops the dictation", () => {
  for (const b of BROKEN) {
    it(b.name, async () => {
      const storage = b.storage ?? fakeStorage();
      if (b.name === "history save fails") storage.storage.save = () => Promise.reject(new Error("disk full"));
      if (b.name === "history save never answers") storage.storage.save = never;
      const r = await rig(b.settings ?? { keepReady: true }, storage, b.extra);
      b.run(r);
      await r.hold(1000);
      await r.time.advance(8000);
      expect(r.ins.inserted.map((i) => i.text)).toEqual(["Hello world "]);
      expect(r.dictation.state()).toMatchObject({ status: "idle" });
    });
  }

  it("the next dictation works after a stage ran out of time", async () => {
    const storage = fakeStorage();
    storage.storage.save = never;
    const r = await rig({ keepReady: true }, storage);
    await r.hold(1000);
    await r.time.advance(2600);
    storage.storage.save = async () => undefined;
    await r.hold(1000);
    await r.time.advance(2600);
    expect(r.ins.inserted).toHaveLength(2);
  });

  it("a history file that cannot be read at start leaves the hotkey working", async () => {
    const storage = fakeStorage();
    storage.state.failLoad = true;
    const r = await rig({ keepReady: true }, storage);
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.ins.inserted).toHaveLength(1);
  });
});
