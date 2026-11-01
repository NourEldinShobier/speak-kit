import { encodeFrame } from "@speakkit/protocol";
import { IDLE_CLOSE_MS } from "@speakkit/player";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// The player package imports the SoundTouch worklet, which extends this browser class when it loads.
vi.hoisted(() => {
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};
});

/** Records what the offscreen document asks of the browser, then loads it fresh as Chrome does when it opens the document. */
async function open() {
  const sent: { from?: string; kind?: string }[] = [];
  let listener!: (msg: unknown, sender: unknown, reply: (r: unknown) => void) => boolean;
  const contexts: { closed: boolean }[] = [];
  class Ctx {
    closed = false;
    currentTime = 0;
    destination = {};
    constructor() {
      contexts.push(this);
    }
    createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
    createBufferSource = () => ({ buffer: null, playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null });
    createGain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
    resume = async () => {};
    suspend = async () => {};
    close = async () => void (this.closed = true);
  }
  vi.stubGlobal("AudioContext", Ctx);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (m: { from?: string; kind?: string }) => void sent.push(m),
      onMessage: { addListener: (l: typeof listener) => (listener = l) },
    },
  });
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(encodeFrame({ type: "audio", index: 0, sampleRate: 24000, samples: 24000, durationMs: 1000 }, new Int16Array(24000)));
            c.enqueue(encodeFrame({ type: "done", count: 1 }));
            c.close();
          },
        }),
      ),
  );
  await import("./main");
  const cfg = { port: 47615, token: "tok", voice: "af_heart", speed: 1, pause: "none" as const };
  const send = (command: object) => listener({ to: "offscreen", command, cfg }, {}, () => {});
  return { sent, send, contexts };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("offscreen document lifecycle", () => {
  it("after playback stops it asks to be closed once idle, and holds no timer, interval or audio context by then", async () => {
    vi.useFakeTimers();
    const { sent, send, contexts } = await open();
    send({ cmd: "play", doc: { docId: "d", tabId: 1, url: "", title: "t", sentences: [{ text: "Hello there.", block: 0 }], startIndex: 0, source: "page" } });
    await vi.advanceTimersByTimeAsync(500);
    send({ cmd: "stop" });
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_MS);
    expect(sent.some((m) => m.kind === "idle")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every((c) => c.closed)).toBe(true);
  });
});
