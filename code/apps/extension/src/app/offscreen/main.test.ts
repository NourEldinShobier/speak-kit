import { encodeFrame } from "@speakkit/protocol";
import { IDLE_CLOSE_MS } from "@speakkit/player";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const voice = vi.hoisted(() => ({ onVoice: vi.fn(), endVoice: vi.fn() }));
vi.mock("./voice", () => voice);

// The player package imports the SoundTouch worklet, which extends this browser class when it loads.
vi.hoisted(() => {
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};
});

/** Records what the offscreen document asks of the browser, then loads it fresh as Chrome does when it opens the document. */
async function open(search = "") {
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
  const pageListeners: Record<string, () => void> = {};
  vi.stubGlobal("addEventListener", (type: string, fn: () => void) => void (pageListeners[type] = fn));
  vi.stubGlobal("AudioContext", Ctx);
  vi.stubGlobal("location", { search });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "ext-id",
      getURL: (path: string) => `chrome-extension://ext-id/${path}`,
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
  const worker = { id: "ext-id", url: "chrome-extension://ext-id/background.js" };
  const send = (command: object, sender: object = worker) => listener({ to: "offscreen", command, cfg }, sender, () => {});
  const ask = (query: string, sender: object = worker) => {
    let answer: unknown = "no answer";
    listener({ to: "offscreen", query }, sender, (r) => (answer = r));
    return answer;
  };
  return { sent, send, contexts, pageListeners, ask, listener };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("who may command the document", () => {
  const doc = { docId: "d", tabId: 1, url: "", title: "t", sentences: [{ text: "Hello there.", block: 0 }], startIndex: 0, source: "page" };
  const contentScript = { id: "ext-id", url: "https://evil.example/", tab: { id: 7 } };

  it("answers the service worker and ignores a content script, another extension and a page of the extension that is not the worker", async () => {
    const { send, ask, sent } = await open();
    expect(ask("state", contentScript)).toBe("no answer");
    expect(ask("state", { id: "other-ext", url: "chrome-extension://other-ext/background.js" })).toBe("no answer");
    expect(ask("state", { id: "ext-id", url: "chrome-extension://ext-id/options.html" })).toBe("no answer");
    expect(ask("state", {})).toBe("no answer");
    expect(ask("state")).toMatchObject({ status: "idle" });
    send({ cmd: "play", doc }, contentScript);
    expect(sent.some((m) => m.kind === "state" && (m as { state?: { status?: string } }).state?.status === "preparing")).toBe(false);
  });

  it("takes voice commands from the worker, and the microphone's answer also from the permission page", async () => {
    const { listener } = await open("?voice");
    const start = { to: "offscreen", voice: { t: "end" }, tabId: 1, sid: 1 };
    const mic = { to: "offscreen", voice: { t: "mic", ok: true }, tabId: 0, sid: 1 };
    const micPage = { id: "ext-id", url: "chrome-extension://ext-id/mic.html?sid=1", tab: { id: 9 } }; // a popup window is a tab
    const called = async (msg: object, sender: object) => {
      voice.onVoice.mockClear();
      listener(msg, sender, () => {});
      await new Promise((r) => setTimeout(r, 0));
      return voice.onVoice.mock.calls.length;
    };
    expect(await called(start, { id: "ext-id", url: "chrome-extension://ext-id/background.js" })).toBe(1);
    expect(await called(mic, { id: "ext-id", url: "chrome-extension://ext-id/background.js" })).toBe(1);
    expect(await called(mic, micPage)).toBe(1);
    expect(await called(start, micPage)).toBe(0); // the permission page may answer, not command
    expect(await called(mic, contentScript)).toBe(0);
    expect(await called(start, contentScript)).toBe(0);
    expect(await called(mic, { id: "ext-id", url: "https://evil.example/mic.html", tab: { id: 3 } })).toBe(0);
  });
});

describe("offscreen document lifecycle", () => {
  it("the player's document announces its state and answers queries; a conversation's document (?voice) does neither, so a paused read-aloud stays paused", async () => {
    const player = await open();
    expect(player.sent.map((m) => m.kind)).toEqual(["state"]);
    expect(player.ask("state")).toMatchObject({ status: "idle" });
    vi.resetModules();
    const voice = await open("?voice");
    expect(voice.sent).toEqual([]);
    expect(voice.ask("state")).toBe("no answer");
  });

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

  it("releases the audio context and the timers when the document closes in the middle of playback", async () => {
    vi.useFakeTimers();
    const { send, contexts, pageListeners } = await open();
    send({ cmd: "play", doc: { docId: "d", tabId: 1, url: "", title: "t", sentences: [{ text: "Hello there.", block: 0 }], startIndex: 0, source: "page" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(contexts.some((c) => !c.closed)).toBe(true);
    pageListeners.pagehide?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(contexts.every((c) => c.closed)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
