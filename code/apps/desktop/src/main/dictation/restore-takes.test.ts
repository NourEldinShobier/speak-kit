import { describe, expect, it } from "vite-plus/test";
import type { Clip, Dictation } from "@speakkit/dictation";
import { restoreTakes } from "./restore-takes";
import type { Recovered, Spool } from "./spool";
import type { SpooledRecorder } from "./spooled-recorder";

const take = (id: string): Recovered => ({ id, startedAt: 1, state: "pending", clip: { pcm: new Float32Array(1), sampleRate: 16_000, peak: 0.1 } });

describe("restoreTakes", () => {
  it("adopts each take and sends it to dictation in the order found", async () => {
    const log: string[] = [];
    const found = [take("a"), take("b")];
    const spool = { recover: async () => found } as unknown as Spool;
    const spooled = { adopt: (c: Clip, id: string) => log.push(`adopt:${id}:${found.find((f) => f.clip === c)?.id}`) } as unknown as SpooledRecorder;
    const core = { restore: (c: Clip) => log.push(`restore:${found.find((f) => f.clip === c)?.id}`) } as unknown as Dictation;
    expect(await restoreTakes(spool, spooled, core)).toBe(2);
    expect(log).toEqual(["adopt:a:a", "restore:a", "adopt:b:b", "restore:b"]);
  });

  it("does nothing when there is nothing left", async () => {
    const log: string[] = [];
    const spool = { recover: async () => [] } as unknown as Spool;
    const core = { restore: () => log.push("restore") } as unknown as Dictation;
    expect(await restoreTakes(spool, {} as SpooledRecorder, core)).toBe(0);
    expect(log).toEqual([]);
  });
});
