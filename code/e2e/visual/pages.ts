import type { Page } from "@playwright/test";
import type { Settings } from "@speakkit/protocol";
import { GROUPS, S, builtPath, type Ctx, type Scenario } from "./scenarios";
import { playerState, seed, send, sleep, tabIdOf } from "./support";

type Patch = (s: Settings) => Settings;
const noLauncher: Patch = (s) => ({ ...s, launcher: { ...s.launcher, enabled: false } });
const dockOnly: Patch = (s) => ({ ...noLauncher(s), sites: { "127.0.0.1": "always-dock" } });
const reader =
  (theme: "paper" | "light", p: Patch = dockOnly): Patch =>
  (s) => {
    const x = p(s) as any;
    return { ...x, reader: { ...x.reader, theme, font: "serif", size: 19, width: 680 } };
  };

export interface PageCtx {
  page: Page;
  tab: number;
  c: Ctx;
}

/** Opens the fixture article with the real content script and waits until its Shadow DOM host exists. */
export async function openPage(c: Ctx, o: { settings?: Patch; panel?: boolean } = {}): Promise<PageCtx> {
  await seed(c.ext, o.settings ?? ((s) => s));
  const page = await c.ext.ctx.newPage();
  await page.setViewportSize({ width: 1278, height: 718 });
  await page.goto(`${c.env.pageUrl}${o.panel ? "?panel" : ""}`);
  await page.mouse.move(5, 5);
  await page.mouse.move(15, 15);
  await page.waitForSelector("speakkit-ui", { state: "attached", timeout: 10_000 });
  await sleep(400);
  const tab = await tabIdOf(c.ext, c.env.pageUrl.split("/essays")[0]);
  return { page, tab, c };
}

/** Makes the content script extract the page (as a real read would) so highlights have ranges; returns the doc id. */
export async function armDoc(p: PageCtx): Promise<{ docId: string; count: number }> {
  const r = (await p.c.ext.sw.evaluate((id) => chrome.tabs.sendMessage(id, { t: "extract", mode: "page" }), p.tab)) as { doc: { docId: string; sentences: unknown[] } };
  return { docId: r.doc.docId, count: r.doc.sentences.length };
}

export const shot = async (p: PageCtx) => {
  const path = builtPath();
  await p.page.screenshot({ path, clip: { x: 0, y: 0, width: 1278, height: 718 } });
  await p.page.close();
  return path;
};

const state = (p: PageCtx, docId: string, status: string, extra: object = {}) =>
  send(p.c.ext, p.tab, {
    t: "state",
    state: playerState({
      status: status as never,
      docId,
      tabId: p.tab,
      title: "The quiet return of local-first software",
      sentenceIndex: 2,
      sentenceCount: 12,
      elapsedMs: 147_000,
      totalMs: 408_000,
      ...extra,
    }),
  });

/** Selects text from one sentence start to another by real mouse drag so the content script sees genuine events. */
async function selectSentences(p: PageCtx, from: number, to: number) {
  const box = await p.page.evaluate(
    ([a, b]) => {
      const t = document.querySelector("article p")!;
      const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      const n = w.nextNode() as Text;
      const s = n.data;
      const idx = (k: number) => {
        let i = 0;
        for (let j = 0; j < k; j++) i = s.indexOf(". ", i) + 2;
        return i;
      };
      const r = document.createRange();
      r.setStart(n, idx(a));
      r.setEnd(n, idx(b + 1) - 1 > 0 ? idx(b + 1) - 1 : s.length);
      const r0 = document.createRange();
      r0.setStart(n, idx(a));
      r0.setEnd(n, idx(a) + 1);
      const r1 = document.createRange();
      r1.setStart(n, r.endOffset - 1);
      r1.setEnd(n, r.endOffset);
      const A = r0.getBoundingClientRect();
      const B = r1.getBoundingClientRect();
      return { x0: A.left + 1, y0: A.top + A.height / 2, x1: B.right - 1, y1: B.top + B.height / 2 };
    },
    [from, to] as const,
  );
  await p.page.mouse.move(box.x0, box.y0);
  await p.page.mouse.down();
  await p.page.mouse.move(box.x1, box.y1, { steps: 8 });
  await p.page.mouse.up();
  await sleep(500);
}

const hoverLauncher = async (p: PageCtx) => {
  const t = p.page.locator("speakkit-ui [data-sk=launcher-tab]");
  const b = (await t.boundingBox())!;
  await p.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await sleep(500);
};

// Reading highlight: sentence index 2, word about 42 % into it.
const startReading = async (p: PageCtx, status = "playing") => {
  const { docId } = await armDoc(p);
  await state(p, docId, status);
  await send(p.c.ext, p.tab, { t: "sentence-start", start: { docId, index: 2, durationMs: 12_000, speed: 1 } });
  return docId;
};

const openReader = async (p: PageCtx) => {
  await startReading(p);
  await sleep(600);
  await send(p.c.ext, p.tab, { t: "reader", open: true });
  await p.page.waitForSelector("speakkit-ui [data-sk=reader]", { state: "attached", timeout: 8000 });
  await sleep(1500);
};


/** A dark host WEBSITE (not our UI): the fixture article restyled before the content script reads the page. */
const darkSite = async (p: PageCtx) => {
  await p.page.addStyleTag({ content: "html,body{background:#17181c!important;color:#e4e5e9!important}h1{color:#fff!important}.by{color:#9a9ca6!important}hr{border-color:#2d2f36!important}.k{color:#6cb4ff!important}" });
  await sleep(500);
};
const errorPill = (code: string, message: string) => async (c: Ctx) => {
  const p = await openPage(c, { settings: dockOnly });
  const { docId } = await armDoc(p);
  await state(p, docId, "error", { error: { code, message } });
  await sleep(500);
  return shot(p);
};

const G = GROUPS.page;
const R = GROUPS.reader;
export const pageScenarios: Scenario[] = [
  S("B1", "selection-bubble", G, "Page · selection bubble", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await selectSentences(p, 1, 2);
    await p.page.locator("speakkit-ui [data-sk=bubble] button").first().hover();
    await sleep(700);
    return shot(p);
  }),
  S("B2", "paragraph-gutter", G, "Page · paragraph play gutter", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await p.page.mouse.move(600, 480);
    await sleep(600);
    return shot(p);
  }),
  S("B4", "pill-idle", G, "Page · pill idle", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await sleep(600);
    return shot(p);
  }),
  S("B5", "pill-preparing", G, "Page · pill preparing", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    const { docId } = await armDoc(p);
    await state(p, docId, "preparing", { elapsedMs: 0 });
    await sleep(500);
    return shot(p);
  }),
  S("B6", "reading-highlight", G, "Page · reading with highlight", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await startReading(p);
    await sleep(5000);
    return shot(p);
  }),
  S("B7", "paused", G, "Page · paused", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    const d = await startReading(p);
    await sleep(4800);
    await state(p, d, "paused");
    await sleep(500);
    return shot(p);
  }),
  S("B8", "finished", G, "Page · finished", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    const d = await startReading(p);
    await sleep(300);
    await state(p, d, "finished", { elapsedMs: 408_000 });
    await sleep(500);
    return shot(p);
  }),
  S("B9", "app-offline", G, "Page · app offline error", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    const { docId } = await armDoc(p);
    await state(p, docId, "error", { error: { code: "app-not-running", message: "Speak Kit isn't running" } });
    await sleep(500);
    return shot(p);
  }),
  S("B22", "pill-engine-asleep", G, "Page · pill, engine asleep (product shows the plain idle pill)", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await sleep(600);
    return shot(p);
  }),
  S("B23", "pill-engine-waking", G, "Page · pill, waking the engine", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    const { docId } = await armDoc(p);
    await state(p, docId, "preparing", { elapsedMs: 0 });
    await sleep(2200);
    return shot(p);
  }),
  S("B13", "added-to-queue", G, "Page · added to queue", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await selectSentences(p, 1, 2);
    await p.page.mouse.move(1100, 650);
    await send(c.ext, p.tab, { t: "toast", message: "Added to queue · 2 items", kind: "ok", action: "open-sidepanel", actionLabel: "View queue" });
    await sleep(500);
    return shot(p);
  }),
  S("B14", "back-to-current", G, "Page · back to current", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await startReading(p);
    await sleep(300);
    await p.page.evaluate(() => window.scrollTo(0, 600));
    await p.page.mouse.wheel(0, 100);
    await sleep(900);
    return shot(p);
  }),
  S("B15", "speed-popover", G, "Page · speed popover", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await startReading(p);
    await sleep(4500);
    await p.page.locator("speakkit-ui [data-sk=dock] button:has-text('1.2x')").click();
    await sleep(400);
    return shot(p);
  }),
  S("B16", "voice-popover", G, "Page · voice popover", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await startReading(p);
    await sleep(4500);
    await p.page.locator("speakkit-ui [data-sk=dock-voice]").first().click();
    await sleep(500);
    return shot(p);
  }),
  S(
    "B15",
    "more-menu",
    G,
    "Page · pill more menu",
    async (c) => {
      const p = await openPage(c, { settings: dockOnly });
      await startReading(p);
      await sleep(4500);
      await p.page.locator("speakkit-ui [data-sk=dock-more]").click();
      await sleep(400);
      return shot(p);
    },
    { design: false },
  ),
  S("B11", "dark-site-reading", G, "Page · reading on a dark site", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await darkSite(p);
    await startReading(p);
    await sleep(5000);
    return shot(p);
  }),
  S("B11", "dark-site-idle", G, "Page · pill idle on a dark site", async (c) => {
    const p = await openPage(c, { settings: dockOnly });
    await darkSite(p);
    await sleep(600);
    return shot(p);
  }, { design: false }),
  S("B21", "dark-site-launcher", G, "Page · edge launcher on a dark site", async (c) => {
    const p = await openPage(c);
    await darkSite(p);
    await startReading(p);
    await sleep(4500);
    return shot(p);
  }, { design: false }),
  S("B21", "dark-site-launcher-tab", G, "Page · edge launcher tab on a dark site", async (c) => {
    const p = await openPage(c);
    await darkSite(p);
    await sleep(600);
    return shot(p);
  }, { design: false }),
  S("B25", "pill-error-token", G, "Page · pill, token rejected", errorPill("token-rejected", "Speak Kit needs to be paired"), { design: false }),
  S("B26", "pill-error-engine", G, "Page · pill, engine not ready", errorPill("engine-not-ready", "loading"), { design: false }),
  S("B27", "pill-error-generic", G, "Page · pill, synthesis failed", errorPill("synthesis-failed", "Speech synthesis failed."), { design: false }),
  S("B28", "pill-error-unreadable", G, "Page · pill, page not readable", errorPill("page-unreadable", "cannot read"), { design: false }),
  S("B29", "gutter-while-reading", G, "Page · paragraph gutter button while reading", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await startReading(p);
    await sleep(3000);
    await p.page.mouse.move(600, 480);
    await sleep(700);
    return shot(p);
  }, { design: false }),
  S("B30", "toast-error", G, "Page · error toast", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await send(c.ext, p.tab, { t: "toast", message: "Could not add to the queue. Is Speak Kit running?", kind: "err" });
    await sleep(500);
    return shot(p);
  }, { design: false }),
  S("B31", "toast-info", G, "Page · info toast", async (c) => {
    const p = await openPage(c, { settings: noLauncher });
    await send(c.ext, p.tab, { t: "toast", message: "Nothing selected to read", kind: "info" });
    await sleep(500);
    return shot(p);
  }, { design: false }),
  S("B17", "launcher-tab", G, "Page · edge launcher, hidden tab", async (c) => {
    const p = await openPage(c);
    await sleep(600);
    return shot(p);
  }),
  S("B18", "launcher-open", G, "Page · edge launcher, open on hover", async (c) => {
    const p = await openPage(c);
    await hoverLauncher(p);
    await p.page.locator("speakkit-ui [data-sk=launcher-pill] [data-sk=launcher-play]").hover();
    await sleep(700);
    return shot(p);
  }),
  S("B19", "launcher-reading", G, "Page · edge launcher, reading", async (c) => {
    const p = await openPage(c);
    await startReading(p);
    await sleep(4500);
    return shot(p);
  }),
  S("B20", "launcher-reading-open", G, "Page · edge launcher, reading expanded", async (c) => {
    const p = await openPage(c);
    await startReading(p);
    await sleep(4500);
    await hoverLauncher(p);
    await p.page.locator("speakkit-ui [data-sk=launcher-pill] [data-sk=launcher-play]").hover();
    await sleep(700);
    return shot(p);
  }),
  S("B10", "reader-paper", R, "Page · reader view (paper)", async (c) => {
    const p = await openPage(c, { settings: reader("paper") });
    await openReader(p);
    return shot(p);
  }),
  S(
    "B10",
    "reader-light",
    R,
    "Page · reader view (light)",
    async (c) => {
      const p = await openPage(c, { settings: reader("light") });
      await openReader(p);
      return shot(p);
    },
    { design: false },
  ),
  S("B32", "reader-dark", R, "Page · reader view (dark)", async (c) => {
    const p = await openPage(c, { settings: (s) => { const x = reader("paper")(s) as any; x.reader.theme = "dark"; return x; } });
    await openReader(p);
    return shot(p);
  }, { design: false }),
  S("B24", "reader-reading-panel", R, "Page · reading settings popover", async (c) => {
    const p = await openPage(c, { settings: reader("paper") });
    await openReader(p);
    await p.page.locator("speakkit-ui [data-sk=reader-settings]").click();
    await sleep(600);
    return shot(p);
  }),
];
