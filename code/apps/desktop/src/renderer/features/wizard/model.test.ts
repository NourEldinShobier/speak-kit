import { describe, expect, it } from "vite-plus/test";
import { appState } from "../../app-state.fixture";
import type { DesktopError } from "../../../shared/errors";
import type { EngineInfo, EngineList } from "@speakkit/protocol";
import { chatterboxOffer, connectPhase, downloadSub, downloadView, initWizard, wizardReducer, type WizardAction } from "./model";

const run = (...actions: WizardAction[]) => actions.reduce(wizardReducer, initWizard());
const withEngine = (engine: object, serverError: DesktopError | null = null) =>
  appState({ health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", ...engine } } as never, serverError });

describe("wizardReducer", () => {
  it("starts on the welcome step and moves to the chosen step", () => {
    expect(initWizard()).toEqual({ step: 0, copied: false, skipped: false, engine: "kokoro" });
    expect(run({ type: "go", step: 2 }).step).toBe(2);
  });

  it("remembers that the token was copied", () => {
    expect(run({ type: "go", step: 3 }, { type: "copied" })).toEqual({ step: 3, copied: true, skipped: false, engine: "kokoro" });
  });

  it("finishing the browser step goes to Done and records whether it was skipped", () => {
    expect(run({ type: "go", step: 3 }, { type: "finish-connect", skipped: true })).toEqual({ step: 4, copied: false, skipped: true, engine: "kokoro" });
    expect(run({ type: "finish-connect", skipped: true }, { type: "go", step: 3 }, { type: "finish-connect", skipped: false }).skipped).toBe(false);
  });

  it("records the engine choice and keeps it through the later steps", () => {
    const s = run({ type: "choose-engine", engine: "chatterbox" }, { type: "go", step: 3 }, { type: "finish-connect", skipped: false });
    expect(s).toEqual({ step: 4, copied: false, skipped: false, engine: "chatterbox" });
    expect(run({ type: "choose-engine", engine: "chatterbox" }, { type: "choose-engine", engine: "kokoro" }).engine).toBe("kokoro");
  });
});

describe("chatterboxOffer", () => {
  const cb = (over: Partial<EngineInfo>): EngineList => ({
    active: "kokoro",
    engines: [{ id: "chatterbox", name: "Chatterbox", state: "missing", reason: "not-installed", optional: true, cloning: true, ...over }],
  });
  const gpu = { name: "NVIDIA GeForce RTX 4080 Laptop GPU", vramMb: 12282 };

  it("is not selectable while the computer is still being checked", () => {
    expect(chatterboxOffer(undefined)).toEqual({ selectable: false, note: "Checking this computer." });
  });

  it("is selectable when the probe says it can be installed, and names the card", () => {
    expect(chatterboxOffer(cb({ gpu }))).toEqual({ selectable: true, note: "Installs in the background after setup. About 2.4 GB. Found NVIDIA GeForce RTX 4080 Laptop GPU, 12 GB." });
  });

  it("is selectable when it is already installed", () => {
    expect(chatterboxOffer(cb({ state: "unloaded", gpu }))).toMatchObject({ selectable: true, note: "Already installed on this computer." });
  });

  it("is disabled with the real reason when there is no NVIDIA card", () => {
    expect(chatterboxOffer(cb({ state: "unavailable", reason: "no-gpu" }))).toEqual({ selectable: false, note: "No NVIDIA graphics card was found. Chatterbox needs one with 4 GB or more." });
  });

  it("is disabled with the card's memory when the card is too small", () => {
    expect(chatterboxOffer(cb({ state: "unavailable", reason: "no-gpu", gpu: { name: "GeForce GT 1030", vramMb: 2048 } }))).toEqual({
      selectable: false,
      note: "GeForce GT 1030 has 2 GB. Chatterbox needs 4 GB or more.",
    });
  });

  it("is disabled when neither Python 3.10 to 3.12 nor uv is installed", () => {
    expect(chatterboxOffer(cb({ state: "unavailable", reason: "python-missing", gpu }))).toEqual({
      selectable: false,
      note: "Installing it needs Python 3.10 to 3.12 or uv, and neither was found.",
    });
  });

  it("is disabled when the voice server has no Chatterbox", () => {
    expect(chatterboxOffer(null)).toEqual({ selectable: false, note: "This computer cannot run it." });
    expect(chatterboxOffer({ active: "kokoro", engines: [] })).toEqual({ selectable: false, note: "This computer cannot run it." });
  });
});

describe("downloadView", () => {
  it("is downloading with the reported progress, clamped to 0..1", () => {
    const v = downloadView(withEngine({ state: "downloading", progress: 0.4 }));
    expect(v).toEqual({ phase: "downloading", pct: 0.4, detail: "" });
    expect(downloadView(withEngine({ state: "downloading", progress: 7 })).pct).toBe(1);
    expect(downloadView(appState()).pct).toBe(0);
  });

  it("is ready when the engine is ready or idle, at 100%", () => {
    expect(downloadView(withEngine({ state: "ready" }))).toMatchObject({ phase: "ready", pct: 1 });
    expect(downloadView(withEngine({ state: "unloaded", progress: 0.2 })).phase).toBe("ready");
  });

  it("failed wins: an engine error or a server error, with the detail", () => {
    expect(downloadView(withEngine({ state: "error", detail: "ECONNRESET", progress: 0.5 }))).toEqual({ phase: "failed", pct: 0.5, detail: "ECONNRESET" });
    expect(downloadView(withEngine({ state: "ready" }, { code: "unexpected", args: { detail: "port busy" } }))).toMatchObject({ phase: "failed", detail: "port busy" });
  });

  it("words each phase", () => {
    expect(downloadSub({ phase: "failed", pct: 0.456, detail: "" })).toBe("The download stopped at 46%. Everything downloaded so far is kept.");
    expect(downloadSub({ phase: "ready", pct: 1, detail: "" })).toBe("Everything is on this computer. Speak Kit works fully offline.");
    expect(downloadSub({ phase: "downloading", pct: 0.1, detail: "" })).toBe("One time only. After this, Speak Kit works fully offline.");
  });
});

describe("connectPhase", () => {
  it.each([
    [null, null, "idle"],
    [1000, null, "waiting"],
    [1000, 999, "waiting"],
    [1000, 1000, "connected"],
    [1000, 5000, "connected"],
  ] as const)("test started %s, last call %s is %s", (start, seen, phase) => {
    expect(connectPhase(start, seen)).toBe(phase);
  });
});
