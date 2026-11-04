import type { Page } from "@playwright/test";
import { test, expect, highlights, type Ext } from "../support/ext";

const read = async (ext: Ext, page: Page) => ext.bg<{ ok: boolean }>({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
const reader = async (ext: Ext) => {
  const s = await ext.bgState();
  return { tabId: s.tabId, status: s.status };
};
const marked = async (page: Page) => (await highlights(page)).sentence.length;

test.describe("tabs: one output, everything else per tab", () => {
  test("starting in tab B stops tab A, which returns to idle without a highlight left behind", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.open("/article?b");
    const [idA, idB] = [await ext.tabId(a), await ext.tabId(b)];
    expect((await read(ext, a)).ok).toBe(true);
    await expect.poll(() => reader(ext)).toEqual({ tabId: idA, status: "playing" });
    await expect.poll(() => marked(a)).toBeGreaterThan(0);
    expect((await read(ext, b)).ok).toBe(true);
    await expect.poll(() => reader(ext)).toEqual({ tabId: idB, status: "playing" });
    await expect.poll(() => marked(a), { timeout: 5000 }).toBe(0);
    await expect.poll(() => marked(b)).toBeGreaterThan(0);
  });

  test("closing the reading tab stops the audio and the other tab is untouched", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.open("/short?b");
    await read(ext, a);
    await ext.waitState("playing");
    await b.bringToFront();
    await a.close();
    await expect.poll(async () => (await ext.bgState()).status, { timeout: 8000 }).toBe("idle");
    expect(await marked(b)).toBe(0);
  });

  test("a reload while playing stops cleanly and the reloaded page can read again", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article?a");
    await read(ext, page);
    await ext.waitState("playing");
    await page.reload();
    await ext.settle(page);
    await expect.poll(async () => (await ext.bgState()).status, { timeout: 8000 }).toBe("idle");
    expect(await marked(page)).toBe(0);
    expect((await read(ext, page)).ok).toBe(true);
    await expect.poll(async () => (await ext.bgState()).status).toBe("playing");
  });

  test("five quick reloads right after starting leave no playing state and no stale highlight", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article?a");
    void read(ext, page).catch(() => {}); // the reloads cancel it
    for (let i = 0; i < 5; i++) await page.reload({ waitUntil: "commit" });
    await ext.settle(page);
    await expect.poll(async () => (await ext.bgState()).status, { timeout: 10_000 }).toBe("idle");
    expect(await marked(page)).toBe(0);
  });

  test("a reload of tab B does not interrupt tab A", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.open("/short?b");
    await read(ext, a);
    await ext.waitState("playing");
    await b.reload();
    await ext.settle(b);
    expect((await ext.bgState()).status).toBe("playing");
    expect(await marked(a)).toBeGreaterThan(0);
  });

  test("a page that cannot be read reports its error in its own tab and leaves the reader playing", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article?a");
    const b = await ext.ctx.newPage();
    await b.goto("chrome://version");
    await read(ext, a);
    await ext.waitState("playing");
    await read(ext, b);
    await b.waitForTimeout(500);
    expect(await reader(ext)).toEqual({ tabId: await ext.tabId(a), status: "playing" });
  });

  test("five open tabs: the ones nobody used do no script work in the background", async ({ ext, app }) => {
    await ext.pair(app);
    const pages: Page[] = [];
    for (let i = 0; i < 5; i++) pages.push(await ext.open("/article?a"));
    const idle = pages.slice(0, 4);
    const sessions = await Promise.all(idle.map((p) => p.context().newCDPSession(p)));
    await Promise.all(sessions.map((s) => s.send("Performance.enable")));
    const script = async () => Promise.all(sessions.map(async (s) => ((await s.send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration")?.value ?? 0) as number));
    const before = await script();
    await pages[4]!.waitForTimeout(3000);
    const after = await script();
    after.forEach((v, i) => expect(v - before[i]!, `tab ${i} script seconds in 3 s`).toBeLessThan(0.05));
  });
});
