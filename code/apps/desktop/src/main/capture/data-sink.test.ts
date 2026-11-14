import { describe, expect, it } from "vitest";
import { createFence } from "./fence";
import { createDataSink } from "./data-sink";
import type { Bundle } from "./bundle";
import type { RecorderData } from "../../shared/capture/contract";

function setup(failures = 0, heard: Int16Array[] = [], lost: string[] = []) {
  const fence = createFence();
  const written: string[] = [];
  const logs: string[] = [];
  const bundle = {
    frame: async (id: string) => void written.push(`frame:${id}`),
    video: async (id: string) => void written.push(`video:${id}`),
    audio: async (id: string) => void written.push(`audio:${id}`),
  } as unknown as Bundle;
  let id: string | undefined = "c1";
  const sink = createDataSink({
    fence,
    writes: { failures, watch: (p) => void p },
    bundle: () => bundle,
    id: () => id,
    log: (l) => logs.push(l),
    audio: (c) => heard.push(c),
    lost: () => lost.push("lost"),
  });
  return { fence, sink, written, logs, setId: (v: string | undefined) => (id = v) };
}
const frame = (gen: number): RecorderData => ({ gen, kind: "frame", atMs: 0, jpeg: new Uint8Array(2) });

describe("recorder data sink", () => {
  it("passes on that the recorded screen went away, whatever recording it came from, and writes nothing", () => {
    const lost: string[] = [];
    const s = setup(0, [], lost);
    s.sink({ gen: 99, kind: "lost" });
    expect([lost, s.written, s.fence.refused]).toEqual([["lost"], [], 0]);
  });

  it("writes data of the open generation to the capture on now", async () => {
    const s = setup();
    s.fence.open();
    s.sink(frame(1));
    await Promise.resolve();
    expect(s.written).toEqual(["frame:c1"]);
  });

  it("refuses data of an earlier recording and logs once", () => {
    const s = setup();
    s.fence.open();
    s.fence.close();
    s.fence.open();
    s.sink(frame(1));
    s.sink(frame(1));
    expect(s.written).toEqual([]);
    expect(s.logs).toEqual(["capture: data of an earlier recording was refused"]);
    expect(s.fence.refused).toBe(2);
  });

  it("writes nothing when no capture is on or the disk refuses writes", () => {
    const a = setup();
    a.fence.open();
    a.setId(undefined);
    a.sink(frame(1));
    const b = setup(1);
    b.fence.open();
    b.sink(frame(1));
    expect(a.written).toEqual([]);
    expect(b.written).toEqual([]);
  });

  it("gives the microphone pieces of the open generation to the live narration, and no others", () => {
    const heard: Int16Array[] = [];
    const s = setup(0, heard);
    s.fence.open();
    s.sink({ gen: 1, kind: "audio", chunk: Int16Array.of(1, 2) });
    s.sink({ gen: 1, kind: "frame", atMs: 0, jpeg: new Uint8Array(1) });
    s.sink({ gen: 7, kind: "audio", chunk: Int16Array.of(9) });
    expect(heard.map((c) => [...c])).toEqual([[1, 2]]);
  });
});
