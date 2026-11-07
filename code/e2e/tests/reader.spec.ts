import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fixtureBytes, importBytes, importText, openLibrary, PARAGRAPHS } from "../support/desktop-library";

const status = (page: Page) => page.getByTestId("reader").getAttribute("data-status");
const currentSentence = (page: Page) => page.evaluate(() => [...(CSS.highlights.get("sk-sentence") ?? [])].map((r) => (r as unknown as StaticRange & { toString(): string }).toString()).join("|"));
const openDoc = async (page: Page, title: string) => {
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await page.getByTestId("reader").waitFor();
};

test.describe("desktop reader @slow", () => {
  test("plays with sentence highlight and word estimate, pauses, saves progress and resumes from it", async () => {
    const d = await openLibrary();
    try {
      await importText(d, PARAGRAPHS, "Three paragraphs");
      await openDoc(d.page, "Three paragraphs");
      expect(await status(d.page)).toBe("idle");
      await d.page.getByRole("button", { name: "Play", exact: true }).click();
      await expect.poll(() => status(d.page)).toBe("playing");
      await expect.poll(() => currentSentence(d.page)).toMatch(/^The first paragraph has two sentences\./);
      await expect.poll(() => d.page.evaluate(() => CSS.highlights.get("sk-word")?.size ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
      await expect.poll(() => d.page.getByTestId("elapsed").textContent(), { timeout: 15_000 }).not.toBe("0:00");

      await d.page.getByRole("button", { name: "Next paragraph" }).click();
      await expect.poll(() => currentSentence(d.page)).toMatch(/^A second paragraph follows\./);
      await d.page.getByRole("button", { name: "Pause" }).click();
      await expect.poll(() => status(d.page)).toBe("paused");
      await d.page.getByRole("button", { name: "Back to library" }).first().click();

      const row = d.page.getByTestId("doc-row");
      await expect(row).toContainText("% ·");
      await expect(d.page.getByRole("region", { name: "Continue listening" })).toContainText("Three paragraphs");
      await d.page.getByRole("button", { name: "Resume" }).click();
      await expect.poll(() => status(d.page)).toBe("playing");
      await expect.poll(() => currentSentence(d.page)).toMatch(/^A second paragraph follows\./);
    } finally {
      await d.cleanup();
    }
  });

  test("speed popover changes the rate and is remembered; voice popover lists voices; sleep timer counts down", async () => {
    const d = await openLibrary();
    try {
      await importText(d, PARAGRAPHS, "Settings doc");
      await openDoc(d.page, "Settings doc");
      await d.page.getByRole("button", { name: "1x" }).click();
      await d.page.getByRole("button", { name: "2x", exact: true }).click();
      await expect(d.page.getByTestId("speed-value")).toHaveText("2.0x");
      await d.page.keyboard.press("Escape");
      await expect(d.page.getByRole("button", { name: "Speed 2x", exact: true })).toBeVisible();

      await d.page.getByRole("button", { name: /^Voice: / }).click();
      await expect(d.page.getByRole("option").first()).toBeVisible();
      expect(await d.page.getByRole("option").count()).toBeGreaterThan(3);
      await d.page.getByRole("option").nth(1).click();
      await d.page.keyboard.press("Escape");

      await d.page.getByRole("button", { name: "Sleep timer" }).click();
      await d.page.getByRole("button", { name: "15 minutes" }).click();
      await expect(d.page.getByTestId("sleep-left")).toHaveText(/^1[45]:\d\d$/);
      await d.page.keyboard.press("Escape");
      await d.page.getByRole("button", { name: "Back to library" }).first().click();
      await d.page.getByRole("button", { name: "Open Settings doc" }).click();
      await expect(d.page.getByRole("button", { name: "Speed 2x", exact: true })).toBeVisible();
    } finally {
      await d.cleanup();
    }
  });

  test("outline lists headings, find in text counts and steps, display settings apply", async () => {
    const d = await openLibrary();
    try {
      await importBytes(d, "notes.md", fixtureBytes("notes.md"));
      await openDoc(d.page, "Meeting notes");
      await d.page.getByRole("button", { name: "Outline" }).first().click();
      const outline = d.page.getByRole("complementary", { name: "Outline" });
      await expect(outline.getByRole("button", { name: "Meeting notes" })).toBeVisible();
      await expect(outline.getByRole("button", { name: "Next steps" })).toBeVisible();

      await d.page.keyboard.press("Control+F");
      await d.page.getByRole("textbox", { name: "Find in text" }).fill("the");
      await expect(d.page.getByTestId("find-count")).toHaveText(/^1 of \d+$/);
      expect(await d.page.evaluate(() => CSS.highlights.get("sk-find")?.size ?? 0)).toBeGreaterThan(0);
      await d.page.getByRole("textbox", { name: "Find in text" }).fill("zzz");
      await expect(d.page.getByTestId("find-count")).toHaveText("No results");
      await d.page.keyboard.press("Escape");

      await d.page.getByRole("button", { name: "Display settings" }).click();
      await d.page.getByRole("radio", { name: "Serif" }).click();
      await expect.poll(() => d.page.locator(".rd-article").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Charter");
      // The compact display card has no theme (light only); the text size slider moves the article.
      await d.page.getByRole("slider", { name: "Text size" }).focus();
      await d.page.keyboard.press("End");
      await expect.poll(() => d.page.locator(".rd-article").evaluate((e) => getComputedStyle(e).fontSize)).toBe("30px");
    } finally {
      await d.cleanup();
    }
  });

  test("reads to the end: a finished card, marked finished in the library; clicking text offers Read from here", async () => {
    const d = await openLibrary();
    try {
      await importText(d, "One short sentence. And another short one.", "Short");
      await openDoc(d.page, "Short");
      await d.page.getByRole("button", { name: "1x" }).click();
      await d.page.getByRole("button", { name: "3x", exact: true }).click();
      await d.page.keyboard.press("Escape");
      await d.page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(d.page.getByRole("dialog", { name: "Finished" })).toBeVisible({ timeout: 30_000 });
      await d.page.getByRole("button", { name: "Back to library" }).last().click();
      await expect(d.page.getByTestId("doc-row")).toContainText("Finished");

      await d.page.getByRole("button", { name: "Open Short" }).click();
      await d.page.locator("[data-block='0']").click({ position: { x: 120, y: 8 } });
      await d.page.getByRole("button", { name: "Read from here" }).click();
      await expect.poll(() => status(d.page)).toMatch(/playing|preparing|finished/);
    } finally {
      await d.cleanup();
    }
  });

  test("a scanned PDF explains itself and asks before recognizing text", async () => {
    const d = await openLibrary();
    try {
      await importBytes(d, "Scan.pdf", fixtureBytes("scanned.pdf"));
      await openDoc(d.page, "Scan");
      await expect(d.page.getByText("This PDF has no text layer")).toBeVisible();
      await expect(d.page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
      await d.page.getByRole("button", { name: "Recognize text" }).click();
      const consent = d.page.getByRole("dialog", { name: "Recognize text on this computer?" });
      await expect(consent).toContainText("download English language data");
      await consent.getByRole("button", { name: "Not now" }).click();
      await expect(consent).toBeHidden();
      await expect(d.page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    } finally {
      await d.cleanup();
    }
  });
});
