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

const DONE = { setupDone: true, setupSkipped: false };
const TEXT = ["# Chapter one", "The first paragraph has two sentences. Here is the second one.", "# Chapter two", "A second paragraph follows. It also has two sentences."].join("\n\n");

/** The app with a one-reading library (Markdown, so the reading has headings), opened in the reader. */
async function openReader() {
  const exportDir = mkdtempSync(path.join(tmpdir(), "speakkit-out-"));
  tmpDirs.push(exportDir);
  const l = await launch({
    config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: exportDir } },
    env: { SPEAKKIT_TEST: "1" },
  });
  running.push(l);
  await l.page.getByRole("link", { name: "Library" }).click();
  await l.page.getByRole("heading", { name: "Library" }).waitFor();
  if (!(await l.page.getByTestId("doc-row").count())) {
    const imported = await l.page.evaluate((t) => window.speakkitLibrary.importBytes("notes.md", new TextEncoder().encode(t)), TEXT);
    expect(imported.ok, "the import that fills the library").toBe(true);
    // The list reads the library when the page opens, so go away and come back.
    await l.page.getByRole("link", { name: "Dictation", exact: true }).first().click();
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

describe("reader: focus in the floating cards", () => {
  const active = (l: Launched) => l.page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");

  it("the display card takes focus on its first control and gives it back to the header button on Escape", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Display settings" }).click();
    await l.page.getByRole("dialog", { name: "Display" }).waitFor();
    await expect.poll(() => l.page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label") + ":" + document.activeElement?.textContent)).toBe("Display:Sans");
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("dialog", { name: "Display" }).waitFor({ state: "detached" });
    expect(await active(l)).toBe("Display settings");
  }, 60_000);

  it("closing the find card, by its button or Escape, gives focus back to the header Find button", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Find in text" }).click();
    await expect.poll(() => active(l)).toBe("Find in text"); // the field
    await l.page.getByRole("button", { name: "Close find" }).click();
    await l.page.getByRole("search").waitFor({ state: "detached" });
    expect(await l.page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.getAttribute("aria-label"))).toBe("BUTTON:Find in text");
    await l.page.getByRole("button", { name: "Find in text" }).click();
    await l.page.getByRole("textbox", { name: "Find in text" }).press("Escape");
    await l.page.getByRole("search").waitFor({ state: "detached" });
    expect(await l.page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.getAttribute("aria-label"))).toBe("BUTTON:Find in text");
  }, 60_000);
});

describe("reader: footer voice and speed", () => {
  it("the voice button opens the voice list; choosing a voice shows its name", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: /^Voice: / }).click();
    const list = l.page.getByRole("listbox", { name: "Voices" });
    await list.waitFor();
    expect(await list.getByRole("option").count()).toBeGreaterThan(1);
    const second = list.getByRole("option").nth(1);
    const name = await second.locator("span").first().textContent();
    await second.click();
    await l.page.waitForFunction(() => document.querySelectorAll("[role=listbox][aria-label=Voices] [role=option]")[1]?.getAttribute("aria-selected") === "true");
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("button", { name: `Voice: ${name}` }).waitFor();
  }, 60_000);

  it("the speed pill opens the presets", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Speed 1x", exact: true }).click();
    await l.page.getByRole("button", { name: "2x", exact: true }).click();
    expect(await l.page.getByTestId("speed-value").textContent()).toBe("2.0x");
  }, 60_000);
});

const status = (l: Launched) => l.page.getByTestId("reader").getAttribute("data-status");
const waitStatus = (l: Launched, want: string) => l.page.waitForFunction((w) => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === w, want, { timeout: 30_000 });

describe("reader: footer sleep timer", () => {
  // A sleep-timer minute lasts 300 ms here (localStorage key compiled out of shipped builds): 5 minutes are 1.5 s, 60 minutes are 18 s.
  const startPlaying = async (l: Launched) => {
    await l.page.evaluate(() => localStorage.setItem("speakkit.test.msPerMinute", "300"));
    await l.page.getByRole("button", { name: "Play", exact: true }).click();
    await waitStatus(l, "playing");
  };

  it("shows the time left, counts it down, and Off clears it without stopping the reading", async () => {
    const { l } = await openReader();
    await startPlaying(l);
    await l.page.getByRole("button", { name: "Sleep timer" }).click();
    await l.page.getByRole("button", { name: "60 minutes", exact: true }).click();
    const left = l.page.getByTestId("sleep-left");
    await left.waitFor();
    expect(await left.textContent()).toMatch(/^0:(17|18)$/);
    await l.page.waitForFunction(() => /^0:1[0-5]$/.test(document.querySelector("[data-testid=sleep-left]")?.textContent ?? ""), undefined, { timeout: 10_000 });
    await l.page.getByRole("button", { name: "Off", exact: true }).click();
    await left.waitFor({ state: "detached" });
    expect(await status(l)).toBe("playing");
  }, 60_000);

  it("pauses the reading when the time is up and clears the label", async () => {
    const { l } = await openReader();
    await startPlaying(l);
    await l.page.getByRole("button", { name: "Sleep timer" }).click();
    await l.page.getByRole("button", { name: "5 minutes", exact: true }).click();
    await l.page.getByTestId("sleep-left").waitFor();
    await waitStatus(l, "paused");
    expect(await l.page.getByTestId("sleep-left").count()).toBe(0);
    expect(await l.page.getByRole("button", { name: "Play", exact: true }).count()).toBe(1);
  }, 60_000);
});

describe("reader: playing to the end", () => {
  it("moves through every sentence and finishes without the error screen", async () => {
    const { l } = await openReader();
    await l.page.getByRole("button", { name: "Play", exact: true }).click();
    await waitStatus(l, "finished");
    expect(await l.page.getByText("Something went wrong").count()).toBe(0);
  }, 60_000);
});

describe("reader: header", () => {
  it("the header has four reading icons and no voice button", async () => {
    const { l } = await openReader();
    const header = l.page.locator("header.rd-top");
    expect(await header.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent))).toEqual([
      "Back to library",
      "Library",
      "Find in text",
      "Display settings",
      "Export audio",
      "Outline",
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
