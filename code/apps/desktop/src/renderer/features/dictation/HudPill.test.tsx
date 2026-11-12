import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { HudView } from "../../../shared/dictation/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkitDictation: {} };
});

import { clock, Pill } from "./HudPill";

const html = (view: HudView) => renderToStaticMarkup(<Pill view={view} />);
const text = (view: HudView) =>
  html(view)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("HUD pill", () => {
  it("says Dictation ready with the hotkey", () => {
    expect(text({ kind: "ready", hotkey: "Ctrl Alt Space" })).toBe("Dictation ready Ctrl Alt Space");
  });

  it("shows eight level bars, a timer and the release hint while holding", () => {
    const h = html({ kind: "recording", locked: false, startedAt: Date.now() - 4000, level: 0.5, hotkey: "x" });
    expect(h.match(/<i style=/g)).toHaveLength(8);
    expect(h).toContain("hud__dot");
    expect(h).toContain("Release to finish");
    expect(h).toMatch(/0:0[34]/);
  });

  it("shows a lock and the stop hint when locked", () => {
    const h = html({ kind: "recording", locked: true, startedAt: Date.now(), level: 0, hotkey: "x" });
    expect(h).not.toContain("hud__dot");
    expect(h).toContain("Recording locked. Press x to finish.");
    expect(h).toContain("Cancel");
  });

  it("shows the cancel key instead of a button while a toggled recording runs", () => {
    const h = html({ kind: "recording", locked: true, startedAt: 0, level: 0, hotkey: "x", cancel: "Esc" });
    expect(h).toContain("Press the hotkey to stop, Esc cancels");
    expect(h).not.toContain(">Cancel<");
  });

  it("offers Undo on a cancelled notice", () => {
    expect(html({ kind: "notice", text: "Cancelled", action: { label: "Undo", id: "undo-cancel" } })).toContain("Undo");
  });

  it("makes every bar at least 3 px tall, even in silence", () => {
    const heights = [...html({ kind: "recording", locked: false, startedAt: 0, level: 0, hotkey: "x" }).matchAll(/block-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights).toHaveLength(8);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(3);
  });

  it("covers the short states", () => {
    expect(text({ kind: "transcribing" })).toBe("Transcribing");
    expect(text({ kind: "pasted" })).toBe("Sent");
    expect(text({ kind: "notice", text: "Cancelled" })).toBe("Cancelled");
    expect(text({ kind: "copied", reason: "clipboard" })).toBe("Copied Press Ctrl V to paste");
    expect(text({ kind: "copied", reason: "secure-input" })).toBe("Copied, a password field or Secure Keyboard Entry is on Press Ctrl V to paste");
    expect(text({ kind: "copied", reason: "elevated" })).toBe("Copied, this app needs admin rights to paste");
  });

  it("shows an error with its button, and without one when there is none", () => {
    const withAction = html({ kind: "error", text: "No microphone found", icon: "microphone-off", action: { label: "Sound settings", id: "sound-settings" } });
    expect(withAction).toContain("<button");
    expect(withAction).toContain("Sound settings");
    expect(html({ kind: "error", text: "Another app is using the microphone", icon: "microphone-off" })).not.toContain("<button");
  });

  it("marks the kind on the pill, for styling and tests", () => {
    expect(html({ kind: "pasted" })).toContain('data-kind="pasted"');
  });
});

describe("timer", () => {
  it("counts minutes and seconds", () => {
    expect([0, 999, 1000, 4000, 59_999, 60_000, 83_000, -5].map(clock)).toEqual(["0:00", "0:00", "0:01", "0:04", "0:59", "1:00", "1:23", "0:00"]);
  });
});

describe("pill stylesheet", () => {
  it("does not restyle the page: the app window imports the pill, so only the HUD entry may set html, body and #root", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("./hud.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/^(html|body|#root)\b/m);
    expect(readFileSync(new URL("./hud-main.tsx", import.meta.url), "utf8")).toContain('import "./hud-page.css"');
  });
});
