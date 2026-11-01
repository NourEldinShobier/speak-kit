/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, test } from "vite-plus/test";
import { ARTICLE_PAGE } from "../../testing/fixtures";
import { launch, type Session } from "../../testing/harness";

/**
 * Screenshot tool for design comparison (designs B1-B21). Runs only with SK_SHOTS=<output dir>, e.g.
 *   SK_SHOTS=D:/tmp/shots pnpm exec vp test run src/content/tests/shots.test.ts
 */
const OUT = process.env.SK_SHOTS;
let s: Session;
beforeAll(async () => { if (OUT) { mkdirSync(OUT, { recursive: true }); s = await launch(); } }, 90000);
afterAll(async () => { await s?.close(); });

const L = { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 1500, widerWhileReading: true, y: 0.4167 };
const st = (over: any = {}) => ({ status: "playing", docId: "d", sentenceIndex: 2, sentenceCount: 24, elapsedMs: 147000, totalMs: 408000, speed: 1.2, voice: "af_heart", queueLength: 0, ...over });
const dark = (html: string) => html.replace("background:#fff", "background:#17161A").replace("color:#1a1714", "color:#F4F1EC");

const run = (name: string, fn: (open: (o?: any, html?: string) => Promise<any>, ctx: { deliver: (p: any, m: any) => Promise<any> }) => Promise<any>) =>
  test.skipIf(!OUT)(name, async () => {
    const open = async (o: any = {}, html = ARTICLE_PAGE) => {
      const page = await s.page(html, { settings: { launcher: { ...L, ...o.launcher }, ...o.rest }, viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(5000);
      return page;
    };
    const deliver = (p: any, m: any) => p.evaluate((x: any) => (window as any).__deliver(x), m);
    await fn(open, { deliver });
  }, 30000);

const startDoc = async (page: any, deliver: any) => (await deliver(page, { t: "extract", mode: "page" })).doc;
const shot = (page: any, id: string) => page.screenshot({ path: join(OUT!, `${id}.png`) });
const noLauncher = { launcher: { enabled: false } };

run("B1 bubble", async (open) => {
  const page = await open();
  await page.waitForSelector("[data-sk=launcher-tab]");
  await page.evaluate(() => {
    const t = document.getElementById("p1")!.firstChild as Text;
    const r = document.createRange(); r.setStart(t, t.data.indexOf("Notes, documents")); r.setEnd(t, t.data.indexOf("Small models"));
    getSelection()!.addRange(r);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForSelector("[data-sk=bubble]");
  await page.hover("[data-sk=bubble-listen]");
  await shot(page, "B1");
});
run("B2 gutter", async (open) => { const page = await open(); await page.hover("#p2"); await page.waitForSelector("[data-sk=gutter-play]"); await shot(page, "B2"); });
for (const [id, state] of [["B4", "idle"], ["B5", "preparing"], ["B6", "playing"], ["B7", "paused"], ["B8", "finished"]] as const) {
  run(`${id} dock ${state}`, async (open, { deliver }) => {
    const page = await open({ ...noLauncher, rest: { sites: { "sk.test": "always-dock" } } });
    const doc = await startDoc(page, deliver);
    if (state !== "idle") await deliver(page, { t: "state", state: st({ docId: doc.docId, status: state, ...(state === "preparing" ? { elapsedMs: 0, totalMs: 0 } : {}), ...(state === "finished" ? { elapsedMs: 408000 } : {}) }) });
    if (state === "playing" || state === "paused") { await deliver(page, { t: "sentence-start", start: { docId: doc.docId, index: 2, durationMs: 9000, speed: 1.2 } }); await page.waitForTimeout(1300); }
    await page.waitForSelector("[data-sk=dock]");
    await shot(page, id);
  });
}
run("B9 error", async (open, { deliver }) => {
  const page = await open(noLauncher);
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "error", error: { code: "app-not-running", message: "connect ECONNREFUSED 127.0.0.1:47615" } }) });
  await page.waitForSelector("[data-sk=dock]");
  await shot(page, "B9");
});
run("B13 toast", async (open, { deliver }) => {
  const page = await open();
  await page.waitForSelector("[data-sk=launcher-tab]");
  await deliver(page, { t: "toast", message: "Added to queue · 2 items", kind: "ok", action: "open-sidepanel", actionLabel: "View queue" });
  await page.waitForSelector("[data-sk=toast]");
  await shot(page, "B13");
});
run("B14 back pill", async (open, { deliver }) => {
  const page = await open(noLauncher);
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
  await page.mouse.move(500, 200);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(600);
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.wheel(0, 900);
  await page.waitForSelector("[data-sk=back-to-current]");
  await shot(page, "B14");
});
run("B15 speed popover", async (open, { deliver }) => {
  const page = await open(noLauncher);
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
  await page.click("[data-sk=dock-speed]");
  await page.waitForSelector("[data-sk=popover-speed]");
  await page.mouse.move(100, 100);
  await shot(page, "B15");
});
run("B16 voice popover", async (open, { deliver }) => {
  const page = await open(noLauncher);
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
  await page.click("[data-sk=dock-voice]");
  await page.waitForSelector("[data-sk=popover-voice]");
  await page.mouse.move(100, 100);
  await shot(page, "B16");
});
run("B17 tab", async (open) => { const page = await open(); await page.waitForSelector("[data-sk=launcher-tab]"); await shot(page, "B17"); });
run("B18 pill", async (open) => {
  const page = await open();
  await page.hover("[data-sk=launcher-tab]");
  await page.waitForSelector("[data-sk=launcher-pill]");
  await page.hover("[data-sk=launcher-play]");
  await page.waitForTimeout(300);
  await shot(page, "B18");
});
run("B19 reading tab", async (open, { deliver }) => {
  const page = await open();
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId, elapsedMs: 100000 }) });
  await page.waitForSelector("[data-sk=launcher-toggle]");
  await shot(page, "B19");
});
run("B20 reading pill", async (open, { deliver }) => {
  const page = await open();
  const doc = await startDoc(page, deliver);
  await deliver(page, { t: "state", state: st({ docId: doc.docId, elapsedMs: 100000 }) });
  await page.hover("[data-sk=launcher-tab]");
  await page.waitForSelector("[data-sk=launcher-pill]");
  await page.hover("[data-sk=launcher-play]");
  await page.waitForTimeout(300);
  await shot(page, "B20");
});
run("B21 dark pill", async (open) => {
  const page = await open({}, dark(ARTICLE_PAGE));
  await page.hover("[data-sk=launcher-tab]");
  await page.waitForSelector("[data-sk=launcher-pill]");
  await page.hover("[data-sk=launcher-play]");
  await page.waitForTimeout(300);
  await shot(page, "B21");
});
