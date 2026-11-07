/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll } from "vite-plus/test";
import { ARTICLE_PAGE } from "./fixtures";
import { launch, type Session } from "./harness";

/** Shared setup of the content script tests: one real Chromium per test file and small helpers for opening the article page and talking to it. */
export const KEY = "speakkit.settings";
export const base = (over: any = {}) => ({ launcher: { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 300, widerWhileReading: true, y: 0.42 }, ...over });
export const st = (over: any = {}) => ({
  status: "playing",
  docId: "d",
  sentenceIndex: 0,
  sentenceCount: 24,
  elapsedMs: 147000,
  totalMs: 408000,
  speed: 1.2,
  voice: "af_heart",
  queueLength: 0,
  ...over,
});
export const deliver = (page: any, msg: any) => page.evaluate((m: any) => (window as any).__deliver(m), msg);
export const sent = (page: any): Promise<any[]> => page.evaluate(() => (window as any).__sent);
export const lastPlay = async (page: any) => (await sent(page)).filter((m) => m.t === "player" && m.command.cmd === "play").at(-1)?.command.doc;
export const box = async (page: any, sel: string) => (await page.locator(sel).first().boundingBox())!;
export const hlText = (page: any, name: string) =>
  page.evaluate((n: string) => {
    const h = (CSS as any).highlights.get(n);
    return h ? [...h].map((r: Range) => r.toString()) : [];
  }, name);
/** Start reading from the launcher/bubble so the doc is known to the content script, then report the doc. */
export const startPage = async (page: any) => {
  await deliver(page, { t: "extract", mode: "page" }).then(() => {});
  const r = await deliver(page, { t: "extract", mode: "page" });
  return r.doc;
};
/** The paragraph buttons only show on a page where a reading has been started: pretend one ran and ended. */
export const engage = async (page: any) => {
  await deliver(page, { t: "state", state: st({ status: "paused", docId: "none" }) });
  await deliver(page, { t: "state", state: st({ status: "idle", docId: "none" }) });
};

/** Registers the browser launch for the calling test file and returns `open`, which opens the article page (or `html`) with the given settings. */
export function contentSession() {
  let s: Session;
  beforeAll(async () => {
    s = await launch();
  }, 90000);
  afterAll(async () => {
    await s?.close();
  });
  return {
    open: async (settings: any = base(), opts: any = {}, html = ARTICLE_PAGE) => {
      const page = await s.page(html, { settings, ...opts });
      page.setDefaultTimeout(5000);
      return page;
    },
  };
}
