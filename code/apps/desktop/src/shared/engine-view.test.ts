import { describe, expect, it } from "vite-plus/test";
import type { EngineState, Health } from "@speakkit/protocol";
import { engineView, trayState, trayTooltip } from "./engine-view";

const h = (state: EngineState, extra: object = {}): Health => ({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state, ...extra } });

describe("engine state to words and tray icon", () => {
  it("title bar pill text per state", () => {
    expect(engineView(h("unloaded"), null)).toMatchObject({ label: "Unloaded", hint: "Wakes on play", tone: "neutral" });
    expect(engineView(h("loading"), null)).toMatchObject({ label: "Loading", spinner: true });
    expect(engineView(h("ready"), null)).toMatchObject({ label: "Ready", tone: "green" });
    expect(engineView(h("downloading", { progress: 0.424 }), null).label).toBe("Download 42%");
    expect(engineView(h("missing"), null).tone).toBe("orange");
    expect(engineView(null, null).label).toBe("Starting");
    expect(engineView(null, "EADDRINUSE").label).toBe("Error");
  });
  it("tray icon variants", () => {
    const m: [Health | null, string | null, string][] = [
      [h("ready"), null, "normal"],
      [h("loading"), null, "working"],
      [h("downloading"), null, "working"],
      [h("unloaded"), null, "asleep"],
      [h("missing"), null, "asleep"],
      [h("error"), null, "error"],
      [h("ready"), "port busy", "error"],
      [null, null, "working"],
    ];
    for (const [health, err, want] of m) expect(trayState(health, err)).toBe(want);
  });
  it("tooltip names the state and the wake hint", () => {
    expect(trayTooltip(h("unloaded"), null)).toBe("Speak Kit - Unloaded (wakes on play)");
    expect(trayTooltip(h("ready"), null)).toBe("Speak Kit - Ready");
  });
});
