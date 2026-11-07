import type { Page } from "@playwright/test";
import { launch } from "../../apps/desktop/tests/harness";
import { S, builtPath, type Scenario } from "./scenarios";
import { sleep } from "./support";

declare global {
  interface Window {
    speakkitLibrary: import("../../apps/desktop/src/shared/library/contract").LibraryBridge;
  }
}

/** Content size inside the 1 px window border (window 1280x800). */
const WIN = { width: 1278, height: 798 };
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const SLOW = { SPEAKKIT_FAKE_LATENCY_MS: "250" };

const TEXT = [
  "# Why local-first matters",
  "Local-first software keeps your data on your own computer. It works without a network, and it keeps working when a service shuts down.",
  "# How speech models got small",
  "A few years ago a natural voice needed a server farm. Today an eighty million parameter model speaks faster than you can read.",
  "# What comes next",
  "Voices will run on every laptop. The only thing left to decide is which one you like to hear.",
].join("\n\n");

const docs: [string, string][] = [
  ["local-first.md", TEXT],
  ["Speech models.txt", "How small speech models got good. A short history of text to speech.\n\nFrom concatenative synthesis to neural voices."],
  ["Meeting notes.txt", "Notes from the Tuesday meeting. We agreed to ship the reader first.\n\nThe export dialog follows."],
];

const shot = (id: string, state: string, drive: (p: Page) => Promise<void>, env: Record<string, string> = {}): Scenario =>
  S(id, state, async () => {
    const l = await launch({ env: { SPEAKKIT_TEST: "1", ...env }, config: { ...DONE } });
    try {
      await l.app.evaluate(({ BrowserWindow }, s) => {
        const w = BrowserWindow.getAllWindows()[0]!;
        w.setContentSize(s.width, s.height);
        w.center();
      }, WIN);
      await l.page.getByRole("heading").first().waitFor({ timeout: 15_000 });
      await sleep(700);
      await drive(l.page);
      await sleep(700);
      const path = builtPath();
      await l.page.screenshot({ path, scale: "css" });
      return path;
    } finally {
      await l.cleanup();
    }
  });

const side = async (p: Page, name: string) => {
  await p.locator("aside").getByText(name, { exact: true }).first().click();
  await sleep(600);
};

/** Fills the library through the preload bridge; the list reads once when the page opens, so leave and come back. */
const openReader = async (p: Page) => {
  await p.evaluate(async (list) => {
    for (const [name, text] of list) await window.speakkitLibrary.importBytes(name, new TextEncoder().encode(text));
  }, docs);
  await p.getByRole("link", { name: "Home" }).click();
  await p.getByRole("link", { name: "Library" }).click();
  await p.getByRole("heading", { name: "Library" }).waitFor();
  await p.getByRole("button", { name: "Open Why local-first matters" }).click();
  await p.getByTestId("reader").waitFor();
};

export const desktopScenarios: Scenario[] = [shot("G1", "voices", (p) => side(p, "Voices"))];

export const appScenarios: Scenario[] = [
  shot(
    "F1",
    "playing",
    async (p) => {
      await openReader(p);
      await p.getByRole("button", { name: "Play", exact: true }).click();
      await p.waitForFunction(() => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === "playing");
    },
    SLOW,
  ),
  shot("H5", "shortcuts", async (p) => {
    await side(p, "Settings");
    await side(p, "Shortcuts");
  }),
];
