import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlayerState, ReadDoc, SentenceStart } from "@speakkit/protocol";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { FakeEngine, type FakeEngineOptions } from "../../engine/src/fake";
import { createServer, type SpeakKitServer } from "../../server/src/index";
import { Player, type CtxLike, type SourceLike } from "../src/player";

// Web Audio stand-in whose clock is the wall clock, so the player runs unmodified against a real server.
class ClockCtx implements CtxLike {
  private t0 = performance.now();
  destination = {};
  sources: { startedAt?: number; rate: number }[] = [];
  get currentTime() {
    return (performance.now() - this.t0) / 1000;
  }
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource(): SourceLike {
    const rec: { startedAt?: number; rate: number } = { rate: 1 };
    this.sources.push(rec);
    return {
      buffer: null,
      get playbackRate() {
        return {
          set value(v: number) {
            rec.rate = v;
          },
          get value() {
            return rec.rate;
          },
        };
      },
      connect() {},
      start(w: number) {
        rec.startedAt = w;
      },
      stop() {},
    } as SourceLike;
  }
  async resume() {}
  async suspend() {}
}

const running: SpeakKitServer[] = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.close();
});

async function setup(engineOpts: FakeEngineOptions = { secondsPerChar: 0.01 }, token?: string) {
  const engine = new FakeEngine(engineOpts);
  const server = createServer({
    engine,
    dataDir: mkdtempSync(join(tmpdir(), "speakkit-ext-")),
    port: 0,
    token,
  });
  await server.listen();
  running.push(server);
  const ctx = new ClockCtx();
  const states: PlayerState[] = [];
  const starts: SentenceStart[] = [];
  const player = new Player(
    {
      createContext: () => ctx,
      fetch: (i, init) => fetch(i, init),
      emitState: (s) => states.push(s),
      emitSentence: (s) => starts.push(s),
    },
    { port: server.port, token: server.token, voice: "af_heart", speed: 1, pause: "none" },
  );
  return { engine, server, ctx, player, states, starts };
}

const doc = (texts: string[]): ReadDoc => ({
  docId: "int",
  tabId: 3,
  url: "https://example.com",
  title: "Int",
  source: "page",
  startIndex: 0,
  sentences: texts.map((text, i) => ({ text, block: i })),
});

const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("player against a real server with FakeEngine", () => {
  it("streams every sentence, schedules them gaplessly and finishes", async () => {
    const { engine, player, ctx, starts } = await setup();
    const texts = ["Hello there.", "This is the second sentence.", "And a third."];
    player.command({ cmd: "play", doc: doc(texts) });
    await until(() => player.state().status === "finished");

    expect(engine.calls.map((c) => c.text)).toEqual(texts);
    expect(player.framesReceived).toBe(3);
    const expectedMs = texts.reduce(
      (s, t) => s + (FakeEngine.sampleCount(t, 1, 0.01) / 24000) * 1000,
      0,
    );
    expect(player.scheduledMs).toBeCloseTo(expectedMs, 3);
    expect(starts.map((s) => s.index)).toEqual([0, 1, 2]);
    // back to back: each source starts exactly when the previous one ends
    const dur = texts.map((t) => FakeEngine.sampleCount(t, 1, 0.01) / 24000);
    const st = ctx.sources.map((s) => s.startedAt!);
    expect(st[1]! - st[0]!).toBeCloseTo(dur[0]!, 6);
    expect(st[2]! - st[1]!).toBeCloseTo(dur[1]!, 6);
    expect(player.state()).toMatchObject({
      status: "finished",
      sentenceIndex: 2,
      sentenceCount: 3,
    });
  });

  it("reports token-rejected for a wrong token", async () => {
    const { player, server } = await setup();
    player.command(
      { cmd: "play", doc: doc(["Hi."]) },
      { port: server.port, token: "wrong", voice: "af_heart", speed: 1, pause: "none" },
    );
    await until(() => player.state().status === "error");
    expect(player.state().error?.code).toBe("token-rejected");
  });

  it("reports app-not-running when nothing listens on the port", async () => {
    const { player, server } = await setup();
    const { port, token } = server;
    await server.close();
    player.command(
      { cmd: "play", doc: doc(["Hi."]) },
      { port, token, voice: "af_heart", speed: 1, pause: "none" },
    );
    await until(() => player.state().status === "error");
    expect(player.state().error?.code).toBe("app-not-running");
  });

  it("reports engine-not-ready while the model is not loaded", async () => {
    const { player } = await setup({ state: "loading" });
    player.command({ cmd: "play", doc: doc(["Hi."]) });
    await until(() => player.state().status === "error");
    expect(player.state().error?.code).toBe("engine-not-ready");
  });

  it("seek re-requests from the target sentence and the old stream stops the engine", async () => {
    const { engine, player } = await setup({ secondsPerChar: 0.05, latencyMs: 40 });
    const texts = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} here.`);
    player.command({ cmd: "play", doc: doc(texts) });
    await until(() => player.framesReceived >= 1);
    player.command({ cmd: "seek-sentence", index: 9 });
    await until(() => engine.calls.some((c) => c.text === texts[9]));
    await until(() => player.state().sentenceIndex === 9 && player.framesReceived >= 1);
    expect(engine.calls.filter((c) => c.text === texts[9])).toHaveLength(1);
    await until(() => engine.active === 0);
    // nothing synthesized past the lookahead of the old stream (sentence 0 + 2 ahead + 1 in flight at most)
    expect(engine.calls.slice(0, -3).every((c) => texts.indexOf(c.text) < 6)).toBe(true);
    player.command({ cmd: "stop" });
  });

  it("above 2x the server runs at 2 and the player speeds playback up by speed / 2", async () => {
    const { engine, player, ctx } = await setup();
    player.command({ cmd: "set-speed", speed: 3 });
    player.command(
      { cmd: "play", doc: doc(["Fast sentence one.", "Fast sentence two."]) },
      {
        port: player.cfg.port,
        token: player.cfg.token,
        voice: "af_heart",
        speed: 3,
        pause: "none",
      },
    );
    await until(() => player.state().status === "finished");
    expect(engine.calls.every((c) => c.speed === 2)).toBe(true);
    expect(ctx.sources.every((s) => s.rate === 1.5)).toBe(true);
  });
});
