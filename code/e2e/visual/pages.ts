import type { Page } from "@playwright/test";
import type { Settings } from "@speakkit/protocol";
import { S, builtPath, type Ctx, type Scenario } from "./scenarios";
import { playerState, seed, send, sleep, tabIdOf } from "./support";

const dockOnly = (s: Settings): Settings => ({ ...s, launcher: { ...s.launcher, enabled: false }, sites: { "127.0.0.1": "always-dock" } });

interface PageCtx {
  page: Page;
  tab: number;
  c: Ctx;
}

/** Opens the fixture article with the real content script and waits until its Shadow DOM host exists. */
async function openPage(c: Ctx): Promise<PageCtx> {
  await seed(c.ext, dockOnly);
  const page = await c.ext.ctx.newPage();
  await page.setViewportSize({ width: 1278, height: 718 });
  await page.goto(c.env.pageUrl);
  await page.mouse.move(5, 5);
  await page.mouse.move(15, 15);
  await page.waitForSelector("speakkit-ui", { state: "attached", timeout: 10_000 });
  await sleep(400);
  const tab = await tabIdOf(c.ext, c.env.pageUrl.split("/essays")[0]!);
  return { page, tab, c };
}

/** Starts reading sentence 2 as the background would: the content script extracts the page, then gets state and sentence-start. */
const startReading = async (p: PageCtx) => {
  const r = (await p.c.ext.sw.evaluate((id) => chrome.tabs.sendMessage(id, { t: "extract", mode: "page" }), p.tab)) as { doc: { docId: string } };
  const docId = r.doc.docId;
  await send(p.c.ext, p.tab, {
    t: "state",
    state: playerState({ status: "playing", docId, tabId: p.tab, title: "The quiet return of local-first software", sentenceIndex: 2, sentenceCount: 12, elapsedMs: 147_000, totalMs: 408_000 }),
  });
  await send(p.c.ext, p.tab, { t: "sentence-start", start: { docId, index: 2, durationMs: 12_000, speed: 1 } });
};

export const pageScenarios: Scenario[] = [
  S("B6", "reading-highlight", async (c) => {
    const p = await openPage(c);
    await startReading(p);
    await sleep(5000);
    const path = builtPath();
    await p.page.screenshot({ path, clip: { x: 0, y: 0, width: 1278, height: 718 } });
    await p.page.close();
    return path;
  }),
];
