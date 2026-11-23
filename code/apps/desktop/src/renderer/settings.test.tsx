import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown; document?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
  (globalThis as { document?: unknown }).document = { hidden: false };
});

import { loadLocale, LOCALES, setActiveLocale } from "../shared/i18n";
import { LocaleProvider } from "./i18n";
import { Settings } from "./settings";
import { SETTINGS_NAV } from "./routes";
import { SETTINGS_SUBS } from "../shared/ipc";

const page = (sub: Parameters<typeof Settings>[0]["sub"], config = {}) => renderToStaticMarkup(<Settings s={appState({ config: parseConfig({ setupDone: true, ...config }) })} sub={sub} />);

afterEach(() => setActiveLocale("en")); // a page in another language switches the language of text built outside a screen

// The rarely opened pages load on first use: rendering each one starts its load, and the pass repeats until every page shows its title.
beforeAll(async () => {
  await Promise.all(LOCALES.map(loadLocale));
  for (const sub of SETTINGS_SUBS) page(sub);
  await vi.waitFor(
    () => {
      for (const g of SETTINGS_NAV) for (const i of g.items) expect(page(i.id)).toContain("<h1>" + i.label + "</h1>");
    },
    { timeout: 30_000, interval: 50 },
  );
});

describe("settings navigation", () => {
  it("lists the 8 pages in three groups", () => {
    expect(SETTINGS_NAV.map((g) => [g.group, g.items.map((i) => i.label)])).toEqual([
      ["General", ["General", "Shortcuts", "Accessibility"]],
      ["Device", ["Storage", "Privacy"]],
      ["App", ["Browser integration", "What is new", "About"]],
    ]);
  });

  it("opens every page with its own title", () => {
    for (const g of SETTINGS_NAV) for (const i of g.items) expect(page(i.id)).toContain("<h1>" + i.label + "</h1>");
  });

  it("builds every settings page: none is a placeholder", () => {
    for (const sub of SETTINGS_SUBS) expect(page(sub)).not.toContain("Coming soon");
  });
});

describe("General in Spanish", () => {
  it("shows the page in the chosen language", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider choice="es">
        <Settings s={appState({ config: parseConfig({ setupDone: true, language: "es" }) })} sub="general" />
      </LocaleProvider>,
    );
    for (const text of ["Abrir al iniciar sesión", "Idioma"]) expect(html).toContain(text);
    expect(html).not.toContain("Launch at login");
  });
});

describe("General", () => {
  it("shows the startup and language settings, and nothing about the tray or closing the window", () => {
    const html = page("general");
    for (const text of ["Launch at login", "Language"]) expect(html).toContain(text);
    for (const text of ["Start minimized", "Closing the window", "Tray icon", "Show in folder", "Run setup again", "Import settings", "Advanced"]) expect(html).not.toContain(text);
    expect(html).not.toMatch(/clipboard|copy/i); // Speak Kit never reads the clipboard
  });
});

describe("Storage", () => {
  it("offers to delete the downloaded models", () => {
    const html = page("storage");
    expect(html).toContain("Delete downloaded models");
    expect(html).toContain("Your library and settings stay.");
    expect(html).not.toContain("Open folder");
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
  it("General has its two rows and no Advanced fold", () => {
    const html = pageWith("general");
    expect((html.match(/data-setting-row="general\/(launch|language)"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("advanced-general");
    expect(html).not.toContain("Theme");
  });

  it("Accessibility lists the keyboard map and has no motion setting", () => {
    const html = pageWith("accessibility");
    for (const t of ["Keyboard map", "Ctrl+K", "no full session with a screen reader"]) expect(html).toContain(t);
    expect(html).not.toContain("Reduce motion");
  });

  it("Privacy lists every network host and has no telemetry statement", () => {
    const html = pageWith("privacy");
    expect(html).not.toContain("Telemetry");
    for (const h of ["github.com", "huggingface.co", "api.openai.com", "127.0.0.1"]) expect(html).toContain(h);
  });

  it("About keeps the update channel without a switch for checking, and its Advanced fold starts closed with the folders and the live log", () => {
    const html = pageWith("about");
    expect(html).toContain("Update channel");
    expect(html).not.toContain("Check automatically");
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="advanced-about"/);
    expect(html).toContain('id="advanced-about" hidden=""');
    for (const row of ["about/models-folder", "about/log-folder", "about/log"]) expect(html).toContain(`data-setting-row="${row}"`);
    for (const text of ["Models folder", "Open models folder", "Open log folder", "Log (last lines)"]) expect(html).toContain(text);
    expect(html).toContain("3 settings");
  });

  it("About shows the version, the channel, release notes and the network table", () => {
    const html = pageWith("about");
    for (const t of ["Release notes", "Update channel", "Stable", "Report a security issue", "network-table"]) expect(html).toContain(t);
    expect(pageWith("about", { config: parseConfig({ setupDone: true, updateChannel: "early" }) })).toContain("Early builds come first");
  });

  it("a settings notice shows above the page and names the repaired fields", () => {
    const html = pageWith("general", { settingsNotice: { kind: "repaired", fields: ["appearance"] } });
    expect(html).toContain("Some settings were reset");
    expect(html).toContain("appearance");
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
