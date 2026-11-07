import type { Page } from "@playwright/test";
import { test, expect, type Ext } from "../support/ext";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const readTab = async (ext: Ext, page: Page) => ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
const surfaces = (page: Page) => page.locator('[data-sk="launcher-tab"], [data-sk="launcher-pill"], [data-sk="dock"], [data-sk="gutter-play"]');

/** Starts reading `page` and waits until the offscreen player plays. */
async function reading(ext: Ext, page: Page) {
  await readTab(ext, page);
  await ext.waitState("playing");
}

/** Hover the edge tab, then press the x at the end of the pill. */
async function closeForTab(page: Page) {
  await sk(page, "launcher-tab").hover();
  await sk(page, "launcher-close").click();
}

test.describe("close for this tab", () => {
  test("the pill's x stops the reading and removes every control from the tab", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await reading(ext, page);
    await closeForTab(page);
    await ext.waitState("idle");
    await expect(surfaces(page)).toHaveCount(0);
    // the page keeps its (empty) highlight registrations; no range is left marked
    expect(await page.evaluate(() => [...(CSS as unknown as { highlights: Map<string, Set<unknown>> }).highlights.values()].reduce((n, h) => n + h.size, 0))).toBe(0);
  });

  test("reloading the page brings the resting tab back", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await closeForTab(page);
    await expect(surfaces(page)).toHaveCount(0);
    await page.reload();
    await expect(sk(page, "launcher-tab")).toBeVisible();
  });

  test("another tab keeps its controls and its reading", async ({ ext, app }) => {
    await ext.pair(app);
    const first = await ext.open("/article");
    const second = await ext.open("/article?second");
    await reading(ext, second);
    const before = await ext.state();
    await closeForTab(first);
    await expect(surfaces(first)).toHaveCount(0);
    await expect(sk(second, "launcher-tab")).toBeVisible();
    const after = await ext.state();
    expect([before.status, after.status, after.docId === before.docId]).toEqual(["playing", "playing", true]);
  });

  test("the keyboard shortcut reads again in a closed tab and the controls return", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await closeForTab(page);
    await expect(surfaces(page)).toHaveCount(0);
    await ext.cmd("read-selection", page);
    await ext.waitState("playing");
    await expect(sk(page, "launcher-tab")).toBeVisible();
  });
});
