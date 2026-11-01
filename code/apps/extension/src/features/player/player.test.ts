import {
  encodeFrame,
  type PlayerState,
  type ReadDoc,
  type SentenceStart,
} from "@speakkit/protocol";
import { describe, expect, it } from "vite-plus/test";
import type { PlayerConfig } from "../../shared/internal";
import { IDLE_CLOSE_MS, Player, type CtxLike, type PlayerDeps, type SourceLike, type StretchNode } from "./player";

class MockSource implements SourceLike {
  buffer = null;
  playbackRate = { value: 1 };
  startedAt: number | undefined;
  stopped = false;
  connectedTo: unknown;
  disconnected = false;
  connect(n: unknown) {
    this.connectedTo = n;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(when: number) {
    this.startedAt = when;
  }
  stop() {
    this.stopped = true;
  }
}
class MockCtx implements CtxLike {
  currentTime = 0;
  destination = {};
  suspended = false;
  sources: MockSource[] = [];
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const s = new MockSource();
    this.sources.push(s);
    return s;
  }
  async resume() {
    this.suspended = false;
  }
  async suspend() {
    this.suspended = true;
  }
  closed = false;
  async close() {
    this.closed = true;
  }
}

const cfg = (o: Partial<PlayerConfig> = {}): PlayerConfig => ({
  port: 47615,
  token: "tok",
  voice: "af_heart",
  speed: 1,
  pause: "none",
  ...o,
});
const SEC = 24000; // samples per second of audio, 1000 ms per sentence in these tests

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { sentences: string[]; voice: string; speed: number };
  signal: AbortSignal;
}
type Reply = (call: Call) => Response | Promise<Response>;

const audioStream = (n: number, extra: Uint8Array[] = []) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < n; i++)
          c.enqueue(
            encodeFrame(
              { type: "audio", index: i, sampleRate: 24000, samples: SEC, durationMs: 1000 },
              new Int16Array(SEC),
            ),
          );
        for (const e of extra) c.enqueue(e);
        c.enqueue(encodeFrame({ type: "done", count: n }));
        c.close();
      },
    }),
  );

function rig(
  reply: Reply = (call) => audioStream(call.body.sentences.length),
  config = cfg(),
  analyser = false,
  extra: Partial<PlayerDeps> = {},
) {
  const ctx = new MockCtx();
  const calls: Call[] = [];
  const states: PlayerState[] = [];
  const sentences: SentenceStart[] = [];
  const player = new Player(
    {
      createContext: () => ctx,
      fetch: (async (url: string, init: RequestInit) => {
        const call: Call = {
          url,
          headers: init.headers as Record<string, string>,
          body: JSON.parse(init.body as string),
          signal: init.signal!,
        };
        calls.push(call);
        return reply(call);
      }) as unknown as typeof fetch,
      emitState: (s) => states.push(s),
      emitSentence: (s) => sentences.push(s),
      setInterval: () => 1, // ticks are driven by hand
      clearInterval: () => {},
      ...extra,
    },
    config,
    analyser,
  );
  return { ctx, calls, states, sentences, player };
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 2));
};
const advance = async (ctx: MockCtx, player: Player, t: number) => {
  ctx.currentTime = t;
  player.tick();
  await settle();
};

const doc = (texts: string[], o: Partial<ReadDoc> = {}, blocks?: number[]): ReadDoc => ({
  docId: "d1",
  tabId: 7,
  url: "https://example.com/a",
  title: "Example",
  source: "page",
  startIndex: 0,
  sentences: texts.map((text, i) => ({ text, block: blocks?.[i] ?? 0 })),
  ...o,
});

describe("start of playback", () => {
  it("requests /v1/speak with bearer token and moves preparing -> playing", async () => {
    const { player, calls, states } = rig();
    player.command({ cmd: "play", doc: doc(["One.", "Two.", "Three."], { startIndex: 1 }) });
    expect(states.at(-1)).toMatchObject({
      status: "preparing",
      sentenceIndex: 1,
      sentenceCount: 3,
      docId: "d1",
      tabId: 7,
    });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:47615/v1/speak");
    expect(calls[0]!.headers.Authorization).toBe("Bearer tok");
    expect(calls[0]!.body).toEqual({ sentences: ["Two.", "Three."], voice: "af_heart", speed: 1 });
    expect(player.state().status).toBe("playing");
  });

  it("reports app-not-running when the connection fails", async () => {
    const { player } = rig(() => {
      throw new TypeError("Failed to fetch");
    });
    player.command({ cmd: "play", doc: doc(["One."]) });
    await settle();
    expect(player.state()).toMatchObject({ status: "error", error: { code: "app-not-running" } });
  });

  it.each([
    [401, "token-rejected"],
    [503, "engine-not-ready"],
    [500, "synthesis-failed"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { player } = rig(() => new Response("", { status }));
    player.command({ cmd: "play", doc: doc(["One."]) });
    await settle();
    expect(player.state()).toMatchObject({ status: "error", error: { code } });
  });

  it("maps an error frame to its code", async () => {
    const { player } = rig(
      () =>
        new Response(
          encodeFrame({ type: "error", code: "engine-not-ready", message: "loading" }) as BodyInit,
        ),
    );
    player.command({ cmd: "play", doc: doc(["One."]) });
    await settle();
    expect(player.state()).toMatchObject({
      status: "error",
      error: { code: "engine-not-ready", message: "loading" },
    });
  });

  it("fails with token-rejected without any request when no token is paired", async () => {
    const { player, calls } = rig(undefined, cfg({ token: "" }));
    player.command({ cmd: "play", doc: doc(["One."]) });
    await settle();
    expect(calls).toHaveLength(0);
    expect(player.state().error?.code).toBe("token-rejected");
  });

  it("skips blank sentences in the request but keeps indices aligned", async () => {
    const { player, calls, ctx, sentences } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "  ", "B."]) });
    await settle();
    expect(calls[0]!.body.sentences).toEqual(["A.", "B."]);
    await advance(ctx, player, 0.05);
    await advance(ctx, player, 1.1);
    expect(sentences.map((s) => s.index)).toEqual([0, 2]);
  });
});

describe("gapless scheduling", () => {
  it("chains sources back to back and keeps at most 3 sentences scheduled ahead", async () => {
    const { player, ctx } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C.", "D.", "E.", "F."]) });
    await settle();
    expect(ctx.sources).toHaveLength(3); // nothing started yet: reader waits
    expect(ctx.sources.map((s) => s.startedAt)).toEqual([0.02, 1.02, 2.02]);
    await advance(ctx, player, 0.05); // A is heard, D may be read
    expect(ctx.sources.map((s) => s.startedAt)).toEqual([0.02, 1.02, 2.02, 3.02]);
    await advance(ctx, player, 1.05); // B heard, E read
    expect(ctx.sources.map((s) => s.startedAt)).toEqual([0.02, 1.02, 2.02, 3.02, 4.02]);
    expect(player.framesReceived).toBe(5);
    expect(player.scheduledMs).toBe(5000);
  });

  it("drops the decoded audio of sentences that have been heard", async () => {
    const { player, ctx } = rig(undefined, cfg(), false);
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C.", "D.", "E."]) });
    await settle();
    ctx.sources.forEach((s) => (s.buffer = {} as never)); // pretend each holds a buffer
    await advance(ctx, player, 1.05); // A ended (1.02), B playing
    expect(ctx.sources[0]!.buffer).toBeNull();
    expect(ctx.sources[0]!.disconnected).toBe(true);
    expect(ctx.sources[1]!.buffer).not.toBeNull();
  });

  it("plays above 2x with playbackRate = speed / 2 and shortens heard time", async () => {
    const { player, ctx, calls } = rig(undefined, cfg({ speed: 3 }));
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    expect(calls[0]!.body.speed).toBe(3);
    expect(ctx.sources.map((s) => s.playbackRate.value)).toEqual([1.5, 1.5]);
    expect(ctx.sources[1]!.startedAt).toBeCloseTo(0.02 + 1 / 1.5, 6);
  });

  it("keeps playbackRate at 1 up to 2x", async () => {
    const { player, ctx } = rig(undefined, cfg({ speed: 2 }));
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(ctx.sources[0]!.playbackRate.value).toBe(1);
  });

  it("inserts the paragraph pause only where the block changes", async () => {
    const { player, ctx } = rig(undefined, cfg({ pause: "short" }));
    player.command({ cmd: "play", doc: doc(["A.", "B."], {}, [0, 1]) });
    await settle();
    expect(ctx.sources[1]!.startedAt).toBeCloseTo(0.02 + 1 + 0.35, 6);
    const same = rig(undefined, cfg({ pause: "short" }));
    same.player.command({ cmd: "play", doc: doc(["A.", "B."], {}, [0, 0]) });
    await settle();
    expect(same.ctx.sources[1]!.startedAt).toBeCloseTo(1.02, 6);
  });

  it("emits SentenceStart when each sentence is reached, with raw duration and speed", async () => {
    const { player, ctx, sentences } = rig(undefined, cfg({ speed: 3 }));
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    await advance(ctx, player, 0.05);
    expect(sentences).toEqual([{ docId: "d1", index: 0, durationMs: 1000, speed: 3 }]);
    await advance(ctx, player, 0.8);
    expect(sentences.at(-1)).toEqual({ docId: "d1", index: 1, durationMs: 1000, speed: 3 });
  });

  it("finishes when the stream is done and the last sentence ended", async () => {
    const { player, ctx } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    await advance(ctx, player, 1.5);
    expect(player.state().status).toBe("playing");
    await advance(ctx, player, 2.1);
    expect(player.state()).toMatchObject({ status: "finished", elapsedMs: 2000, totalMs: 2000 });
  });

  it("exposes output level through the analyser when requested", async () => {
    const { player } = rig(undefined, undefined, true);
    expect(player.rms()).toBe(0); // no analyser on the mock context
  });
});

describe("transport", () => {
  it("pauses by suspending the context and resumes", async () => {
    const { player, ctx } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "pause" });
    expect(ctx.suspended).toBe(true);
    expect(player.state().status).toBe("paused");
    player.command({ cmd: "toggle" });
    expect(ctx.suspended).toBe(false);
    expect(player.state().status).toBe("playing");
  });

  it("a resume() that rejects because the context closed does not leak an unhandled rejection", async () => {
    const seen: unknown[] = [];
    const on = (e: unknown) => void seen.push(e);
    process.on("unhandledRejection", on);
    const { player, ctx } = rig();
    ctx.resume = () => Promise.reject(new Error("AudioContext closed before a pending resume() could complete."));
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "pause" });
    player.command({ cmd: "toggle" });
    player.command({ cmd: "stop" });
    await new Promise((r) => setTimeout(r, 20));
    process.off("unhandledRejection", on);
    expect(seen).toEqual([]);
  });

  it("stop aborts the request, silences sources and returns to idle", async () => {
    const { player, ctx, calls } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "stop" });
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    expect(player.state()).toMatchObject({ status: "idle", sentenceCount: 0, docId: undefined });
  });

  it("seek-sentence aborts and re-requests from the target sentence", async () => {
    const { player, calls, ctx } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C.", "D."]) });
    await settle();
    player.command({ cmd: "seek-sentence", index: 2 });
    await settle();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.body.sentences).toEqual(["C.", "D."]);
    expect(player.state().sentenceIndex).toBe(2);
    expect(ctx.sources.slice(0, 2).every((s) => s.stopped)).toBe(true);
  });

  it("seek-ms picks the sentence whose estimated start is nearest elapsed + delta", async () => {
    // never played, so durations are estimated: 30 chars at 15 chars/s = 2000 ms each
    const text = "x".repeat(30);
    const { player } = rig(() => new Promise<Response>(() => {}));
    player.command({ cmd: "play", doc: doc(Array.from({ length: 10 }, () => text)) });
    expect(player.state().totalMs).toBe(20000);
    player.command({ cmd: "seek-ms", deltaMs: 10000 });
    expect(player.state().sentenceIndex).toBe(5);
    player.command({ cmd: "seek-ms", deltaMs: -4000 });
    expect(player.state().sentenceIndex).toBe(3);
    player.command({ cmd: "seek-ms", deltaMs: -999999 });
    expect(player.state().sentenceIndex).toBe(0);
    player.command({ cmd: "seek-ms", deltaMs: 999999 });
    expect(player.state().sentenceIndex).toBe(9);
  });

  it("next-block and prev-block move between paragraphs", async () => {
    const { player } = rig(() => new Promise<Response>(() => {}));
    player.command({ cmd: "play", doc: doc(["a", "b", "c", "d", "e"], {}, [0, 0, 1, 1, 2]) });
    player.command({ cmd: "next-block" });
    expect(player.state().sentenceIndex).toBe(2);
    player.command({ cmd: "next-block" });
    expect(player.state().sentenceIndex).toBe(4);
    player.command({ cmd: "next-block" });
    expect(player.state().sentenceIndex).toBe(4); // last paragraph: stays
    player.command({ cmd: "prev-block" });
    expect(player.state().sentenceIndex).toBe(2);
    player.command({ cmd: "prev-block" });
    expect(player.state().sentenceIndex).toBe(0);
    player.command({ cmd: "prev-block" });
    expect(player.state().sentenceIndex).toBe(0);
  });

  it("set-speed re-requests from the sentence being heard, clamped to 0.5..3", async () => {
    const { player, calls, ctx } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C."]) });
    await settle();
    await advance(ctx, player, 1.1); // B is being heard
    expect(player.state().sentenceIndex).toBe(1);
    player.command({ cmd: "set-speed", speed: 2.5 });
    await settle();
    expect(calls.at(-1)!.body).toEqual({ sentences: ["B.", "C."], voice: "af_heart", speed: 2.5 });
    expect(player.state().speed).toBe(2.5);
    player.command({ cmd: "set-speed", speed: 9 });
    expect(player.state().speed).toBe(3);
  });

  it("set-voice re-requests with the new voice", async () => {
    const { player, calls } = rig();
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "set-voice", voice: "bm_george" });
    await settle();
    expect(calls.at(-1)!.body.voice).toBe("bm_george");
    expect(player.state().voice).toBe("bm_george");
  });

  it("applies speed while idle without any request", () => {
    const { player, calls } = rig();
    player.command({ cmd: "set-speed", speed: 1.7 });
    expect(player.state().speed).toBe(1.7);
    expect(calls).toHaveLength(0);
  });
});

describe("queue", () => {
  it("queue-add starts playing when idle, otherwise appends; finished plays the next", async () => {
    const { player, ctx, calls } = rig();
    player.command({ cmd: "queue-add", doc: doc(["A."], { docId: "q1" }) });
    await settle();
    expect(player.state()).toMatchObject({ docId: "q1", queueLength: 0 });
    player.command({ cmd: "queue-add", doc: doc(["B."], { docId: "q2" }) });
    player.command({ cmd: "queue-add", doc: doc(["B."], { docId: "q2" }) }); // duplicate ignored
    expect(player.state().queueLength).toBe(1);
    expect(player.queueItems()).toEqual([
      { docId: "q2", tabId: 7, title: "Example", url: "https://example.com/a", sentenceCount: 1, estMs: 133 },
    ]);
    await advance(ctx, player, 1.5);
    expect(player.state()).toMatchObject({ docId: "q2", queueLength: 0 });
    await settle();
    expect(calls.map((c) => c.body.sentences[0])).toEqual(["A.", "B."]);
  });

  it("queue-play jumps to an entry, queue-remove and queue-clear drop entries", async () => {
    const { player } = rig(() => new Promise<Response>(() => {}));
    player.command({ cmd: "play", doc: doc(["A."], { docId: "p" }) });
    for (const id of ["a", "b", "c"])
      player.command({ cmd: "queue-add", doc: doc(["x"], { docId: id }) });
    expect(player.state().queueLength).toBe(3);
    player.command({ cmd: "queue-remove", docId: "b" });
    expect(player.queueItems().map((q) => q.docId)).toEqual(["a", "c"]);
    player.command({ cmd: "queue-play", docId: "c" });
    expect(player.state()).toMatchObject({ docId: "c", queueLength: 1 });
    player.command({ cmd: "queue-clear" });
    expect(player.state().queueLength).toBe(0);
  });
});

describe("model lifecycle", () => {
  const holds: number[] = [];
  const lifecycle = () => {
    holds.length = 0;
    return { hold: (ms: number) => void holds.push(ms) };
  };

  it("asks the app to hold the model while paused and releases it on resume", async () => {
    const { player, ctx } = rig(undefined, cfg(), false, lifecycle());
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "pause" });
    expect(holds).toEqual([600000]);
    expect(ctx.suspended).toBe(true);
    player.command({ cmd: "resume" });
    expect(holds).toEqual([600000, 0]);
    expect(ctx.suspended).toBe(false);
  });

  it("releases the hold when playback is stopped while paused", async () => {
    const { player } = rig(undefined, cfg(), false, lifecycle());
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    player.command({ cmd: "pause" });
    player.command({ cmd: "stop" });
    expect(holds).toEqual([600000, 0]);
  });

  it("closes the AudioContext when playback stops and creates a new one for the next play", async () => {
    const contexts: MockCtx[] = [];
    const { player } = rig(undefined, cfg(), false, { createContext: () => { const c = new MockCtx(); contexts.push(c); return c; } });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.closed).toBe(false);
    player.command({ cmd: "stop" });
    expect(contexts[0]!.closed).toBe(true);
    expect(player.audioClock().state).toBe("none");
    player.command({ cmd: "play", doc: doc(["B."]) });
    await settle();
    expect(contexts).toHaveLength(2);
  });

  it("closes the AudioContext when the document has been read to the end", async () => {
    const contexts: MockCtx[] = [];
    const { player } = rig(undefined, cfg(), false, { createContext: () => { const c = new MockCtx(); contexts.push(c); return c; } });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    await advance(contexts[0]!, player, 5);
    expect(player.state().status).toBe("finished");
    expect(contexts[0]!.closed).toBe(true);
  });

  it("reports idle 60 s after stop, but not while something is queued", async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    let idle = 0;
    const { player } = rig(undefined, cfg(), false, {
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
      clearTimeout: () => {},
      onIdle: () => idle++,
    });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    player.command({ cmd: "stop" });
    expect(timers.at(-1)!.ms).toBe(IDLE_CLOSE_MS);
    expect(IDLE_CLOSE_MS).toBe(60_000);
    timers.at(-1)!.fn();
    expect(idle).toBe(1);

    // a queued document keeps the player alive
    const second = rig(undefined, cfg(), false, { setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {}, onIdle: () => idle++ });
    second.player.autoPlay = false;
    second.player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    second.player.command({ cmd: "queue-add", doc: doc(["Q."], { docId: "q" }) });
    second.player.command({ cmd: "stop" });
    const before = idle;
    timers.at(-1)!.fn();
    expect(idle).toBe(before);
  });

  it("sends X-SpeakKit-Replace on a re-request after a seek, speed change or voice change, not on the first request", async () => {
    const { player, calls } = rig(() => new Response(new ReadableStream<Uint8Array>({ start() {} })), cfg(), false); // a stream that is still open
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C."]) });
    await settle();
    expect(calls[0]!.headers["X-SpeakKit-Replace"]).toBeUndefined();
    player.command({ cmd: "seek-sentence", index: 2 });
    await settle();
    expect(calls[1]!.headers["X-SpeakKit-Replace"]).toBe("1");
  });

  it("waits while the model loads instead of failing, then plays", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const { player, calls, ctx } = rig(
      (call) => (n++ < 2 ? new Response("loading", { status: 503 }) : audioStream(call.body.sentences.length)),
      cfg(),
      false,
      { engineState: async () => "loading", sleep: async (ms) => void sleeps.push(ms) },
    );
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 1000]);
    expect(player.state().status).toBe("playing");
    expect(ctx.sources).toHaveLength(2);
  });

  it("treats an unloaded model as waking up, not as an error", async () => {
    let n = 0;
    const { player } = rig(
      (call) => (n++ < 1 ? new Response("", { status: 503 }) : audioStream(call.body.sentences.length)),
      cfg(),
      false,
      { engineState: async () => "unloaded", sleep: async () => {} },
    );
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(player.state().status).toBe("playing");
  });

  it("fails with engine-not-ready when the model is missing", async () => {
    const { player } = rig(() => new Response("", { status: 503 }), cfg(), false, { engineState: async () => "missing", sleep: async () => {} });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(player.state()).toMatchObject({ status: "error", error: { code: "engine-not-ready" } });
  });

  it("maps 429 to busy and 400 to invalid-request", async () => {
    expect((await runError(429)).error?.code).toBe("busy");
    expect((await runError(400)).error?.code).toBe("invalid-request");
  });

  async function runError(status: number) {
    const { player } = rig(() => new Response("", { status }));
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    return player.state();
  }
});

describe("speeds above 2x (pitch-preserving stretch)", () => {
  const stretch = () => {
    const created: { rates: number[]; connectedTo: unknown; disconnected: boolean; input: object }[] = [];
    const registered: unknown[] = [];
    return {
      created,
      registered,
      deps: {
        register: async (c: unknown) => void registered.push(c),
        create: (): StretchNode => {
          const rec = { rates: [] as number[], connectedTo: undefined as unknown, disconnected: false, input: {} };
          created.push(rec);
          return { input: rec.input, connect: (n) => void (rec.connectedTo = n), disconnect: () => void (rec.disconnected = true), setRate: (r) => void rec.rates.push(r) };
        },
      },
    };
  };

  it("routes sources through the stretch node at 3x and tells it the rate", async () => {
    const st = stretch();
    const { player, ctx } = rig(undefined, cfg({ speed: 3 }), false, { stretch: st.deps });
    player.command({ cmd: "play", doc: doc(["A.", "B."]) });
    await settle();
    expect(st.registered).toHaveLength(1);
    expect(st.created).toHaveLength(1);
    expect(st.created[0]!.connectedTo).toBe(ctx.destination);
    expect(ctx.sources.map((s) => s.playbackRate.value)).toEqual([1.5, 1.5]);
    expect(ctx.sources.every((s) => s.connectedTo === st.created[0]!.input)).toBe(true); // the AudioNode itself, not a wrapper
    expect(st.created[0]!.rates).toEqual([1.5, 1.5]);
  });

  it("does not load the worklet at or below 2x", async () => {
    const st = stretch();
    const { player, ctx } = rig(undefined, cfg({ speed: 2 }), false, { stretch: st.deps });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(st.registered).toHaveLength(0);
    expect(ctx.sources[0]!.connectedTo).toBe(ctx.destination);
  });

  it("falls back to plain playbackRate when the worklet cannot be loaded", async () => {
    const { player, ctx } = rig(undefined, cfg({ speed: 3 }), false, { stretch: { register: async () => { throw new Error("blocked"); }, create: () => { throw new Error("unreachable"); } } });
    player.command({ cmd: "play", doc: doc(["A."]) });
    await settle();
    expect(player.state().status).toBe("playing");
    expect(ctx.sources[0]!.connectedTo).toBe(ctx.destination);
    expect(ctx.sources[0]!.playbackRate.value).toBe(1.5);
  });

  it("loads the worklet once per context, even across speed changes", async () => {
    const st = stretch();
    const { player } = rig(undefined, cfg({ speed: 3 }), false, { stretch: st.deps });
    player.command({ cmd: "play", doc: doc(["A.", "B.", "C."]) });
    await settle();
    player.command({ cmd: "set-speed", speed: 2.6 });
    await settle();
    expect(st.registered).toHaveLength(1);
  });
});
