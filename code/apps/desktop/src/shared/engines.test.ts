import { describe, expect, it } from "vite-plus/test";
import type { EngineInfo, EngineState } from "@speakkit/protocol";
import { describeEngine, listFromHealth } from "./engines";

const engine = (state: EngineState, over: Partial<EngineInfo> = {}): EngineInfo => ({ id: "kokoro", name: "Kokoro-82M", state, optional: false, cloning: false, ...over });
const chatterbox = (state: EngineState, over: Partial<EngineInfo> = {}) => engine(state, { id: "chatterbox", name: "Chatterbox", optional: true, cloning: true, ...over });

describe("describeEngine", () => {
  it("unloaded: 0 MB, wakes on play, Load now (O2)", () => {
    expect(describeEngine(engine("unloaded"), true)).toEqual({
      pill: { label: "Unloaded", tone: "neutral", spinner: false },
      note: "Not in memory (0 MB). It loads when you press play.",
      progress: null,
      actions: ["load"],
    });
  });

  it("loading: spinner, no actions (O3)", () => {
    expect(describeEngine(engine("loading"), true)).toMatchObject({ pill: { label: "Loading", tone: "blue", spinner: true }, actions: [] });
  });

  it("ready and active has nothing to do; ready and not active can be used", () => {
    expect(describeEngine(engine("ready"), true).actions).toEqual([]);
    expect(describeEngine(chatterbox("ready"), false).actions).toEqual(["use", "remove"]);
  });

  it("downloading and installing show the percent and a bar", () => {
    expect(describeEngine(engine("downloading", { progress: 0.424 }), true)).toMatchObject({ pill: { label: "Download 42%" }, progress: 0.424 });
    expect(describeEngine(chatterbox("installing", { progress: 0.1, detail: "Creating the Python environment" }), false)).toMatchObject({ pill: { label: "Installing 10%" }, note: "Creating the Python environment" });
  });

  it("missing: the core engine downloads, an optional one installs", () => {
    expect(describeEngine(engine("missing"), true).actions).toEqual(["download"]);
    expect(describeEngine(chatterbox("missing"), false).actions).toEqual(["install"]);
  });

  it("unavailable names the reason and offers nothing", () => {
    expect(describeEngine(chatterbox("unavailable", { reason: "no-gpu" }), false)).toMatchObject({
      pill: { label: "Unavailable", tone: "orange" },
      note: "Needs a graphics card with enough memory; none was found.",
      actions: [],
    });
    expect(describeEngine(chatterbox("unavailable", { reason: "python-missing" }), false).note).toBe("Needs Python 3.10 or newer, which was not found.");
  });

  it("error offers retry, and removal for an optional engine", () => {
    expect(describeEngine(engine("error", { detail: "worker exited" }), true)).toMatchObject({ note: "worker exited", actions: ["retry"] });
    expect(describeEngine(chatterbox("error"), false).actions).toEqual(["retry", "remove"]);
  });
});

describe("listFromHealth", () => {
  it("builds a one-engine list for an older server", () => {
    const l = listFromHealth({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "ready" } });
    expect(l).toEqual({ active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro-82M", state: "ready", progress: undefined, detail: undefined, optional: false, cloning: false }] });
    expect(listFromHealth(null)).toBeNull();
  });
});
