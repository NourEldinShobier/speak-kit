import type { ElectronApplication, Page } from "@playwright/test";
import { GROUPS, S, builtPath, type Scenario } from "./scenarios";
import { DONE, home, settings, type Opts } from "./desktop";
import { sleep } from "./support";

// The desktop screens that came after the shell: library, reader, export, tray panel, mini player and the remaining settings pages.
// Design ids follow the design set (E library, F reader, J export, I system, H settings).

const LIB = GROUPS.library;
const RD = GROUPS.readerApp;
const SY = GROUPS.system;
const ST = GROUPS.settings;

const TEXT = [
  "# Why local-first matters",
  "Local-first software keeps your data on your own computer. It works without a network, and it keeps working when a service shuts down.",
  "# How speech models got small",
  "A few years ago a natural voice needed a server farm. Today an eighty million parameter model speaks faster than you can read.",
  "# What comes next",
  "Voices will run on every laptop. The only thing left to decide is which one you like to hear.",
].join("\n\n");

declare global {
  interface Window {
    speakkitLibrary: import("../../apps/desktop/src/shared/library/contract").LibraryBridge;
  }
}

const docs: [string, string][] = [
  ["local-first.md", TEXT],
  ["Speech models.txt", "How small speech models got good. A short history of text to speech.\n\nFrom concatenative synthesis to neural voices."],
  ["Meeting notes.txt", "Notes from the Tuesday meeting. We agreed to ship the reader first.\n\nThe export dialog follows."],
];

const toLibrary = async (p: Page) => {
  await p.getByRole("link", { name: "Library" }).click();
  await p.getByRole("heading", { name: "Library" }).waitFor();
};
/** Fills the library through the preload bridge; the list reads once when the page opens, so leave and come back. */
const libraryWith = async (p: Page) => {
  await p.evaluate(async (list) => {
    for (const [name, text] of list) await window.speakkitLibrary.importBytes(name, new TextEncoder().encode(text));
  }, docs);
  await p.getByRole("link", { name: "Home" }).click();
  await toLibrary(p);
  await p.getByRole("button", { name: "Open Why local-first matters" }).waitFor();
};
const openReader = async (p: Page) => {
  await libraryWith(p);
  await p.getByRole("button", { name: "Open Why local-first matters" }).click();
  await p.getByTestId("reader").waitFor();
};
const status = (p: Page, s: string) => p.waitForFunction((v) => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === v, s);
const play = async (p: Page) => {
  await p.getByRole("button", { name: "Play", exact: true }).click();
  await status(p, "playing");
};
const search = (q: string) => async (p: Page) => {
  await libraryWith(p);
  await p.getByLabel("Search title, source or text").fill(q);
  await sleep(500);
};

const slow = { SPEAKKIT_FAKE_LATENCY_MS: "250" };
const lib = (id: string, state: string, title: string, o: Opts) => home(id, state, LIB, title, o);
const reader = (id: string, state: string, title: string, drive: NonNullable<Opts["drive"]>) => home(id, state, RD, title, { env: slow, drive });

const hook = (app: ElectronApplication, fn: string, ...a: unknown[]) => app.evaluate((_, [f, args]) => (globalThis as any).__speakkit[f as string](...(args as unknown[])), [fn, a] as const);
const READ = "One short sentence here. A second sentence follows it. And a third to finish the paragraph.";

/** The mini player and the tray panel are windows of their own: capture the window, not the main page. */
const windowShot = (id: string, state: string, title: string, part: string, testId: string, open: (app: ElectronApplication) => Promise<void>): Scenario =>
  S(
    id,
    state,
    SY,
    title,
    async (c) => {
      const { launch } = await import("../../apps/desktop/tests/harness");
      const l = await launch({ env: { SPEAKKIT_TEST: "1", ...slow }, config: { ...DONE, theme: c.dark ? "dark" : "light" } });
      try {
        await l.page.getByRole("heading", { name: "Home" }).waitFor();
        const win = l.app.waitForEvent("window", { predicate: (w) => w.url().includes(part), timeout: 15_000 });
        await open(l.app);
        const w = await win;
        await w.emulateMedia({ colorScheme: c.dark ? "dark" : "light" });
        await w.getByTestId(testId).waitFor();
        await sleep(900);
        const path = builtPath();
        await w.screenshot({ path, scale: "css" });
        return path;
      } finally {
        await l.cleanup();
      }
    },
    { design: false },
  );

export const appScenarios: Scenario[] = [
  lib("E1", "empty", "Library · empty", { drive: toLibrary }),
  lib("E2", "with-readings", "Library · with readings", { drive: libraryWith }),
  lib("E7", "search-results", "Library · search results", { drive: search("speech") }),
  lib("E8", "no-search-results", "Library · no search results", { drive: search("zebra") }),
  lib("E10", "delete-confirmation", "Library · delete confirmation", {
    drive: async (p) => {
      await libraryWith(p);
      await p.getByRole("button", { name: "More for Meeting notes" }).click();
      await p.getByRole("menuitem", { name: "Delete" }).click();
      await p.getByRole("dialog").waitFor();
    },
  }),
  reader("F1", "playing", "Reader · playing", async (p) => {
    await openReader(p);
    await play(p);
  }),
  reader("F2", "paused", "Reader · paused", async (p) => {
    await openReader(p);
    await play(p);
    await p.getByRole("button", { name: "Pause" }).click();
    await status(p, "paused");
  }),
  reader("F6", "outline-bookmarks", "Reader · outline and bookmarks", async (p) => {
    await openReader(p);
    await p.getByRole("button", { name: "Outline" }).first().click();
    await p.locator('[data-block="3"]').click({ position: { x: 5, y: 5 } });
    await p.getByRole("button", { name: "Bookmark", exact: true }).click();
    await sleep(300);
  }),
  reader("F14", "voice-panel", "Reader · voice panel", async (p) => {
    await openReader(p);
    await p.getByRole("button", { name: "Voice panel", exact: true }).click();
    await sleep(400);
  }),
  reader("F9", "voice-popover", "Reader · voice popover", async (p) => {
    await openReader(p);
    await p.getByRole("button", { name: "Voice", exact: true }).click();
    await sleep(400);
  }),
  reader("J1", "export-options", "Export · options", async (p) => {
    await openReader(p);
    await p.getByRole("button", { name: "Export audio" }).click();
    await p.getByRole("dialog", { name: "Export audio" }).waitFor();
  }),
  windowShot("I3", "mini-player", "Mini player · reading the clipboard", "mini.html", "mini", async (app) => void (await hook(app, "readText", READ))),
  windowShot("I10", "tray-panel", "Tray panel · now playing", "panel.html", "tray-panel", async (app) => {
    await hook(app, "readText", READ);
    await hook(app, "togglePanel");
  }),
  home("H5", "shortcuts", ST, "Settings · Shortcuts", { drive: settings("Shortcuts") }),
  home("H14", "notifications", ST, "Settings · Notifications", { drive: settings("Notifications") }),
];
