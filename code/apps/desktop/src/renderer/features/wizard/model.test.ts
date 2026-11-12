import { describe, expect, it } from "vite-plus/test";
import { appState } from "../../app-state.fixture";
import type { DesktopError } from "../../../shared/errors";
import { connectPhase, downloadSub, downloadView, initWizard, wizardReducer, type WizardAction } from "./model";

const run = (...actions: WizardAction[]) => actions.reduce(wizardReducer, initWizard());
const withEngine = (engine: object, serverError: DesktopError | null = null) =>
  appState({ health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", ...engine } } as never, serverError });

describe("wizardReducer", () => {
  it("starts on the welcome step and moves to the chosen step", () => {
    expect(initWizard()).toEqual({ step: 0, copied: false, skipped: false });
    expect(run({ type: "go", step: 2 }).step).toBe(2);
  });

  it("starts on the step it is given, so a closed window opens again where setup stopped", () => {
    expect(initWizard(2)).toEqual({ step: 2, copied: false, skipped: false });
  });

  it("remembers that the token was copied", () => {
    expect(run({ type: "go", step: 2 }, { type: "copied" })).toEqual({ step: 2, copied: true, skipped: false });
  });

  it("finishing the browser step goes to Done and records whether it was skipped", () => {
    expect(run({ type: "go", step: 2 }, { type: "finish-connect", skipped: true })).toEqual({ step: 4, copied: false, skipped: true });
    expect(run({ type: "finish-connect", skipped: true }, { type: "go", step: 2 }, { type: "finish-connect", skipped: false }).skipped).toBe(false);
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
