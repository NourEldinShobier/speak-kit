import { describe, expect, it } from "vite-plus/test";
import type { EngineInfo, EngineState } from "@speakkit/protocol";
import { describeEngine, listFromHealth } from "./engines";

const engine = (state: EngineState, over: Partial<EngineInfo> = {}): EngineInfo => ({ id: "kokoro", name: "Kokoro-82M", state, ...over });

describe("describeEngine", () => {
  it("unloaded: 0 MB, wakes on play, Load now", () => {
    expect(describeEngine(engine("unloaded"))).toEqual({
      pill: { label: "Unloaded", tone: "neutral", spinner: false },
      note: "Not in memory (0 MB). It loads when you press play.",
      progress: null,
      actions: ["load"],
    });
  });

  it("loading: spinner, no actions", () => {
    expect(describeEngine(engine("loading"))).toMatchObject({ pill: { label: "Loading", tone: "blue", spinner: true }, actions: [] });
  });

  it("ready has nothing to do", () => {
    expect(describeEngine(engine("ready")).actions).toEqual([]);
  });

  it("downloading shows the percent and a bar", () => {
    expect(describeEngine(engine("downloading", { progress: 0.424 }))).toMatchObject({ pill: { label: "Download 42%" }, progress: 0.424, actions: [] });
  });

  it("missing downloads the model", () => {
    expect(describeEngine(engine("missing"))).toMatchObject({ pill: { label: "Not installed", tone: "orange" }, actions: ["download"] });
  });

  it("error offers retry", () => {
    expect(describeEngine(engine("error", { detail: "worker exited" }))).toMatchObject({ note: "worker exited", actions: ["retry"] });
  });
});

describe("listFromHealth", () => {
  it("builds a one-engine list for an older server", () => {
    const l = listFromHealth({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "ready" } });
    expect(l).toEqual({ active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro-82M", state: "ready" }] });
    expect(listFromHealth(null)).toBeNull();
  });
});
