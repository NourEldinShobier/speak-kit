import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown; document?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
  (globalThis as { document?: unknown }).document = { hidden: false };
});

import { LocaleProvider } from "./i18n";
import { Settings } from "./settings";
import { SETTINGS_NAV } from "./routes";
import { SETTINGS_SUBS } from "../shared/ipc";

const page = (sub: Parameters<typeof Settings>[0]["sub"], config = {}) => renderToStaticMarkup(<Settings s={appState({ config: parseConfig({ setupDone: true, ...config }) })} sub={sub} />);

describe("settings navigation", () => {
  it("lists the 15 pages in four groups", () => {
    expect(SETTINGS_NAV.map((g) => [g.group, g.items.map((i) => i.label)])).toEqual([
      ["General", ["General", "Voice and playback", "Shortcuts", "Notifications", "Accessibility"]],
      ["Device", ["Performance", "Storage", "Privacy"]],
      ["Features", ["Meetings", "Automation", "Experiments"]],
      ["App", ["Browser integration", "Diagnostics", "What is new", "About"]],
    ]);
  });

  it("opens every page with its own title", () => {
    for (const g of SETTINGS_NAV) for (const i of g.items.filter((x) => x.id !== "performance")) expect(page(i.id)).toContain("<h1>" + i.label + "</h1>");
  });

  it("builds every settings page: none is a placeholder", () => {
    for (const sub of SETTINGS_SUBS) expect(page(sub)).not.toContain("Coming soon");
  });
});

describe("General in Spanish", () => {
  it("shows the page in the chosen language, with the import row in the folded part", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider choice="es">
        <Settings s={appState({ config: parseConfig({ setupDone: true, language: "es" }) })} sub="general" />
      </LocaleProvider>,
    );
    for (const text of ["Abrir al iniciar sesión", "Idioma", "Al cerrar la ventana", "Importar ajustes"]) expect(html).toContain(text);
    expect(html).not.toContain("Launch at login");
  });

  it("offers the import in English too", () => {
    expect(page("general")).toContain("Import settings");
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

const pageWith = (sub: Parameters<typeof Settings>[0]["sub"], over: Partial<Parameters<typeof appState>[0]> = {}) => renderToStaticMarkup(<Settings s={appState(over)} sub={sub} />);

describe("settings pages of the surface package", () => {
  it("General has five basic rows and an Advanced fold that starts closed", () => {
    const html = pageWith("general");
    expect((html.match(/data-setting-row="general\/(launch|minimized|language|close|tray)"/g) ?? []).length).toBe(5);
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="advanced-general"/);
    expect(html).toContain('id="advanced-general" hidden=""');
    expect(html).not.toContain("Theme");
  });

  it("the tray hint explains the way back when the tray icon is hidden", () => {
    const html = pageWith("general", { config: parseConfig({ setupDone: true, hideTrayIcon: true }) });
    expect(html).toContain("closing the window quits Speak Kit");
  });

  it("Accessibility lists reduce motion and the keyboard map", () => {
    const html = pageWith("accessibility");
    for (const t of ["Reduce motion", "Keyboard map", "Ctrl+K", "no full session with a screen reader"]) expect(html).toContain(t);
  });

  it("Privacy states there is no telemetry and lists every network host", () => {
    const html = pageWith("privacy");
    expect(html).toContain("sends no usage data");
    for (const h of ["github.com", "huggingface.co", "api.openai.com", "127.0.0.1"]) expect(html).toContain(h);
  });

  it("Experiments shows developer-only cards on a source build and hides them in an installed one", () => {
    const dev = pageWith("experiments", { packaged: false });
    expect(dev).toContain("Live dictation preview");
    expect(dev).toContain("Turn on");
    expect(dev).not.toContain("Turn off");
    const installed = pageWith("experiments", { packaged: true });
    expect(installed).toContain("Screenshots with a corner card");
    expect(installed).not.toContain("Live dictation preview");
  });

  it("Experiments shows a turned-on experiment as On with Turn off", () => {
    const html = pageWith("experiments", { packaged: false, config: parseConfig({ setupDone: true, experiments: { "caption-export": true } }) });
    expect(html).toContain("Turn off");
  });

  it("Diagnostics has Copy diagnostics, Open log folder and an empty activity log", () => {
    const html = pageWith("diagnostics");
    for (const t of ["Copy diagnostics", "Open log folder", "Nothing logged yet", "Run setup again"]) expect(html).toContain(t);
  });

  it("Diagnostics lists activity rows in plain words", () => {
    const html = pageWith("diagnostics", { activity: [{ id: 1, atMs: 1_700_000_000_000, kind: "error", title: "Engine stopped", body: "Restart it from the tray." }] });
    expect(html).toContain("Engine stopped");
    expect(html).toContain("Problem: Restart it from the tray.");
  });

  it("About shows the version, the channel, release notes and the network table", () => {
    const html = pageWith("about");
    for (const t of ["Release notes", "Update channel", "Stable", "Report a security issue", "network-table"]) expect(html).toContain(t);
    expect(pageWith("about", { config: parseConfig({ setupDone: true, updateChannel: "early" }) })).toContain("Early builds come first");
  });

  it("a settings notice shows above the page and names the repaired fields", () => {
    const html = pageWith("general", { settingsNotice: { kind: "repaired", fields: ["idleUnload"] } });
    expect(html).toContain("Some settings were reset");
    expect(html).toContain("idleUnload");
  });

  it("a newer settings file shows a warning", () => {
    const html = pageWith("general", { settingsNotice: { kind: "newer", version: 5 } });
    expect(html).toContain("newer version");
    expect(html).toContain("are not saved");
    expect(html).not.toContain("Dismiss");
  });

  it("a repaired-settings notice can still be dismissed", () => {
    expect(pageWith("general", { settingsNotice: { kind: "repaired", fields: ["speed"] } })).toContain("Dismiss");
  });
});

describe("What is new", () => {
  const withNotes = (version: string, appVersion: string) =>
    renderToStaticMarkup(
      <Settings s={appState({ version: appVersion, config: parseConfig({ setupDone: true, whatsNew: { version, notes: ["fix(tray): keep the menu open", "feat: new page"] } }) })} sub="whatsnew" />,
    );

  it("lists the kept notes of the running version", () => {
    const html = withNotes("0.4.0", "0.4.0");
    expect(html).toContain("fix(tray): keep the menu open");
    expect(html).toContain("feat: new page");
    expect(html).toContain("Speak Kit 0.4.0");
  });

  it("does not show the notes of another version, and offers the release page instead", () => {
    const html = withNotes("0.3.0", "0.4.0");
    expect(html).not.toContain("keep the menu open");
    expect(html).toContain("No notes kept for this version");
    expect(html).toContain("Open the release notes");
  });

  it("shows the empty state with nothing kept", () => {
    expect(page("whatsnew")).toContain("No notes kept for this version");
  });
});
