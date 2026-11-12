import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecorderData } from "../../../shared/capture/contract";
import { Run } from "./recorder-run";

interface FakeRecorder {
  mime: string;
  state: "recording" | "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | undefined;
  onstop: (() => void) | undefined;
}

const world = {
  now: 0,
  recorders: [] as FakeRecorder[],
  supported: new Set<string>(),
  failStart: new Set<string>(),
  videoWidth: 1920,
  videoHeight: 1080,
  trackStops: 0,
  /** Data the recorder hands over when it is stopped. */
  finalChunk: new Blob([new Uint8Array([9, 9, 9])]),
};

class FakeMediaRecorder implements FakeRecorder {
  static isTypeSupported = (m: string) => world.supported.has(m);
  state: "recording" | "inactive" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | undefined;
  onstop: (() => void) | undefined;
  readonly mime: string;
  constructor(_stream: unknown, o: { mimeType: string }) {
    this.mime = o.mimeType;
    if (world.failStart.has(o.mimeType)) throw new Error("not started");
    world.recorders.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: world.finalChunk });
    this.onstop?.();
  }
}

const fakeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({ drawImage: () => {} }),
  captureStream: () => ({}),
  toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array([1, 2])])),
});
const fakeVideo = () => ({
  muted: false,
  srcObject: null as unknown,
  play: async () => {},
  get videoWidth() {
    return world.videoWidth;
  },
  get videoHeight() {
    return world.videoHeight;
  },
});

beforeEach(() => {
  Object.assign(world, {
    now: 0,
    recorders: [],
    supported: new Set(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]),
    failStart: new Set(),
    videoWidth: 1920,
    videoHeight: 1080,
    trackStops: 0,
  });
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => world.now);
  vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? fakeCanvas() : fakeVideo()) });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => void world.trackStops++ }] }) } });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const setup = () => {
  const sent: RecorderData[] = [];
  return { sent, run: new Run(1280, (d) => void sent.push(d)) };
};

describe("recorder run: size and source", () => {
  it("scales the canvas to the size limit and keeps the aspect", async () => {
    const { run } = setup();
    await run.source("screen:0", undefined);
    expect([run.canvas.width, run.canvas.height]).toEqual([1280, 720]);
  });
  it("uses the area, not the whole source, for the size", async () => {
    const { run } = setup();
    await run.source("screen:0", { x: 10, y: 10, width: 400, height: 200 });
    expect([run.canvas.width, run.canvas.height]).toEqual([400, 200]);
  });
  it("says there are no frames when the source is empty", async () => {
    world.videoWidth = 0;
    const { run } = setup();
    await expect(run.source("screen:0", undefined)).rejects.toThrow("no frames from the source");
  });
});

describe("recorder run: timeline", () => {
  it("starts the clock when the picture starts, not when the run was made (opening the source can take seconds)", async () => {
    const { run, sent } = setup();
    world.now = 3200;
    await run.source("screen:0", undefined);
    run.startSegment(1000);
    expect(run.startedAt).toBe(3200);
    await vi.advanceTimersByTimeAsync(0);
    world.now = 4200;
    await vi.advanceTimersByTimeAsync(1000);
    const frames = sent.filter((d) => d.kind === "frame").map((d) => d.atMs);
    expect(frames[0]).toBe(0);
    expect(frames).toContain(1000);
  });
  it("keeps the clock of the first segment when a later one starts", async () => {
    const { run } = setup();
    await run.source("screen:0", undefined);
    world.now = 100;
    run.startSegment(1000);
    await run.endSegment();
    world.now = 9000;
    run.startSegment(1000);
    expect(run.startedAt).toBe(100);
    expect(run.segment).toBe(2);
  });
});

describe("recorder run: the last chunk", () => {
  it("is sent before the segment counts as ended", async () => {
    vi.useRealTimers();
    const { run, sent } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(60_000);
    await run.endSegment();
    expect(sent.filter((d) => d.kind === "video")).toEqual([{ kind: "video", segment: 1, chunk: new Uint8Array([9, 9, 9]) }]);
    run.stop();
  });
  it("sends nothing for an empty chunk", async () => {
    vi.useRealTimers();
    world.finalChunk = new Blob([]);
    const { run, sent } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(60_000);
    await run.endSegment();
    expect(sent.filter((d) => d.kind === "video")).toEqual([]);
    world.finalChunk = new Blob([new Uint8Array([9, 9, 9])]);
    run.stop();
  });
  it("ending twice is harmless", async () => {
    vi.useRealTimers();
    const { run } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(60_000);
    await run.endSegment();
    await expect(run.endSegment()).resolves.toBeUndefined();
    run.stop();
  });
});

describe("recorder run: encoder", () => {
  it("uses the hardware encoder when it starts", async () => {
    const { run } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(1000);
    expect(world.recorders.map((r) => r.mime)).toEqual(["video/webm;codecs=vp9"]);
    expect(run.softwareEncoder).toBe(false);
    run.stop();
  });
  it("falls back to the next encoder, in software, when one would not start", async () => {
    world.failStart.add("video/webm;codecs=vp9");
    const { run } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(1000);
    expect(world.recorders.map((r) => r.mime)).toEqual(["video/webm;codecs=vp8"]);
    expect(run.softwareEncoder).toBe(true);
    run.stop();
  });
  it("skips a type the browser does not know and says software when it had to", async () => {
    world.supported = new Set(["video/webm"]);
    const { run } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(1000);
    expect(world.recorders.map((r) => r.mime)).toEqual(["video/webm"]);
    expect(run.softwareEncoder).toBe(true);
    run.stop();
  });
  it("fails with the encoder message when none starts", async () => {
    world.supported = new Set();
    const { run } = setup();
    await run.source("screen:0", undefined);
    expect(() => run.startSegment(1000)).toThrow("encoder failed");
    run.stop();
  });
});

describe("recorder run: stop", () => {
  it("stops the stream, the timers and a running recorder", async () => {
    const { run, sent } = setup();
    await run.source("screen:0", undefined);
    run.startSegment(1000);
    await vi.advanceTimersByTimeAsync(0);
    run.stop();
    const before = sent.filter((d) => d.kind === "frame").length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.filter((d) => d.kind === "frame").length).toBe(before);
    expect(world.trackStops).toBe(1);
    expect(world.recorders[0]!.state).toBe("inactive");
  });
});
