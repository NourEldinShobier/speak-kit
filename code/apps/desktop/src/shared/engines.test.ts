import { describe, expect, it } from "vite-plus/test";
import type { EngineInfo, EngineState } from "@speakkit/protocol";
import { describeEngine, listFromHealth } from "./engines";

const engine = (state: EngineState, over: Partial<EngineInfo> = {}): EngineInfo => ({ id: "kokoro", name: "Kokoro-82M", state, optional: false, cloning: false, ...over });
const chatterbox = (state: EngineState, over: Partial<EngineInfo> = {}) => engine(state, { id: "chatterbox", name: "Chatterbox", optional: true, cloning: true, ...over });

describe("describeEngine", () => {
  it("unloaded: 0 MB, wakes on play, Load now", () => {
    expect(describeEngine(engine("unloaded"), true)).toEqual({
      pill: { label: "Unloaded", tone: "neutral", spinner: false },
      note: "Not in memory (0 MB). It loads when you press play.",
      progress: null,
      actions: ["load"],
    });
  });

  it("loading: spinner, no actions", () => {
    expect(describeEngine(engine("loading"), true)).toMatchObject({ pill: { label: "Loading", tone: "blue", spinner: true }, actions: [] });
  });

  it("ready and active has nothing to do; ready and not active can be used", () => {
    expect(describeEngine(engine("ready"), true).actions).toEqual([]);
    expect(describeEngine(chatterbox("ready"), false).actions).toEqual(["use", "remove"]);
  });

  it("downloading and installing show the percent and a bar", () => {
    expect(describeEngine(engine("downloading", { progress: 0.424 }), true)).toMatchObject({ pill: { label: "Download 42%" }, progress: 0.424 });
    expect(describeEngine(chatterbox("installing", { progress: 0.1, detail: "Creating the Python environment" }), false)).toMatchObject({
      pill: { label: "Installing 10%" },
      note: "Creating the Python environment",
    });
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
    expect(describeEngine(chatterbox("unavailable", { reason: "python-missing" }), false).note).toBe("Needs Python 3.10 to 3.12 or uv, and neither was found.");
  });

  it("error offers retry, and removal for an optional engine", () => {
    expect(describeEngine(engine("error", { detail: "worker exited" }), true)).toMatchObject({ note: "worker exited", actions: ["retry"] });
    expect(describeEngine(chatterbox("error"), false).actions).toEqual(["retry", "remove"]);
  });
});

describe("describeEngine for Chatterbox", () => {
  it("warming up says it is loading onto the GPU and offers nothing", () => {
    expect(describeEngine(chatterbox("loading"), true)).toEqual({
      pill: { label: "Warming up", tone: "blue", spinner: true },
      note: "Loading the model onto the GPU. This takes about 40 seconds the first time after each launch.",
      progress: null,
      actions: [],
    });
  });

  it("ready and in use, with nothing but removal", () => {
    expect(describeEngine(chatterbox("ready"), true)).toMatchObject({ pill: { label: "Ready", tone: "green" }, actions: ["remove"] });
  });

  it("out of GPU memory after a request keeps the raw text behind Details, and offers Kokoro and Retry", () => {
    const e = chatterbox("unloaded", { reason: "out-of-memory", detail: "OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB" });
    expect(describeEngine(e, true)).toEqual({
      pill: { label: "Out of GPU memory", tone: "red", spinner: false },
      note: "Chatterbox needs about 4 GB of free GPU memory and the graphics card ran out. Close programs that use it, then try again, or use Kokoro.",
      progress: null,
      details: "OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB",
      actions: ["fallback", "retry", "remove"],
    });
  });

  it("out of GPU memory while loading is the same screen; Kokoro is not offered when Chatterbox is not the engine in use", () => {
    const e = chatterbox("error", { reason: "out-of-memory", detail: "boom" });
    expect(describeEngine(e, true)).toMatchObject({ pill: { label: "Out of GPU memory" }, actions: ["fallback", "retry", "remove"] });
    expect(describeEngine(e, false).actions).toEqual(["retry", "remove"]);
  });

  it("installing offers Cancel", () => {
    expect(describeEngine(chatterbox("installing", { progress: 0.3 }), false).actions).toEqual(["cancel"]);
  });

  it("an install that ran out of disk says how much is needed and offers Install again", () => {
    const e = chatterbox("missing", { reason: "disk-full", detail: "Chatterbox needs 10 GB of free disk space and 3.2 GB is free." });
    expect(describeEngine(e, false)).toMatchObject({
      pill: { label: "Not enough disk space", tone: "orange" },
      note: "Chatterbox needs 10 GB of free disk space and 3.2 GB is free.",
      actions: ["install"],
    });
  });

  it("a failed install says nothing was kept, with the installer's words behind Details", () => {
    const e = chatterbox("missing", { reason: "not-installed", detail: "uv exited with 2: network unreachable" });
    expect(describeEngine(e, false)).toMatchObject({
      pill: { label: "Install failed", tone: "red" },
      note: "The install did not finish and left nothing behind. Check your connection and try again.",
      details: "uv exited with 2: network unreachable",
      actions: ["install"],
    });
  });

  it("an install that was cancelled looks like one that never started", () => {
    expect(describeEngine(chatterbox("missing", { reason: "not-installed" }), false)).toMatchObject({ pill: { label: "Not installed" }, note: "Not installed yet." });
  });
});

describe("listFromHealth", () => {
  it("builds a one-engine list for an older server", () => {
    const l = listFromHealth({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "ready" } });
    expect(l).toEqual({ active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro-82M", state: "ready", progress: undefined, detail: undefined, optional: false, cloning: false }] });
    expect(listFromHealth(null)).toBeNull();
  });
});
