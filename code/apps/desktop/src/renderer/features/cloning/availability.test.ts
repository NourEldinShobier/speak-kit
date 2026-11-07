import { describe, expect, it } from "vite-plus/test";
import type { EngineInfo, EngineList } from "@speakkit/protocol";
import { cloningAvailability } from "./availability";

const kokoro: EngineInfo = { id: "kokoro", name: "Kokoro", state: "ready", optional: false, cloning: false };
const list = (cb: Partial<EngineInfo>, active: EngineList["active"] = "kokoro"): EngineList => ({ active, engines: [kokoro, { id: "chatterbox", name: "Chatterbox", state: "missing", optional: true, cloning: true, ...cb }] });

describe("cloningAvailability", () => {
  it("waits for the engine list, and promises nothing when the server has no engine that clones", () => {
    expect(cloningAvailability(null)).toEqual({ kind: "unknown" });
    expect(cloningAvailability({ active: "kokoro", engines: [kokoro] })).toEqual({ kind: "unknown" });
  });

  it.each(["unloaded", "loading", "ready", "downloading", "error"] as const)("is ready when Chatterbox is installed and %s, even while Kokoro is in use", (state) => {
    expect(cloningAvailability(list({ state }))).toEqual({ kind: "ready" });
  });

  it("asks to install Chatterbox and names the graphics card found", () => {
    expect(cloningAvailability(list({ reason: "not-installed", gpu: { name: "NVIDIA GeForce RTX 4080 Laptop GPU", vramMb: 12282 } }))).toEqual({
      kind: "unavailable",
      title: "Cloning needs Chatterbox (2.4 GB)",
      detail: "Install it on the Engines page. Found NVIDIA GeForce RTX 4080 Laptop GPU with 12 GB of video memory.",
    });
  });

  it("says why Chatterbox cannot run here", () => {
    expect(cloningAvailability(list({ state: "unavailable", reason: "no-gpu", detail: "Chatterbox needs an NVIDIA GPU." }))).toMatchObject({ detail: "Chatterbox needs an NVIDIA GPU." });
    expect(cloningAvailability(list({ state: "unavailable", reason: "python-missing" }))).toMatchObject({ detail: "Chatterbox needs Python 3.10 to 3.12 or uv, and neither was found." });
  });

  it("says when the disk is too full and when an install is running", () => {
    expect(cloningAvailability(list({ reason: "disk-full", detail: "4.1 GB free; 10 GB are needed." }))).toMatchObject({ detail: "4.1 GB free; 10 GB are needed." });
    expect(cloningAvailability(list({ state: "installing" }))).toEqual({ kind: "unavailable", title: "Chatterbox is installing", detail: "Cloning is available when the install finishes." });
  });
});
