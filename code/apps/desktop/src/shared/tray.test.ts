import { describe, expect, it } from "vite-plus/test";
import type { EngineState, Health } from "@speakkit/protocol";
import { IDLE_READER, type ReaderState } from "./reader";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayContext } from "./tray";

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
