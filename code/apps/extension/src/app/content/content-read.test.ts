/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vite-plus/test";
import { ARTICLE_PAGE } from "../../testing/fixtures";
import { KEY, base, st, deliver, box, hlText, startPage, contentSession } from "../../testing/content-page";

const { open } = contentSession();

describe("highlight and read-along", () => {
  test("the current sentence is highlighted, moves with state, clears when finished", async () => {
    const page = await open();
    const doc = await startPage(page);
    const text = (i: number) => doc.sentences[i].text;
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
    expect(await hlText(page, "speakkit-sentence")).toEqual([text(2)]);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 3 }) });
    expect(await hlText(page, "speakkit-sentence")).toEqual([text(3)]);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "finished" }) });
    expect(await hlText(page, "speakkit-sentence")).toEqual([]);
    await page.context().close();
  });

  test("word highlight follows SentenceStart timing, stops on pause, resumes on play", async () => {
    const page = await open();
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
    await deliver(page, { t: "sentence-start", start: { docId: doc.docId, index: 2, durationMs: 4000, speed: 1.2 } });
    await page.waitForFunction(() => ((CSS as any).highlights.get("speakkit-word")?.size ?? 0) === 1);
    expect(await hlText(page, "speakkit-word")).toEqual(["Notes"]);
    await page.waitForTimeout(1800);
    const mid = (await hlText(page, "speakkit-word"))[0];
    expect(["Notes", "documents"]).not.toContain(mid);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2, status: "paused" }) });
    const frozen = (await hlText(page, "speakkit-word"))[0];
    await page.waitForTimeout(800);
    expect((await hlText(page, "speakkit-word"))[0]).toBe(frozen);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2, status: "playing" }) });
    await page.waitForFunction((f: string) => [...(CSS as any).highlights.get("speakkit-word")].map((r: Range) => r.toString())[0] !== f, frozen, { timeout: 4000 });
    await page.context().close();
  });

  test("highlight mode 'sentence' sets no word, 'off' sets nothing", async () => {
    let page = await open(base({ highlight: { mode: "sentence" } }));
    let doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
    await deliver(page, { t: "sentence-start", start: { docId: doc.docId, index: 2, durationMs: 4000, speed: 1 } });
    await page.waitForTimeout(300);
    expect(await hlText(page, "speakkit-sentence")).toHaveLength(1);
    expect(await hlText(page, "speakkit-word")).toEqual([]);
    await page.context().close();
    page = await open(base({ highlight: { mode: "off" } }));
    doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
    expect(await hlText(page, "speakkit-sentence")).toEqual([]);
    await page.context().close();
  });

  test("colors come from settings, switch to the dark palette on dark pages, and follow settings-changed", async () => {
    const css = (page: any) => page.evaluate(() => document.adoptedStyleSheets.flatMap((sh: CSSStyleSheet) => [...sh.cssRules].map((r) => r.cssText)).join("\n"));
    let page = await open(base({ highlight: { sentenceColor: "#C8F0D0", wordColor: "#33AA55", matchTheme: true } }));
    await page.waitForSelector("[data-sk=launcher-tab]");
    expect(await css(page)).toMatch(/speakkit-sentence\)\s*\{[^}]*rgb\(200, 240, 208\)/);
    await page.evaluate((k: string) => {
      (window as any).__store[k].highlight.sentenceColor = "#112233";
    }, KEY);
    await deliver(page, { t: "settings-changed" });
    await page.waitForFunction(() => document.adoptedStyleSheets.some((sh) => [...sh.cssRules].some((r) => r.cssText.includes("rgb(17, 34, 51)"))));
    await page.context().close();
    page = await open(base(), {}, ARTICLE_PAGE.replace("background:#fff", "background:#141210"));
    await page.waitForSelector("[data-sk=launcher-tab]");
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 1 }) });
    expect(await css(page)).toContain("rgb(120, 98, 31)");
    expect(await page.locator(".sk").getAttribute("data-theme")).toBe("dark");
    await page.context().close();
  });

  test("auto-scroll keeps the sentence in view; scrolling away shows Back to current; the pill returns", async () => {
    const page = await open(base(), { viewport: { width: 1280, height: 400 } });
    const doc = await startPage(page);
    const last = doc.sentences.length - 1;
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: last }) });
    await page.waitForFunction(() => scrollY > 200, undefined, { timeout: 4000 });
    await page.waitForFunction(
      () =>
        new Promise((r) => {
          const a = scrollY;
          setTimeout(() => r(scrollY === a), 200);
        }),
      undefined,
      { timeout: 5000 },
    );
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 1 }) });
    await page.waitForFunction(
      () => {
        const r = document.getElementById("p1")!.getBoundingClientRect();
        return r.top > 0 && r.top < 200;
      },
      undefined,
      { timeout: 4000 },
    );
    // the user scrolls to the bottom: sentence 1 is out of view -> pill
    await page.waitForFunction(
      () =>
        new Promise((r) => {
          const a = scrollY;
          setTimeout(() => r(scrollY === a), 250);
        }),
    );
    await page.mouse.move(500, 200);
    await page.mouse.wheel(0, 3000);
    await page.waitForSelector("[data-sk=back-to-current]");
    const pill = await box(page, "[data-sk=back-to-current]");
    expect(pill.height).toBe(36);
    expect(Math.abs(pill.y - 16)).toBeLessThan(1);
    expect(Math.abs(pill.x + pill.width / 2 - 640)).toBeLessThan(1);
    // new sentences do not drag the page back while the user is away
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 2 }) });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
    await page.click("[data-sk=back-to-current]");
    await page.waitForFunction(
      () => {
        const r = document.getElementById("p1")!.getBoundingClientRect();
        return r.top > 0 && r.top < 300;
      },
      undefined,
      { timeout: 4000 },
    );
    await page.waitForSelector("[data-sk=back-to-current]", { state: "detached" });
    await page.context().close();
  });

  test("autoScroll off never scrolls", async () => {
    const page = await open(base({ show: { autoScroll: false } }), { viewport: { width: 1280, height: 400 } });
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: doc.sentences.length - 1 }) });
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.context().close();
  });
});

describe("reader reading popover", () => {
  test("is a 300 px floating card; Size and Width are a label and value row over a full-width dark slider; no blue ring", async () => {
    const page = await open();
    await page.hover("[data-sk=launcher-tab]");
    await page.click("[data-sk=launcher-reader]");
    await page.click("[data-sk=reader-settings]");
    await page.waitForSelector(".sk-pop-reading");
    const r = await page.locator(".sk-pop-reading").evaluate((el: Element) => {
      const c = getComputedStyle(el);
      const g = el.querySelector(".sk-pgroup")!;
      const bx = (e: Element) => e.getBoundingClientRect();
      return {
        card: [bx(el).width, `${c.borderTopWidth} ${c.borderTopColor}`, c.boxShadow, c.borderRadius, c.overflow],
        rows: [...el.querySelectorAll(".sk-pgroup")].map((x) => x.querySelector(".sk-prow")!.textContent),
        slider: [bx(g.querySelector(".lm-slider")!).width, bx(g).width],
        fill: getComputedStyle(g.querySelector(".lm-slider__range")!).backgroundColor,
        seg: [...el.querySelectorAll(".lm-seg")].map((x) => bx(x).width),
      };
    });
    expect(r).toEqual({
      card: [300, "1px rgb(229, 229, 229)", "rgba(0, 0, 0, 0.06) 0px 2px 6px 0px", "12px", "visible"],
      rows: ["Size18px", "Width680px"],
      slider: [266, 266],
      fill: "rgb(32, 30, 37)",
      seg: [266, 266],
    });
    await page.context().close();
  });
});
