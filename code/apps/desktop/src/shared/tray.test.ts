import { describe, expect, it } from "vite-plus/test";
import type { EngineState, Health } from "@speakkit/protocol";
import { IDLE_READER, type ReaderState } from "./reader";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import { speechModelRows, trayIconState, trayMenuModel, trayTooltipFor, type TrayContext } from "./tray";

const health = (state: EngineState): Health => ({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state } });
const reader = (status: ReaderState["status"]): ReaderState => ({ ...IDLE_READER, status, title: "Chapter one", index: 2, total: 9, source: "selection" });
const ctx = (over: Partial<TrayContext> = {}): TrayContext => ({
  health: health("ready"),
  serverError: null,
  reader: IDLE_READER,
  update: { kind: "idle", checkedAtMs: null },
  exportsRunning: 0,
  doNotDisturb: false,
  shortcuts: DEFAULT_SHORTCUTS,
  ...over,
});
const labels = (c: TrayContext) => trayMenuModel(c).flatMap((i) => (i.type === "item" ? [i.label] : []));

describe("tray icon state", () => {
  it("maps engine, reading, export and update to one icon", () => {
    const cases: [Partial<TrayContext>, string][] = [
      [{}, "normal"],
      [{ health: health("unloaded") }, "asleep"],
      [{ health: health("loading") }, "working"],
      [{ health: health("error") }, "error"],
      [{ serverError: { code: "unexpected", args: { detail: "EADDRINUSE" } } }, "error"],
      [{ reader: reader("playing") }, "working"],
      [{ reader: reader("preparing") }, "working"],
      [{ reader: reader("paused") }, "paused"],
      [{ exportsRunning: 1 }, "working"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false } }, "attention"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false }, health: health("error") }, "error"],
      [{ update: { kind: "ready", version: "0.2.0", onQuit: false }, reader: reader("paused") }, "paused"],
    ];
    for (const [over, want] of cases) expect(trayIconState(ctx(over)), JSON.stringify(over)).toBe(want);
  });
});

describe("tray tooltip", () => {
  it("names what is happening, most specific first", () => {
    expect(trayTooltipFor(ctx({ reader: reader("playing") }))).toBe("Speak Kit - Reading 3 of 9: Chapter one");
    expect(trayTooltipFor(ctx({ reader: reader("paused") }))).toBe("Speak Kit - Paused: Chapter one");
    expect(trayTooltipFor(ctx({ exportsRunning: 2 }))).toBe("Speak Kit - Exporting 2 files");
    expect(trayTooltipFor(ctx({ update: { kind: "ready", version: "0.2.0", onQuit: false } }))).toBe("Speak Kit - Update 0.2.0 ready");
    expect(trayTooltipFor(ctx({ health: health("unloaded") }))).toBe("Speak Kit - Unloaded (wakes on play)");
  });
});

describe("tray menu, dictation", () => {
  const dictation = (enabled: boolean) => ctx({ dictation: { enabled, hotkey: "ControlLeft+AltLeft+Space" } });

  it("has no dictation rows where dictation cannot run", () => {
    expect(labels(ctx()).filter((l) => /dictat/i.test(l))).toEqual([]);
  });

  it("puts the switch, a hint with the hotkey, the history and the settings under Open Speak Kit", () => {
    expect(labels(dictation(true)).slice(0, 5)).toEqual(["Open Speak Kit", "Dictation", "Hold Ctrl Alt Space to dictate", "Dictation history", "Dictation settings"]);
  });

  it("shows the switch state, and leaves the hint out while dictation is off", () => {
    const row = (c: TrayContext) => trayMenuModel(c).find((i) => i.type === "item" && i.action === "dictation");
    expect(row(dictation(true))).toMatchObject({ checked: true, enabled: true });
    expect(row(dictation(false))).toMatchObject({ checked: false });
    expect(labels(dictation(false))).not.toContain("Hold Ctrl Alt Space to dictate");
  });

  it("the hint is not clickable", () => {
    const hint = trayMenuModel(dictation(true)).find((i) => i.type === "item" && i.label.startsWith("Hold "));
    expect(hint).toMatchObject({ enabled: false });
  });
});

describe("tray menu", () => {
  it("idle: short menu", () => {
    expect(labels(ctx())).toEqual(["Open Speak Kit", "Do not disturb", "Settings", "Check for updates", "Quit Speak Kit"]);
  });
  it("reading and paused swap in Pause or Resume and Stop", () => {
    expect(labels(ctx({ reader: reader("playing") }))).toContain("Pause");
    expect(labels(ctx({ reader: reader("paused") }))).toEqual(expect.arrayContaining(["Resume", "Stop"]));
    expect(labels(ctx({ reader: reader("paused") }))).not.toContain("Pause");
  });
  it("one row changes for asleep, engine error and update ready", () => {
    expect(labels(ctx({ health: health("unloaded") }))).toContain("Load the voice engine now");
    expect(labels(ctx({ health: health("error") }))).toContain("Restart the voice engine");
    const ready = labels(ctx({ update: { kind: "ready", version: "0.2.0", onQuit: false } }));
    expect(ready).toContain("Restart to update to 0.2.0");
    expect(ready).not.toContain("Check for updates");
  });
  it("Do not disturb shows its state; update check is disabled while checking or unsupported", () => {
    expect(trayMenuModel(ctx({ doNotDisturb: true })).find((i) => i.type === "item" && i.action === "dnd")).toMatchObject({ checked: true });
    const check = (u: TrayContext["update"]) => trayMenuModel(ctx({ update: u })).find((i) => i.type === "item" && i.action === "check-updates");
    expect(check({ kind: "checking" })).toMatchObject({ enabled: false, label: "Checking for updates..." });
    expect(check({ kind: "unsupported" })).toMatchObject({ enabled: false });
  });
});

describe("Speech model submenu", () => {
  const models = [
    { id: "large-v3-turbo-q5_0", name: "Whisper Large v3 Turbo", inUse: true },
    { id: "parakeet-tdt-0.6b-v3-q4_0", name: "Parakeet v3", inUse: false },
  ];
  const dictation = { enabled: true, hotkey: "ControlRight" };
  const submenu = (c: TrayContext) => trayMenuModel(c).find((i) => i.type === "models");

  it("lists the downloaded models with the one in use marked, and a way to get more", () => {
    expect(speechModelRows({ models, recording: false })).toEqual([
      { type: "model", id: "large-v3-turbo-q5_0", label: "Whisper Large v3 Turbo", checked: true, enabled: true },
      { type: "model", id: "parakeet-tdt-0.6b-v3-q4_0", label: "Parakeet v3", checked: false, enabled: true },
      { type: "action", action: "get-models", label: "Get more models in Engines" },
    ]);
  });

  it("while a model is checked the old one stays in use, the rows are locked and the switch can be cancelled", () => {
    const rows = speechModelRows({ models, recording: false, switching: { name: "Parakeet v3" } });
    expect(rows[0]).toEqual({ type: "header", label: "Parakeet v3 is checked before switching. The current model stays in use." });
    expect(rows.filter((r) => r.type === "model").every((r) => r.type === "model" && !r.enabled)).toBe(true);
    expect(rows).toContainEqual({ type: "action", action: "cancel-switch", label: "Cancel the switch" });
  });

  it("during a recording the rows are greyed and the header says to finish first", () => {
    const rows = speechModelRows({ models, recording: true });
    expect(rows[0]).toEqual({ type: "header", label: "Finish the recording first, then switch" });
    expect(rows.filter((r) => r.type === "model").every((r) => r.type === "model" && !r.enabled)).toBe(true);
    expect(rows.some((r) => r.type === "action" && r.action === "cancel-switch")).toBe(false);
  });

  it("the tray shows the submenu only where dictation runs and a model is downloaded", () => {
    expect(submenu(ctx({ dictation, speechModels: { models, recording: false } }))).toMatchObject({ type: "models", label: "Speech model" });
    expect(submenu(ctx({ speechModels: { models, recording: false } }))).toBeUndefined();
    expect(submenu(ctx({ dictation, speechModels: { models: [], recording: false } }))).toBeUndefined();
    expect(submenu(ctx({ dictation }))).toBeUndefined();
  });
});
