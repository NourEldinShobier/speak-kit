import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { Settings, SETTINGS_NAV } from "./settings";

const page = (sub: Parameters<typeof Settings>[0]["sub"], config = {}) => renderToStaticMarkup(<Settings s={appState({ config: parseConfig({ setupDone: true, ...config }) })} sub={sub} />);

describe("settings navigation", () => {
  it("lists the pages in three groups", () => {
    expect(SETTINGS_NAV.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["General", ["general", "voice", "shortcuts", "notifications"]],
      ["Device", ["memory", "storage"]],
      ["App", ["browser", "about"]],
    ]);
  });
});

describe("General", () => {
  it("shows startup, appearance, tray and privacy settings", () => {
    const html = page("general");
    for (const text of ["Launch at login", "Start minimized to tray", "Language", "Closing the window", "Offer to read long text I copy"]) expect(html).toContain(text);
  });

  it("reflects the stored values: the clipboard prompt switch is on when configured", () => {
    expect(page("general", { clipboardPrompt: true })).toMatch(/aria-label="Clipboard prompt"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Clipboard prompt"/);
    expect(page("general", { clipboardPrompt: false })).not.toMatch(/aria-checked="true"[^>]*aria-label="Clipboard prompt"/);
  });
});

describe("Voice and playback", () => {
  it("shows the stored voice before the voice list has loaded", () => {
    expect(page("voice", { voice: "bf_emma" })).toContain("bf_emma");
  });
});

describe("Notifications", () => {
  it("has a toast, bell and sound switch for every event", () => {
    const html = page("notifications");
    for (const ev of ["Export finished", "Voice engine problem", "Update ready"])
      for (const ch of ["Toast", "Bell", "Sound"]) expect(html).toContain(`aria-label="${ev}: ${ch}"`);
  });

  it("shows the default for export finished: toast and bell on, sound off", () => {
    const html = page("notifications");
    expect(html).toMatch(/aria-label="Export finished: Toast"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Export finished: Toast"/);
    expect(html).toMatch(/aria-label="Export finished: Sound"[^>]*aria-checked="false"|aria-checked="false"[^>]*aria-label="Export finished: Sound"/);
  });
});
