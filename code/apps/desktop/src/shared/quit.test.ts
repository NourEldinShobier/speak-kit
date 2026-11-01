import { describe, expect, it } from "vite-plus/test";
import type { AppState } from "./ipc";
import { IDLE_READER } from "./reader";
import { quitSummary } from "./quit";

const base = (over: Partial<AppState> = {}): AppState =>
  ({
    port: 47615,
    health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "unloaded" } },
    reader: IDLE_READER,
    exports: [],
    update: { kind: "idle", checkedAtMs: null },
    ...over,
  }) as AppState;
const job = (stage: "rendering" | "done") => ({ id: "x", name: "a.mp3", stage, progress: 0.2, done: 1, total: 5 });

describe("quitSummary", () => {
  it("idle: the tray reminder and only the server stops", () => {
    const q = quitSummary(base(), false);
    expect(q.lead).toBe("Closing the window keeps SpeakKit in the tray. Quitting stops:");
    expect(q.rows.map((r) => r[0])).toEqual(["Local server on 127.0.0.1:47615 stops"]);
  });

  it("names the reading and the exports that would stop", () => {
    const q = quitSummary(base({ reader: { ...IDLE_READER, status: "playing" }, exports: [job("rendering"), job("rendering"), job("done")] }), false);
    expect(q.lead).toBe("1 reading is playing and 2 exports are rendering. Quitting stops:");
    expect(q.rows.map((r) => r[0])).toEqual(["Local server on 127.0.0.1:47615 stops", "The reading in progress stops", "The exports are cancelled"]);
  });

  it("counts a preview in the app window as a reading, and a single export in the singular", () => {
    const q = quitSummary(base({ exports: [job("rendering")] }), true);
    expect(q.lead).toBe("1 reading is playing and 1 export is rendering. Quitting stops:");
  });

  it("mentions model download, model in memory and an update armed for quit", () => {
    const dl = quitSummary(base({ health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "downloading" } } }), false);
    expect(dl.rows.map((r) => r[0])).toContain("The model download pauses");
    const ready = quitSummary(base({ health: { app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "ready" } }, update: { kind: "ready", version: "0.2.0", onQuit: true } }), false);
    expect(ready.rows.map((r) => r[0])).toEqual(expect.arrayContaining(["The voice model leaves memory", "SpeakKit 0.2.0 installs"]));
  });
});
