import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Page, SettingsSub } from "../shared/ipc";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { Sidebar } from "./Sidebar";

const render = (page: Page, sub: SettingsSub = "general") =>
  renderToStaticMarkup(<Sidebar s={appState()} hidden={false} page={page} sub={sub} recent={[]} go={() => {}} onCloseSettings={() => {}} onOpenRecent={() => {}} onOpenExport={() => {}} />);

describe("sidebar", () => {
  it("shows the Menu title, groups, Recent and Settings in order, without New reading or Browser", () => {
    const html = render("home");
    const text = html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    const order = [
      "Menu",
      "Read",
      "Home",
      "Library",
      "Voice",
      "Voices",
      "Voice chat",
      "Engines",
      "Dictation",
      "Dictation",
      "Modes",
      "Vocabulary",
      "History",
      "Capture",
      "Capture",
      "Recent",
      "Settings",
    ];
    let at = -1;
    for (const w of order) {
      const i = text.indexOf(`|${w}|`, at + 1);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    expect(html).not.toContain("New reading");
    expect(html).not.toContain("Browser");
  });
  it("lists recent readings by title in place of the empty hint", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        s={appState()}
        hidden={false}
        page="home"
        sub="general"
        recent={[{ id: "d1", title: "Chapter 4 draft" }]}
        go={() => {}}
        onCloseSettings={() => {}}
        onOpenRecent={() => {}}
        onOpenExport={() => {}}
      />,
    );
    expect(html).toContain("Chapter 4 draft");
    expect(html).not.toContain("appear here");
    expect(render("home")).toContain("Readings you open appear here.");
  });
  it("has a Settings search field", () => {
    expect(render("settings")).toContain('aria-label="Search settings"');
  });
  it("marks only the open page", () => {
    expect(render("home").match(/aria-current="page"/g)).toHaveLength(1);
  });
  it("lists the 14 settings rows while in Settings, with one selected", () => {
    const html = render("settings", "privacy");
    expect(html.match(/href="#settings-/g)).toHaveLength(15);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("Close settings");
  });
});
