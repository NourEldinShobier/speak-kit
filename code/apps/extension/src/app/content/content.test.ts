/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vite-plus/test";
import { KEY, base, st, deliver, sent, lastPlay, box, startPage, contentSession } from "../../testing/content-page";

const { open } = contentSession();

describe("extraction requests", () => {
  test("replies to extract with a ReadDoc for page, selection and from-here", async () => {
    const page = await open();
    const r = await deliver(page, { t: "extract", mode: "page" });
    expect(r.doc.source).toBe("page");
    expect(r.doc.sentences[0]).toEqual({ text: "The quiet return of local-first software", block: 0 });
    expect(r.doc.startIndex).toBe(0);
    expect(r.doc.url).toBe("http://sk.test/page");
    expect(typeof r.doc.docId).toBe("string");
    await page.evaluate(() => {
      const t = document.getElementById("p3")!.firstChild as Text;
      const g = getSelection()!;
      g.removeAllRanges();
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 26);
      g.addRange(r);
    });
    const sel = await deliver(page, { t: "extract", mode: "selection" });
    expect(sel.doc.source).toBe("selection");
    expect(sel.doc.sentences.map((x: any) => x.text)).toEqual(["None of this is nostalgia."]);
    await page.evaluate(() => {
      const g = getSelection()!;
      g.removeAllRanges();
      const t = document.getElementById("p2")!.firstChild as Text;
      const r = document.createRange();
      r.setStart(t, t.data.indexOf("Nothing leaves"));
      r.collapse(true);
      g.addRange(r);
    });
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

describe("in-page keys, toast", () => {
  test("arrows, space and escape control reading; nothing is hijacked when idle or typing", async () => {
    const page = await open();
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.id = "q";
      document.body.append(i);
    });
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
