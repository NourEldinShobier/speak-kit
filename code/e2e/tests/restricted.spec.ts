import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, highlights, type Ext } from "../support/ext";
import { shell } from "../support/pages";
import { readTab, stateOf } from "../support/probe";

const view = (popup: Page) => popup.locator(".pp");

/** Chrome grants file access to an extension loaded from the command line, so the switch "Allow access to file URLs" is off only by this override, in the worker and in every extension page. */
async function withoutFileAccess(ext: Ext) {
  const off = () => {
    chrome.extension.isAllowedFileSchemeAccess = ((cb?: (ok: boolean) => void) => (cb ? cb(false) : Promise.resolve(false))) as typeof chrome.extension.isAllowedFileSchemeAccess;
  };
  await ext.sw.evaluate(off);
  await ext.ctx.addInitScript(`if (location.protocol === "chrome-extension:") (${off})();`);
}

test.describe("pages the browser does not let an extension read", () => {
  test("PDF addresses in any case and with a query string get the PDF state, and a read is refused with no injection error", async ({ ext, app }) => {
    ext.fx.set("/UPPER.PDF", shell("Upper", `<main><p>PDFTEXT a document that Chrome would open in its viewer.</p></main>`));
    ext.fx.set("/query.pdf", shell("Query", `<main><p>PDFTEXT a document that Chrome would open in its viewer.</p></main>`));
    await ext.pair(app);
    for (const path of ["/UPPER.PDF", "/query.pdf?download=1#page=2"]) {
      const page = await ext.ctx.newPage();
      await page.goto(ext.fx.url(path));
      const popup = await ext.popup(page);
      await expect(view(popup), path).toHaveAttribute("data-view", "pdf");
      expect((await readTab(ext, page)).ok, path).toBe(false);
      await expect.poll(async () => (await stateOf(ext)).code, { message: path }).toBe("page-unreadable");
    }
    expect(app.engine.calls).toEqual([]);
  });

  test("a file:// page without file access: the popup shows a restricted state and a read is refused cleanly", async ({ ext, app }) => {
    const dir = mkdtempSync(join(tmpdir(), "speakkit-file-"));
    try {
      writeFileSync(join(dir, "local.html"), shell("Local file", `<main><p>FILETEXT ${"sentences saved on the local disk. ".repeat(3)}</p></main>`));
      await ext.pair(app);
      await withoutFileAccess(ext);
      const page = await ext.ctx.newPage();
      await page.goto(pathToFileURL(join(dir, "local.html")).href);
      const popup = await ext.popup(page);
      // Without the "tabs" permission a popup opened as a Playwright tab has no activeTab grant, so it cannot see the file address; the "fileurl" view itself is covered by Popup.test.tsx.
      await expect(view(popup)).toHaveAttribute("data-view", "unreadable");
      expect((await readTab(ext, page)).ok).toBe(false);
      await expect.poll(async () => (await stateOf(ext)).code).toMatch(/^(file-access|page-unreadable)$/);
      expect(app.engine.calls).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe("a tab the browser discards", () => {
  /** Discarding gives the tab a new id (the old one is replaced). */
  const discard = async (ext: import("../support/ext").Ext, tabId: number) => ext.sw.evaluate(async (id) => (await chrome.tabs.discard(id))?.id ?? 0, tabId);

  test("while playing: the audio stops and the tab reads again once it is back", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.open("/short?b");
    const idA = await ext.tabId(a);
    await readTab(ext, a);
    await ext.waitState("playing");
    await b.bringToFront();
    const newId = await discard(ext, idA);
    expect(newId).not.toBe(0);
    await expect.poll(async () => (await stateOf(ext)).status, { timeout: 8000 }).toBe("idle");
    // the discarded tab comes back when it is shown
    await ext.sw.evaluate((id) => chrome.tabs.update(id, { active: true }), newId);
    await expect.poll(() => ext.ctx.pages().filter((p) => p.url().includes("/article?a")).length).toBeGreaterThan(0);
    const back = ext.ctx.pages().find((p) => p.url().includes("/article?a"))!;
    await ext.settle(back);
    expect(await highlights(back)).toMatchObject({ sentence: "", word: "" });
    expect((await readTab(ext, back)).ok).toBe(true);
    await ext.waitState("playing");
  });

  test("while paused: the paused reading ends, the player is idle and not stuck paused", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.open("/short?b");
    const idA = await ext.tabId(a);
    await readTab(ext, a);
    await ext.waitState("playing");
    await ext.bg({ t: "player", command: { cmd: "pause" } });
    await ext.waitState("paused");
    await b.bringToFront();
    expect(await discard(ext, idA)).not.toBe(0);
    await expect.poll(async () => (await stateOf(ext)).status, { timeout: 8000 }).toBe("idle");
    expect((await readTab(ext, b)).ok).toBe(true);
    await expect.poll(async () => (await stateOf(ext)).tabId).toBe(await ext.tabId(b));
    await ext.waitState("playing");
  });
});
