import { describe, expect, it } from "vite-plus/test";
import type { PreviewAudio } from "../../shared/ipc";
import type { ReaderState } from "../../shared/reader";
import { ReaderController } from "./controller";

const tick = () => new Promise((r) => setTimeout(r, 0));
const audio = (ms: number): PreviewAudio => ({ sampleRate: 1000, chunks: [new Int16Array(ms)] });

function setup(opts: { failOn?: string; textMs?: number } = {}) {
  const log: string[] = [];
  const states: ReaderState[] = [];
  const synthed: string[] = [];
  const c = new ReaderController({
    synth: async ({ text }, signal) => {
      synthed.push(text);
      await tick();
      if (signal.aborted) throw new Error("aborted");
      if (text === opts.failOn) throw new Error("engine-not-ready");
      return audio(opts.textMs ?? 2000);
    },
    voice: () => "af_heart",
    speed: () => 1,
    emit: (s) => states.push(s),
    player: {
      chunk: (epoch, index) => log.push(`chunk ${epoch}:${index}`),
      pause: () => log.push("pause"),
      resume: () => log.push("resume"),
      flush: () => log.push("flush"),
    },
  });
  return { c, log, states, synthed };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await tick();
};
const TEXT = "One is first. Two is second. Three is third. Four is fourth. Five is fifth. Six is sixth.";

describe("ReaderController", () => {
  it("prepares, then plays when the player reports the first sentence, synthesizing only a few ahead", async () => {
    const { c, synthed } = setup();
    expect(c.start(TEXT, "selection")).toBe(true);
    expect(c.state).toMatchObject({ status: "preparing", index: 0, total: 6, title: "One is first. Two is second. Three is third. Four is fourth…" });
    await flush();
    expect(synthed).toEqual(["One is first.", "Two is second.", "Three is third.", "Four is fourth."]);
    c.started(2, 0); // start() runs epoch 2: reset is 1, begin is 2
    expect(c.state).toMatchObject({ status: "playing", index: 0, next: "Two is second." });
    c.started(2, 1);
    await flush();
    expect(synthed.length).toBe(5);
  });

  it("pause and resume go to the player, and the state follows", async () => {
    const { c, log } = setup();
    c.start(TEXT, "text");
    await flush();
    c.started(2, 0);
    c.command({ type: "toggle" });
    expect(c.state.status).toBe("paused");
    c.command({ type: "toggle" });
    expect(c.state.status).toBe("playing");
    expect(log.filter((l) => l === "pause" || l === "resume")).toEqual(["pause", "resume"]);
  });

  it("finishes when the last sentence ends, and replay starts over", async () => {
    const { c, states } = setup();
    c.start("Only one sentence here.", "text");
    await flush();
    c.started(2, 0);
    c.done(2, 0);
    expect(c.state).toMatchObject({ status: "finished", index: 0, total: 1, elapsedMs: 2000, totalMs: 2000 });
    c.command({ type: "toggle" });
    expect(c.state.status).toBe("preparing");
    expect(states.at(-1)!.status).toBe("preparing");
  });

  it("step moves one sentence and drops queued audio; late callbacks of the old position are ignored", async () => {
    const { c, log } = setup();
    c.start(TEXT, "selection");
    await flush();
    c.started(2, 1);
    c.command({ type: "step", by: 1 });
    expect(log.at(-1)).toBe("flush");
    c.started(2, 5); // stale epoch
    expect(c.state.status).toBe("preparing");
    await flush();
    c.started(3, 2);
    expect(c.state).toMatchObject({ status: "playing", index: 2 });
  });

  it("skip of 10 seconds lands on the sentence that contains that moment", async () => {
    const { c } = setup({ textMs: 4000 });
    c.start(TEXT, "selection");
    await flush();
    c.started(2, 0);
    c.command({ type: "skip", ms: 10_000 });
    await flush();
    c.started(3, 2);
    expect(c.state.index).toBe(2);
    c.command({ type: "skip", ms: -10_000 });
    await flush();
    c.started(4, 0);
    expect(c.state.index).toBe(0);
  });

  it("an engine failure becomes an error state with the reason", async () => {
    const { c } = setup({ failOn: "Two is second." });
    c.start(TEXT, "selection");
    await flush();
    expect(c.state).toMatchObject({ status: "error", error: { code: "unexpected", args: { detail: "engine-not-ready" } } });
  });

  it("stop returns to idle and cancels synthesis", async () => {
    const { c } = setup();
    c.start(TEXT, "selection");
    c.command({ type: "stop" });
    await flush();
    expect(c.state.status).toBe("idle");
  });

  it("fail shows a message without a reading, and stop clears it", () => {
    const { c } = setup();
    c.fail({ code: "no-selection" });
    expect(c.state).toMatchObject({ status: "error", error: { code: "no-selection" }, total: 0 });
    c.command({ type: "stop" });
    expect(c.state.status).toBe("idle");
  });

  it("starting a new reading while one plays never announces idle, so the mini player does not flash", async () => {
    const { c, states } = setup();
    c.start(TEXT, "selection");
    await flush();
    const before = states.length;
    c.start("Another text to read.", "text");
    expect(states.slice(before).map((s) => s.status)).toEqual(["preparing"]);
    expect(c.state).toMatchObject({ source: "text", total: 1 });
  });

  it("text without letters starts nothing", () => {
    const { c } = setup();
    expect(c.start("  ... --- ", "text")).toBe(false);
    expect(c.state.status).toBe("idle");
  });
});
