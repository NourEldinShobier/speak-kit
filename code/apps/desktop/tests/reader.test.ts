import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(tmpDirs.splice(0).map(removeDir));
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

describe("reader: footer voice and speed", () => {
  it("the voice button opens the voice list; choosing a voice saves it for this reading and shows its name", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: /^Voice: / }).click();
    const list = l.page.getByRole("listbox", { name: "Voices" });
    await list.waitFor();
    expect(await list.getByRole("option").count()).toBeGreaterThan(1);
    const second = list.getByRole("option").nth(1);
    const name = await second.locator("span").first().textContent();
    await second.click();
    await l.page.waitForFunction(() => document.querySelectorAll("[role=listbox][aria-label=Voices] [role=option]")[1]?.getAttribute("aria-selected") === "true");
    expect(await l.page.evaluate(async () => (await window.speakkitLibrary.list())[0]!.voice)).toBeTruthy();
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("button", { name: `Voice: ${name}` }).waitFor();
  }, 60_000);

  it("the speed pill opens the presets", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "1x", exact: true }).click();
    await l.page.getByRole("button", { name: "2x", exact: true }).click();
    expect(await l.page.getByTestId("speed-value").textContent()).toBe("2.0x");
  }, 60_000);
});

describe("reader: customise toolbar", () => {
  it("hides and shows a footer control from the switch list, and the choice survives a restart", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Customise player toolbar" }).click();
    const volume = l.page.getByRole("switch", { name: "Volume" });
    expect(await volume.getAttribute("aria-checked")).toBe("true");
    await volume.click();
    await l.page.keyboard.press("Escape");
    expect(await l.page.getByRole("button", { name: "Volume", exact: true }).count()).toBe(0);

    const userData = l.userData;
    await l.app.close();
    running.splice(running.indexOf(l), 1);
    const again = await openReader({ userData });
    expect(await again.l.page.getByRole("button", { name: "Volume", exact: true }).count()).toBe(0);
    await again.l.page.getByRole("button", { name: "Customise player toolbar" }).click();
    await again.l.page.getByRole("switch", { name: "Volume" }).click();
    await again.l.page.keyboard.press("Escape");
    await again.l.page.getByRole("button", { name: "Volume", exact: true }).waitFor();
  }, 90_000);

  it("the header has five reading icons and no voice button", async () => {
    const { l } = await openReader();
    const header = l.page.locator("header.rd-top");
    expect(await header.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent))).toEqual([
      "Back to library",
      "Library",
      "Find in text",
      "Display settings",
      "Bookmark this place",
      "Export audio",
      "Outline",
      "Customise header toolbar",
    ]);
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
