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
    expect(labels(dictation(true)).slice(0, 7)).toEqual([
      "Open Speak Kit",
      "Dictation",
      "Hold Ctrl Alt Space to dictate",
      "Paste last dictation",
      "Pause all shortcuts",
      "Dictation history",
      "Dictation settings",
    ]);
  });

  it("shows Pause all shortcuts as a switch, and the paused state on the icon and in the tooltip", () => {
    const paused = { ...dictation(true), dictation: { enabled: true, hotkey: "ControlRight", paused: true } } as TrayContext;
    expect(trayMenuModel(paused).find((i) => i.type === "item" && i.action === "pause-shortcuts")).toMatchObject({ checked: true, enabled: true });
    expect(trayMenuModel(dictation(true)).find((i) => i.type === "item" && i.action === "pause-shortcuts")).toMatchObject({ checked: false });
    expect(trayIconState(paused)).toBe("paused");
    expect(trayTooltipFor(paused)).toBe("Speak Kit - Shortcuts paused");
    expect(trayTooltipFor(dictation(true))).not.toContain("paused");
  });

  it("names the hotkey with Mac key names on macOS", () => {
    const mac = ctx({ platform: "darwin", dictation: { enabled: true, hotkey: "MetaLeft+AltLeft+Space" } });
    expect(labels(mac)).toContain("Hold Option Command Space to dictate");
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

describe("tray menu, recorder", () => {
  const row = (phase: NonNullable<TrayContext["recorder"]>["phase"]) =>
    trayMenuModel(ctx({ recorder: { phase } })).find((i) => i.type === "item" && (i.action === "record-start" || i.action === "record-stop"));

  it("has no recorder row where the recorder is not offered", () => {
    expect(labels(ctx())).not.toContain("Record a conversation");
  });

  it("starts a recording when ready, stops it while recording", () => {
    expect(row("ready")).toEqual({ type: "item", action: "record-start", label: "Record a conversation", enabled: true });
    expect(row("recording")).toEqual({ type: "item", action: "record-stop", label: "Stop recording", enabled: true });
  });

  it("says Done for a moment after a transcript finishes and still starts a new recording", () => {
    expect(row("done")).toEqual({ type: "item", action: "record-start", label: "Done. Record a conversation", enabled: true });
  });

  it("waits, disabled, while it starts, saves and transcribes, so it never stays greyed once that is over", () => {
    expect(row("starting")).toMatchObject({ label: "Starting recording...", enabled: false });
    expect(row("saving")).toMatchObject({ label: "Saving recording...", enabled: false });
    expect(row("transcribing")).toMatchObject({ label: "Transcribing...", enabled: false });
    expect(row("ready")).toMatchObject({ enabled: true });
  });

  it("sits under Open Speak Kit, before the reading rows", () => {
    const all = labels(ctx({ recorder: { phase: "ready" }, reader: reader("playing") }));
    expect(all.indexOf("Record a conversation")).toBe(1);
    expect(all.indexOf("Pause")).toBeGreaterThan(1);
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

describe("tray menu, recent dictations", () => {
  const withRecent = (recent: string[]) => ctx({ dictation: { enabled: true, hotkey: "ControlRight", recent } });
  const sub = (c: TrayContext) => trayMenuModel(c).find((i) => i.type === "submenu");

  it("has no submenu until something was dictated", () => {
    expect(sub(withRecent([]))).toBeUndefined();
  });

  it("lists the last five, newest first, each copying its own entry", () => {
    const row = sub(withRecent(["a", "b", "c", "d", "e", "f"]));
    expect(row).toMatchObject({ label: "Copy recent dictation" });
    const items = (row as { items: { action: string; label: string }[] }).items;
    expect(items.map((i) => [i.action, i.label])).toEqual([
      ["dictation-copy-0", "a"],
      ["dictation-copy-1", "b"],
      ["dictation-copy-2", "c"],
      ["dictation-copy-3", "d"],
      ["dictation-copy-4", "e"],
    ]);
  });

  it("folds line breaks and cuts a long text with an ellipsis", () => {
    const items = (sub(withRecent(["one\n\n two", "x".repeat(60)])) as { items: { label: string }[] }).items;
    expect(items[0]!.label).toBe("one two");
    expect(items[1]!.label).toBe(`${"x".repeat(47)}…`);
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

describe("tray meeting row", () => {
  const meeting = (phase: NonNullable<TrayContext["meetings"]>["phase"], shortcut?: string) =>
    trayMenuModel(ctx({ meetings: { phase, ...(shortcut && { shortcut }) } })).filter((i) => i.type === "item" && /meeting/i.test(i.label));
  it("starts a meeting recording when ready, with the optional shortcut beside it", () => {
    expect(meeting("ready", "Ctrl+Alt+M")).toEqual([{ type: "item", action: "meeting-start", label: "Record a meeting", enabled: true, hint: "Ctrl+Alt+M" }]);
  });
  it("stops it while recording and waits, disabled, while it starts, saves and transcribes", () => {
    expect(meeting("recording")).toEqual([{ type: "item", action: "meeting-stop", label: "Stop meeting recording", enabled: true }]);
    expect(meeting("starting")).toEqual([{ type: "item", action: "meeting-start", label: "Starting meeting recording...", enabled: false }]);
    expect(meeting("saving")[0]).toMatchObject({ label: "Saving meeting...", enabled: false });
    expect(meeting("transcribing")[0]).toMatchObject({ label: "Transcribing meeting...", enabled: false });
  });
  it("has no meeting row when the feature is off", () => {
    expect(labels(ctx())).not.toContain("Record a meeting");
  });
});
