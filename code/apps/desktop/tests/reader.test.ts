import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  tmpDirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const TEXT = ["# Chapter one", "The first paragraph has two sentences. Here is the second one.", "# Chapter two", "A second paragraph follows. It also has two sentences."].join("\n\n");

/** The app with a one-reading library (Markdown, so the reading has headings), opened in the reader. */
async function openReader(opts: { userData?: string; exportDir?: string } = {}) {
  const exportDir = opts.exportDir ?? mkdtempSync(path.join(tmpdir(), "speakkit-out-"));
  if (!opts.exportDir) tmpDirs.push(exportDir);
  const l = await launch({
    config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: exportDir } },
    env: { SPEAKKIT_TEST: "1" },
    ...(opts.userData ? { userData: opts.userData } : {}),
  });
  running.push(l);
  await l.page.getByRole("link", { name: "Library" }).click();
  await l.page.getByRole("heading", { name: "Library" }).waitFor();
  if (!(await l.page.getByTestId("doc-row").count())) {
    await l.page.evaluate((t) => window.speakkitLibrary.importBytes("notes.md", new TextEncoder().encode(t)), TEXT);
    // The list reads the library when the page opens, so go away and come back.
    await l.page.getByRole("link", { name: "Home" }).click();
    await l.page.getByRole("link", { name: "Library" }).click();
  }
  await l.page.getByRole("button", { name: "Open Chapter one" }).waitFor();
  await l.page.getByRole("button", { name: "Open Chapter one" }).click();
  await l.page.getByTestId("reader").waitFor();
  return { l, exportDir };
}

declare global {
  interface Window {
    speakkitLibrary: import("../src/shared/library/contract").LibraryBridge;
  }
}

describe("reader: bookmarks in the outline", () => {
  it("saves a place, lists it under Bookmarks, jumps back to it, and keeps it after a restart", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Outline" }).first().click();
    const outline = l.page.getByRole("complementary", { name: "Outline" });
    await outline.getByText("No bookmarks yet.").waitFor();

    await l.page.locator('[data-block="3"]').click({ position: { x: 5, y: 5 } }); // the start of the last paragraph
    await l.page.getByRole("button", { name: "Bookmark", exact: true }).click();
    const marks = outline.getByRole("list", { name: "Bookmarks" });
    await marks.getByRole("button", { name: "A second paragraph follows.", exact: true }).waitFor();
    expect(await l.page.getByRole("button", { name: "Bookmark this place" }).count()).toBe(1);

    const stored = await l.page.evaluate(async () => (await window.speakkitLibrary.list())[0]!.bookmarks);
    expect(stored).toEqual([{ sentence: 4, label: "A second paragraph follows." }]);

    // Jumping to a bookmark while reading seeks the player to that sentence.
    await l.page.getByRole("button", { name: "Play", exact: true }).click();
    await l.page.waitForFunction(() => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === "playing");
    await marks.getByRole("button", { name: "A second paragraph follows.", exact: true }).click();
    await l.page.waitForFunction(() => [...(CSS.highlights.get("sk-sentence") ?? [])].map((r) => String(r)).join("") === "A second paragraph follows.");
    await l.page.getByRole("button", { name: "Pause" }).click();

    const userData = l.userData;
    await l.app.close();
    running.splice(running.indexOf(l), 1);
    const again = await openReader({ userData });
    await again.l.page.getByRole("button", { name: "Outline" }).first().click();
    await again.l.page.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "A second paragraph follows.", exact: true }).waitFor();
  }, 90_000);

  it("removes a bookmark from the list, and the top bar button toggles the place being read", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Outline" }).first().click();
    const outline = l.page.getByRole("complementary", { name: "Outline" });
    await l.page.getByRole("button", { name: "Bookmark this place" }).click();
    await outline.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: "Chapter one", exact: true }).waitFor();
    await outline.getByRole("button", { name: "Remove bookmark: Chapter one" }).click();
    await outline.getByText("No bookmarks yet.").waitFor();
    expect(await l.page.evaluate(async () => (await window.speakkitLibrary.list())[0]!.bookmarks)).toEqual([]);
    await l.page.getByRole("button", { name: "Bookmark this place" }).click();
    await l.page.getByRole("button", { name: "Bookmark this place" }).click();
    await outline.getByText("No bookmarks yet.").waitFor();
  }, 60_000);
});

describe("reader: voice panel dock (F14)", () => {
  it("docks the voice list and speed beside the text; choosing a voice saves it for this reading", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Voice panel", exact: true }).click();
    const dock = l.page.getByRole("complementary", { name: "Voice panel" });
    await dock.getByRole("listbox", { name: "Voices" }).waitFor();
    const voices = dock.getByRole("option");
    expect(await voices.count()).toBeGreaterThan(1);
    const second = voices.nth(1);
    await second.click();
    await l.page.waitForFunction(() => document.querySelectorAll("aside[aria-label='Voice panel'] [role=option]")[1]?.getAttribute("aria-selected") === "true");
    const saved = await l.page.evaluate(async () => (await window.speakkitLibrary.list())[0]!.voice);
    expect(saved).toBeTruthy();

    await dock.getByRole("button", { name: "2x", exact: true }).click();
    expect(await dock.getByTestId("speed-value").textContent()).toBe("2.0x");
    await l.page.getByRole("button", { name: "Voice panel", exact: true }).click();
    expect(await l.page.getByRole("complementary", { name: "Voice panel" }).count()).toBe(0);
  }, 60_000);

  it("shares the side with the outline: opening one closes the other", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Voice panel", exact: true }).click();
    await l.page.getByRole("button", { name: "Outline" }).first().click();
    expect(await l.page.getByRole("complementary", { name: "Voice panel" }).count()).toBe(0);
    await l.page.getByRole("complementary", { name: "Outline" }).waitFor();
  }, 60_000);
});

describe("reader: export audio", () => {
  it("exports the whole reading from the reader's button, named after it", async () => {
    const { l, exportDir } = await openReader();
    await l.page.getByRole("button", { name: "Export audio" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Export audio" });
    expect(await dialog.getByRole("textbox", { name: "Text to export" }).inputValue()).toBe(
      "Chapter one\n\nThe first paragraph has two sentences. Here is the second one.\n\nChapter two\n\nA second paragraph follows. It also has two sentences.",
    );
    expect(await dialog.getByRole("textbox", { name: "File name" }).inputValue()).toBe("Chapter one");
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-done").waitFor();
    expect(readdirSync(exportDir)).toEqual(["Chapter one.wav"]);
    expect(existsSync(path.join(exportDir, "Chapter one.wav"))).toBe(true);
  }, 90_000);
});
