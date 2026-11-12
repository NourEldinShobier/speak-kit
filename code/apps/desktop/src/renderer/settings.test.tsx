import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { Settings } from "./settings";
import { SETTINGS_NAV } from "./routes";

const page = (sub: Parameters<typeof Settings>[0]["sub"], config = {}) => renderToStaticMarkup(<Settings s={appState({ config: parseConfig({ setupDone: true, ...config }) })} sub={sub} />);

describe("settings navigation", () => {
  it("lists the 14 pages in four groups", () => {
    expect(SETTINGS_NAV.map((g) => [g.group, g.items.map((i) => i.label)])).toEqual([
      ["General", ["General", "Voice and playback", "Shortcuts", "Notifications", "Accessibility"]],
      ["Device", ["Performance", "Storage", "Privacy"]],
      ["Features", ["Meetings", "Automation", "Experiments"]],
      ["App", ["Browser integration", "Diagnostics", "About"]],
    ]);
  });

  it("opens every page with its own title", () => {
    for (const g of SETTINGS_NAV) for (const i of g.items.filter((x) => x.id !== "performance")) expect(page(i.id)).toContain("<h1>" + i.label + "</h1>");
  });

  it("shows a placeholder with an empty state for a page that is not built yet", () => {
    const html = page("privacy");
    expect(html).toContain("Coming soon");
    expect(html).toContain("What stays on this computer.");
  });
});

describe("Automation", () => {
  it("shows its title and a loading state before main has answered, never the placeholder", () => {
    const html = page("automation");
    expect(html).toContain("<h1>Automation</h1>");
    expect(html).toContain("lm-skeleton");
    expect(html).not.toContain("Coming soon");
  });
  it("warns when the local server is not running", () => {
    const html = renderToStaticMarkup(<Settings s={appState({ port: 0 })} sub="automation" />);
    expect(html).toContain("The local server is not running");
  });
});

describe("Experiments", () => {
  it("lists the everyday labs with a named switch and hides developer ones", () => {
    const html = page("experiments");
    expect(html).toContain('aria-label="Hide the tray icon"');
    expect(html).toContain('aria-label="Show developer experiments"');
    expect(html).not.toContain("Detailed log");
  });
  it("shows developer labs once asked, with their stored state", () => {
    const html = page("experiments", { showDeveloperLabs: true, labs: { "verbose-log": true } });
    expect(html).toMatch(/aria-label="Detailed log"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Detailed log"/);
  });
});

describe("General", () => {
  it("shows startup, appearance and tray settings", () => {
    const html = page("general");
    for (const text of ["Launch at login", "Start minimized to tray", "Language", "Closing the window"]) expect(html).toContain(text);
    expect(html).not.toMatch(/clipboard|copy/i); // Speak Kit never reads the clipboard
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
    for (const ev of ["Export finished", "Voice engine problem", "Update ready"]) for (const ch of ["Toast", "Bell", "Sound"]) expect(html).toContain(`aria-label="${ev}: ${ch}"`);
  });

  it("shows the default for export finished: toast and bell on, sound off", () => {
    const html = page("notifications");
    expect(html).toMatch(/aria-label="Export finished: Toast"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Export finished: Toast"/);
    expect(html).toMatch(/aria-label="Export finished: Sound"[^>]*aria-checked="false"|aria-checked="false"[^>]*aria-label="Export finished: Sound"/);
  });
});

describe("Storage", () => {
  it("offers to delete the downloaded models", () => {
    const html = page("storage");
    expect(html).toContain("Delete downloaded models");
    expect(html).toContain("Your library and settings stay.");
  });
});

describe("About", () => {
  it("tells a Mac user to delete the models before the Trash", () => {
    const html = renderToStaticMarkup(<Settings s={appState({ platform: "darwin" })} sub="about" />);
    expect(html).toContain("Before you drag Speak Kit to the Trash, use Settings &gt; Storage &gt; Delete downloaded models.");
  });

  it("says a Windows uninstall removes them", () => {
    expect(page("about")).toContain("Uninstalling Speak Kit removes the downloaded models.");
  });
});
