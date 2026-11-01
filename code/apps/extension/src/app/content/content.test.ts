/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { ARTICLE_PAGE } from "../../testing/fixtures";
import { launch, type Session } from "../../testing/harness";

let s: Session;
beforeAll(async () => { s = await launch(); }, 90000);
afterAll(async () => { await s?.close(); });

const KEY = "speakkit.settings";
const base = (over: any = {}) => ({ launcher: { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 300, widerWhileReading: true, y: 0.42 }, ...over });
const st = (over: any = {}) => ({ status: "playing", docId: "d", sentenceIndex: 0, sentenceCount: 24, elapsedMs: 147000, totalMs: 408000, speed: 1.2, voice: "af_heart", queueLength: 0, ...over });

const open = async (settings: any = base(), opts: any = {}) => {
  const page = await s.page(ARTICLE_PAGE, { settings, ...opts });
  page.setDefaultTimeout(5000);
  return page;
};
const deliver = (page: any, msg: any) => page.evaluate((m: any) => (window as any).__deliver(m), msg);
const sent = (page: any): Promise<any[]> => page.evaluate(() => (window as any).__sent);
const lastPlay = async (page: any) => (await sent(page)).filter((m) => m.t === "player" && m.command.cmd === "play").at(-1)?.command.doc;
const box = async (page: any, sel: string) => (await page.locator(sel).first().boundingBox())!;
const hlText = (page: any, name: string) => page.evaluate((n: string) => { const h = (CSS as any).highlights.get(n); return h ? [...h].map((r: Range) => r.toString()) : []; }, name);
/** Start reading from the launcher/bubble so the doc is known to the content script, then report the doc. */
const startPage = async (page: any) => {
  await deliver(page, { t: "extract", mode: "page" }).then(() => {});
  const r = await deliver(page, { t: "extract", mode: "page" });
  return r.doc;
};

describe("extraction requests", () => {
  test("replies to extract with a ReadDoc for page, selection and from-here", async () => {
    const page = await open();
    const r = await deliver(page, { t: "extract", mode: "page" });
    expect(r.doc.source).toBe("page");
    expect(r.doc.sentences[0]).toEqual({ text: "The quiet return of local-first software", block: 0 });
    expect(r.doc.startIndex).toBe(0);
    expect(r.doc.url).toBe("http://sk.test/page");
    expect(typeof r.doc.docId).toBe("string");
    await page.evaluate(() => { const t = document.getElementById("p3")!.firstChild as Text; const g = getSelection()!; g.removeAllRanges(); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 26); g.addRange(r); });
    const sel = await deliver(page, { t: "extract", mode: "selection" });
    expect(sel.doc.source).toBe("selection");
    expect(sel.doc.sentences.map((x: any) => x.text)).toEqual(["None of this is nostalgia."]);
    await page.evaluate(() => { const g = getSelection()!; g.removeAllRanges(); const t = document.getElementById("p2")!.firstChild as Text; const r = document.createRange(); r.setStart(t, t.data.indexOf("Nothing leaves")); r.collapse(true); g.addRange(r); });
    const fh = await deliver(page, { t: "extract", mode: "from-here" });
    expect(fh.doc.source).toBe("from-here");
    expect(fh.doc.sentences[fh.doc.startIndex].text).toBe("Nothing leaves the device, so there is nothing to leak.");
    await page.context().close();
  });

  test("a never-read site rule answers page-unreadable and shows no UI", async () => {
    const page = await open(base({ sites: { "sk.test": "never-read" } }));
    expect(await deliver(page, { t: "extract", mode: "page" })).toEqual({ error: "page-unreadable" });
    await page.waitForTimeout(400);
    expect(await page.locator("speakkit-ui").count()).toBe(0);
    await page.context().close();
  });

  test("a hide-controls rule shows no launcher, bubble or gutter", async () => {
    const page = await open(base({ sites: { "sk.test": "hide-controls" } }));
    await page.waitForTimeout(400);
    expect(await page.locator("[data-sk=launcher-tab]").count()).toBe(0);
    await page.hover("#p2");
    await page.waitForTimeout(200);
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    await page.context().close();
  });
});

describe("edge launcher (B17-B20)", () => {
  test("rests as a 14 x 76 tab on the right edge at the saved height", async () => {
    const page = await open();
    await page.waitForSelector("[data-sk=launcher-tab]");
    const b = await box(page, "[data-sk=launcher-tab]");
    expect([b.width, b.height]).toEqual([14, 76]);
    expect(b.x + b.width).toBe(1280);
    expect(Math.abs(b.y - 0.42 * 720)).toBeLessThan(1);
    await page.context().close();
  });

  test("hover opens the 60 px pill, play reads the page, moving away closes it after the delay", async () => {
    const page = await open();
    await page.hover("[data-sk=launcher-tab]");
    await page.waitForSelector("[data-sk=launcher-pill]");
    await page.waitForTimeout(250);
    const p = await box(page, "[data-sk=launcher-pill]");
    expect(p.width).toBe(60);
    expect(p.x + p.width).toBe(1280 - 14);
    const play = await box(page, "[data-sk=launcher-play]");
    expect([play.width, play.height]).toEqual([44, 44]);
    await page.hover("[data-sk=launcher-play]");
    expect(await page.locator("[data-sk=launcher-tooltip]").textContent()).toContain("Listen to this page");
    await page.click("[data-sk=launcher-play]");
    const doc = await lastPlay(page);
    expect(doc.source).toBe("page");
    expect(doc.sentences.length).toBeGreaterThan(10);
    expect(doc.tabId).toBe(-1);
    await page.mouse.move(300, 300);
    await page.waitForSelector("[data-sk=launcher-pill]", { state: "detached", timeout: 3000 });
    expect(await page.locator("[data-sk=launcher-tab]").count()).toBe(1);
    await page.context().close();
  });

  test("openOn click needs a click, not a hover", async () => {
    const page = await open(base({ launcher: { ...base().launcher, openOn: "click" } }));
    await page.hover("[data-sk=launcher-tab]");
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=launcher-pill]").count()).toBe(0);
    await page.click("[data-sk=launcher-tab]");
    await page.waitForSelector("[data-sk=launcher-pill]");
    await page.context().close();
  });

  test("idle 'open' keeps the pill open, idle 'hidden' fades the tab until hovered", async () => {
    let page = await open(base({ launcher: { ...base().launcher, idle: "open" } }));
    await page.waitForSelector("[data-sk=launcher-pill]");
    await page.context().close();
    page = await open(base({ launcher: { ...base().launcher, idle: "hidden" } }));
    await page.waitForSelector("[data-sk=launcher-tab]", { state: "attached" });
    expect(await page.locator("[data-sk=launcher-tab]").evaluate((el: Element) => getComputedStyle(el).opacity)).toBe("0");
    await page.hover("[data-sk=launcher-tab]");
    await page.waitForSelector("[data-sk=launcher-pill]");
    await page.context().close();
  });

  test("left side mirrors the position", async () => {
    const page = await open(base({ launcher: { ...base().launcher, side: "left" } }));
    const b = await box(page, "[data-sk=launcher-tab]");
    expect(b.x).toBe(0);
    await page.context().close();
  });

  test("while reading the tab widens to 44 px with a pause button and a progress rail; click pauses", async () => {
    const page = await open();
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.waitForSelector("[data-sk=launcher-toggle]");
    const b = await box(page, "[data-sk=launcher-tab]");
    expect([b.width, b.height]).toEqual([44, 76]);
    const rail = await page.locator("[data-sk=launcher-tab] .sk-rail i").evaluate((el: HTMLElement) => el.style.height);
    expect(parseFloat(rail)).toBeCloseTo((147000 / 408000) * 100, 2);
    await page.click("[data-sk=launcher-toggle]");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "toggle" } });
    await page.context().close();
  });

  test("reading pill stacks pause, rail with time left, skips, speed, voice and stop (B20)", async () => {
    const page = await open();
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.hover("[data-sk=launcher-tab]");
    await page.waitForSelector("[data-sk=launcher-pill]");
    expect(await page.locator("[data-sk=launcher-pill] .sk-time").textContent()).toBe("4:21");
    expect(await page.locator("[data-sk=launcher-speed]").textContent()).toBe("1.2x");
    await page.click("[data-sk=launcher-back]");
    await page.click("[data-sk=launcher-fwd]");
    await page.click("[data-sk=launcher-stop]");
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds.slice(-3)).toEqual([{ cmd: "seek-ms", deltaMs: -10000 }, { cmd: "seek-ms", deltaMs: 10000 }, { cmd: "stop" }]);
    await page.hover("[data-sk=launcher-play]");
    expect(await page.locator("[data-sk=launcher-tooltip]").textContent()).toBe("PauseSpace");
    await page.context().close();
  });

  test("dragging the tab moves it and persists the new height", async () => {
    const page = await open();
    const b = await box(page, "[data-sk=launcher-tab]");
    await page.mouse.move(b.x + 7, b.y + 38);
    await page.mouse.down();
    await page.mouse.move(b.x + 7, b.y + 38 + 120, { steps: 6 });
    await page.mouse.up();
    const b2 = await box(page, "[data-sk=launcher-tab]");
    expect(Math.round(b2.y - b.y)).toBe(120);
    await page.waitForFunction((k: string) => (window as any).__store[k]?.launcher?.y > 0.5, KEY);
    const y = await page.evaluate((k: string) => (window as any).__store[k].launcher.y, KEY);
    expect(y).toBeCloseTo((b.y + 120) / 720, 2);
    await page.context().close();
  });
});

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
    await page.evaluate((k: string) => { (window as any).__store[k].highlight.sentenceColor = "#112233"; }, KEY);
    await deliver(page, { t: "settings-changed" });
    await page.waitForFunction(() => document.adoptedStyleSheets.some((sh) => [...sh.cssRules].some((r) => r.cssText.includes("rgb(17, 34, 51)"))));
    await page.context().close();
    page = await s.page(ARTICLE_PAGE.replace("background:#fff", "background:#141210"), { settings: base() });
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
    await page.waitForFunction(() => new Promise((r) => { const a = scrollY; setTimeout(() => r(scrollY === a), 200); }), undefined, { timeout: 5000 });
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: 1 }) });
    await page.waitForFunction(() => { const r = document.getElementById("p1")!.getBoundingClientRect(); return r.top > 0 && r.top < 200; }, undefined, { timeout: 4000 });
    // the user scrolls to the bottom: sentence 1 is out of view -> pill
    await page.waitForFunction(() => new Promise((r) => { const a = scrollY; setTimeout(() => r(scrollY === a), 250); }));
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
    await page.waitForFunction(() => { const r = document.getElementById("p1")!.getBoundingClientRect(); return r.top > 0 && r.top < 300; }, undefined, { timeout: 4000 });
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

describe("floating dock (B4-B9, B15, B16)", () => {
  const dockSettings = (over: any = {}) => base({ launcher: { ...base().launcher, enabled: false }, ...over });

  test("idle dock only with the always-dock rule: 'Read this page' with the time estimate", async () => {
    let page = await open(dockSettings());
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=dock]").count()).toBe(0);
    await page.context().close();
    page = await open(dockSettings({ sites: { "sk.test": "always-dock" } }));
    await page.waitForSelector("[data-sk=dock]");
    const txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Read this page");
    expect(txt).toMatch(/\d+ min \d+ s at 1\.2x|\d+ s at 1\.2x/);
    await page.click("[data-sk=dock-play]");
    expect((await lastPlay(page)).source).toBe("page");
    await page.context().close();
  });

  test("preparing shows a spinner and 'Preparing voice...', playing shows time, speed and voice", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "preparing", elapsedMs: 0, totalMs: 0 }) });
    await page.waitForSelector("[data-sk=dock]");
    let txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Preparing voice...");
    expect(await page.locator("[data-sk=dock-toggle] .lm-spin").count()).toBe(1);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Paragraph 1 of 9 \u00b7 4 min left");
    expect(txt).toContain("1.2x");
    expect(txt).toContain("Heart \u00b7 on device");
    expect(await page.locator("[data-sk=dock-voice] .lm-avatar").textContent()).toBe("H");
    const d = await box(page, "[data-sk=dock]");
    // Lumen F5 read-aloud pill is 52 px tall (docs/screen-map.md); 6 px padding around the 40 px play button gives 52 to 54.
    expect(d.height).toBeGreaterThanOrEqual(52);
    expect(d.height).toBeLessThanOrEqual(56);
    expect(Math.abs(d.y + d.height - (720 - 24))).toBeLessThan(1);
    expect(Math.abs(d.x + d.width / 2 - 640)).toBeLessThan(1);
    await page.context().close();
  });

  test("controls send the right commands", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-toggle]");
    await page.click("[data-sk=dock-prev]");
    await page.click("[data-sk=dock-next]");
    const bar = await box(page, "[data-sk=seek]");
    await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds.slice(-4, -1)).toEqual([{ cmd: "toggle" }, { cmd: "prev-block" }, { cmd: "next-block" }]);
    const seek = cmds.at(-1);
    expect(seek.cmd).toBe("seek-ms");
    expect(Math.abs(seek.deltaMs - (0.5 * 408000 - 147000))).toBeLessThan(4000);
    await page.context().close();
  });

  test("paused shows 'Paused'; finished shows 'Finished' and replay restarts from the first sentence", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "paused" }) });
    expect(await page.locator("[data-sk=dock-toggle]").getAttribute("aria-label")).toBe("Play"); // paused: the pill offers Play
    expect(await page.locator("[data-sk=dock]").getAttribute("data-state")).toBe("paused");
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "finished", elapsedMs: 408000 }) });
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("Done · Read again");
    expect(await page.locator("[data-sk=dock-toggle]").getAttribute("aria-label")).toBe("Replay");
    await page.click("[data-sk=dock-toggle]");
    const d = await lastPlay(page);
    expect(d.docId).toBe(doc.docId);
    expect(d.startIndex).toBe(0);
    await page.context().close();
  });

  test("error shows one surface with Open app, Retry and Details", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "error", error: { code: "app-not-running", message: "connect ECONNREFUSED 127.0.0.1:47615" } }) });
    await page.waitForSelector("[data-sk=dock]");
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("SpeakKit isn't running");
    await page.click("[data-sk=dock-open-app]");
    expect((await sent(page)).at(-1)).toEqual({ t: "open-app" });
    await page.click("[data-sk=dock-details]");
    expect(await page.locator("[data-sk=dock-details-text]").textContent()).toContain("ECONNREFUSED");
    await page.click("[data-sk=dock-retry]");
    expect((await sent(page)).at(-1).command.cmd).toBe("play");
    await page.context().close();
  });

  test("with the launcher enabled the dock appears only for errors and the finished state", async () => {
    const page = await open();
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    expect(await page.locator("[data-sk=dock]").count()).toBe(0);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "error", error: { code: "token-rejected" } }) });
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("needs to be paired");
    await page.context().close();
  });

  test("speed popover: presets, slider and reset send set-speed (B15)", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-speed]");
    await page.waitForSelector("[data-sk=popover-speed]");
    const pop = await box(page, "[data-sk=popover-speed]");
    const trig = await box(page, "[data-sk=dock-speed]");
    expect(pop.width).toBe(300); // the popover surface is 300 wide
    expect(Math.abs(pop.x + pop.width - (trig.x + trig.width))).toBeLessThan(1);
    expect(Math.abs(pop.y + pop.height - (await box(page, "[data-sk=dock]")).y + 26)).toBeLessThan(1.5);
    await page.click("[data-sk=speed-1\\.5]");
    await page.click("[data-sk=speed-reset]");
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds.slice(-2)).toEqual([{ cmd: "set-speed", speed: 1.5 }, { cmd: "set-speed", speed: 1 }]);
    // the slider is a Radix-style slider: keys move it by 0.05 and commit
    await page.focus("[data-sk=popover-speed] [role=slider]");
    await page.keyboard.press("End");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-speed", speed: 3 } });
    await page.keyboard.press("ArrowLeft");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-speed", speed: 2.95 } });
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-sk=popover-speed]", { state: "detached" });
    await page.context().close();
  });

  test("voice popover lists voices, filters, selects and previews (B16)", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.evaluate(() => { (window as any).__voices = [
      { id: "af_heart", name: "Heart", desc: "US English", quality: "A" },
      { id: "af_bella", name: "Bella", desc: "US English", quality: "A-" },
      { id: "bf_emma", name: "Emma", desc: "UK English", quality: "B-" },
    ]; });
    await page.click("[data-sk=dock-voice]");
    await page.waitForSelector("[data-sk=popover-voice]");
    await page.waitForSelector("[data-sk=popover-voice] .sk-vrow");
    expect(await page.locator("[data-sk=popover-voice] .sk-pop-count").textContent()).toBe("3 voices");
    expect(await page.locator("[data-sk=popover-voice] .sk-vrow.is-selected b").textContent()).toBe("Heart");
    await page.fill("[data-sk=popover-voice] input", "emm");
    expect(await page.locator("[data-sk=popover-voice] .sk-vrow").count()).toBe(1);
    await page.fill("[data-sk=popover-voice] input", "bel");
    await page.click("[data-sk=popover-voice] .sk-vrow [data-sk=voice-preview]");
    expect((await sent(page)).at(-1)).toEqual({ t: "preview-voice", voice: "af_bella" });
    await page.click("[data-sk=popover-voice] .sk-vrow b");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-voice", voice: "af_bella" } });
    expect(await page.locator("[data-sk=dock-voice] .lm-avatar").textContent()).toBe("B");
    await page.context().close();
  });

  test("menu: Hide on this site stores the rule and removes the controls", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-more]");
    await page.click("[data-sk=menu-hide-site]");
    await page.waitForFunction((k: string) => (window as any).__store[k]?.sites?.["sk.test"] === "hide-controls", KEY);
    await page.waitForSelector("[data-sk=dock]", { state: "detached" });
    expect(await page.locator("[data-sk=toast]").textContent()).toContain("Controls hidden");
    await page.context().close();
  });
});

describe("selection bubble (B1)", () => {
  test("appears 8 px above the selection, reads only the selection, copies, hides on collapse", async () => {
    const page = await open();
    await page.waitForSelector("[data-sk=launcher-tab]");
    const target = await page.evaluate(() => {
      const t = document.getElementById("p1")!.firstChild as Text;
      const r = document.createRange();
      r.setStart(t, t.data.indexOf("Notes, documents"));
      r.setEnd(t, t.data.indexOf("Small models"));
      const g = getSelection()!;
      g.removeAllRanges();
      g.addRange(r);
      const first = r.getClientRects()[0]!;
      const b = r.getBoundingClientRect();
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      return { top: first.top, cx: b.left + b.width / 2 };
    });
    await page.waitForSelector("[data-sk=bubble]");
    const b = await box(page, "[data-sk=bubble]");
    expect(b.height).toBe(40);
    expect(Math.abs(b.y + b.height - (target.top - 8))).toBeLessThan(1);
    expect(Math.abs(b.x + b.width / 2 - target.cx)).toBeLessThan(2);
    await page.hover("[data-sk=bubble-listen]");
    expect(await page.locator("[data-sk=bubble] .lm-tooltip").innerText()).toContain("Ctrl+Shift+S");
    await page.click("[data-sk=bubble-listen]");
    const doc = await lastPlay(page);
    expect(doc.source).toBe("selection");
    expect(doc.sentences[0].text).toBe("Notes, documents and even voices lived on someone else's server, rented back to us by the month.");
    expect(doc.sentences.at(-1).text).toBe("Lately that answer has started to wobble.");
    await page.waitForSelector("[data-sk=bubble]", { state: "detached" });
    await page.context().close();
  });

  test("bubble settings button opens the speed popover; selection collapse hides the bubble", async () => {
    const page = await open();
    await page.evaluate(() => {
      const t = document.getElementById("p2")!.firstChild as Text;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 20);
      getSelection()!.removeAllRanges(); getSelection()!.addRange(r);
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await page.waitForSelector("[data-sk=bubble]");
    await page.click("[data-sk=bubble-settings]");
    await page.waitForSelector("[data-sk=popover-speed]");
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await page.waitForSelector("[data-sk=bubble]", { state: "detached" });
    await page.context().close();
  });

  test("show.bubble off never shows it", async () => {
    const page = await open(base({ show: { bubble: false } }));
    await page.evaluate(() => {
      const t = document.getElementById("p2")!.firstChild as Text;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 20);
      getSelection()!.addRange(r);
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=bubble]").count()).toBe(0);
    await page.context().close();
  });
});

/** The paragraph buttons only show on a page where a reading has been started: pretend one ran and ended. */
const engage = async (page: any) => {
  await deliver(page, { t: "state", state: st({ status: "paused", docId: "none" }) });
  await deliver(page, { t: "state", state: st({ status: "idle", docId: "none" }) });
};

describe("paragraph gutter (B2)", () => {
  test("hover tints the paragraph and shows a 32 px play button 48 px to its left; click reads from that paragraph", async () => {
    const page = await open();
    await engage(page);
    await page.hover("#p2");
    await page.waitForSelector("[data-sk=gutter-play]");
    const p = await box(page, "#p2");
    const g = await box(page, "[data-sk=gutter-play]");
    expect([g.width, g.height]).toEqual([32, 32]);
    expect(Math.abs(g.x - (p.x - 48))).toBeLessThan(1);
    expect(Math.abs(g.y - (p.y + 2))).toBeLessThan(1);
    const tint = await box(page, ".sk-tint");
    expect([Math.round(tint.x), Math.round(tint.y), Math.round(tint.width), Math.round(tint.height)]).toEqual([Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)]);
    await page.mouse.move(g.x + 16, g.y + 16);
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(1);
    await page.click("[data-sk=gutter-play]");
    const doc = await lastPlay(page);
    expect(doc.source).toBe("from-here");
    expect(doc.sentences[doc.startIndex].text).toBe("The appeal is simple.");
    await page.context().close();
  });

  test("hovering the nav, aside or footer shows no gutter; leaving hides it", async () => {
    const page = await open();
    await engage(page);
    await page.hover("aside p");
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    await page.hover("#p3");
    await page.waitForSelector("[data-sk=gutter-play]");
    await page.mouse.move(1200, 600);
    await page.waitForSelector("[data-sk=gutter-play]", { state: "detached" });
    await page.context().close();
  });

  test("on the paragraph being read the button says so, is aria-disabled and ignores clicks; another paragraph gets the normal button", async () => {
    const page = await open();
    const doc = await startPage(page);
    const second = doc.sentences.findIndex((x: any) => x.text === "The appeal is simple.");
    await deliver(page, { t: "state", state: st({ docId: doc.docId, sentenceIndex: second, status: "playing" }) });
    await page.hover("#p2");
    const btn = page.locator("[data-sk=gutter-play]");
    await btn.waitFor();
    expect(await btn.getAttribute("data-state")).toBe("reading");
    expect(await btn.getAttribute("aria-label")).toBe("Reading this paragraph");
    expect(await btn.getAttribute("aria-disabled")).toBe("true");
    const before = (await sent(page)).filter((m) => m.t === "player" && m.command.cmd === "play").length;
    await btn.click({ force: true });
    expect((await sent(page)).filter((m) => m.t === "player" && m.command.cmd === "play").length).toBe(before);
    await page.hover("#p3");
    await page.waitForFunction(() => document.querySelector("speakkit-ui")!.shadowRoot!.querySelector("[data-sk=gutter-play]")!.getAttribute("data-state") === "idle");
    expect(await btn.getAttribute("aria-label")).toBe("Read from here");
    await page.context().close();
  });

  test("show.gutter off never shows it", async () => {
    const page = await open(base({ show: { gutter: false } }));
    await page.hover("#p2");
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    await page.context().close();
  });
});

describe("in-page keys, toast", () => {
  test("arrows, space and escape control reading; nothing is hijacked when idle or typing", async () => {
    const page = await open();
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "q"; document.body.append(i); });
    await page.keyboard.press("ArrowRight");
    expect((await sent(page)).filter((m) => m.t === "player")).toEqual([]);
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    for (const k of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", " ", "Escape"]) await page.keyboard.press(k);
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds).toEqual([{ cmd: "next-block" }, { cmd: "prev-block" }, { cmd: "set-speed", speed: 1.3 }, { cmd: "set-speed", speed: 1.2 }, { cmd: "toggle" }, { cmd: "stop" }]);
    await page.focus("#q");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    expect((await sent(page)).filter((m) => m.t === "player")).toHaveLength(6);
    await page.context().close();
  });

  test("toast shows the message with an action that opens the side panel (B13)", async () => {
    const page = await open();
    await page.waitForSelector("[data-sk=launcher-tab]");
    await deliver(page, { t: "toast", message: "Added to queue · 2 items", kind: "ok", action: "open-sidepanel", actionLabel: "View queue" });
    await page.waitForSelector("[data-sk=toast]");
    const t = await box(page, "[data-sk=toast]");
    expect(t.height).toBeGreaterThanOrEqual(40); // the kit toast
    expect(t.height).toBeLessThanOrEqual(56);
    expect(Math.abs(t.x + t.width / 2 - 640)).toBeLessThan(1);
    expect(Math.abs(t.y + t.height - (720 - 36))).toBeLessThan(1);
    expect(await page.locator("[data-sk=toast]").innerText()).toContain("Added to queue · 2 items");
    await page.click("[data-sk=toast-action]");
    expect((await sent(page)).at(-1)).toEqual({ t: "open-sidepanel" });
    await page.context().close();
  });
});
