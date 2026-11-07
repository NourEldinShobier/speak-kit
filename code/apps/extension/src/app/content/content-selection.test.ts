/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vite-plus/test";
import { base, st, deliver, sent, lastPlay, box, startPage, engage, contentSession } from "../../testing/content-page";

const { open } = contentSession();

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
    expect(b.height).toBe(44);
    const parts = await page.evaluate(() => {
      const root = document.querySelector("speakkit-ui")!.shadowRoot!;
      const r = (sel: string) => root.querySelector(sel)!.getBoundingClientRect();
      const bubble = getComputedStyle(root.querySelector("[data-sk=bubble]")!);
      return {
        pad: bubble.padding,
        gap: bubble.columnGap,
        listen: [r("[data-sk=bubble-listen]").height, getComputedStyle(root.querySelector("[data-sk=bubble-listen]")!).paddingLeft],
        settings: [r("[data-sk=bubble-settings]").width, r("[data-sk=bubble-settings]").height, getComputedStyle(root.querySelector("[data-sk=bubble-settings]")!).borderTopLeftRadius],
        copy: [r("[data-sk=bubble-copy]").width, r("[data-sk=bubble-copy]").height],
      };
    });
    expect(parts).toEqual({ pad: "6px", gap: "6px", listen: [32, "14px"], settings: [32, 32, "8px"], copy: [32, 32] });
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
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 20);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
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
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 20);
      getSelection()!.addRange(r);
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=bubble]").count()).toBe(0);
    await page.context().close();
  });
});

/** The paragraph buttons only show on a page where a reading has been started: pretend one ran and ended. */

describe("paragraph gutter (B2)", () => {
  test("hover tints the paragraph and shows a 24 px play button 48 px to its left; click reads from that paragraph", async () => {
    const page = await open();
    await engage(page);
    await page.hover("#p2");
    await page.waitForSelector("[data-sk=gutter-play]");
    const p = await box(page, "#p2");
    const g = await box(page, "[data-sk=gutter-play]");
    expect([g.width, g.height]).toEqual([24, 24]);
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

  test("Escape hides the button without moving the pointer, and it stays hidden until another paragraph is entered", async () => {
    const page = await open();
    await engage(page);
    await page.hover("#p2");
    await page.waitForSelector("[data-sk=gutter-play]");
    await page.keyboard.press("Escape");
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    const b = await box(page, "#p2");
    await page.mouse.move(b.x + 5, b.y + 8);
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    await page.hover("#p3");
    await page.waitForSelector("[data-sk=gutter-play]");
    await page.context().close();
  });

  test("a paragraph reached by keyboard gets its button next in tab order, and Escape returns focus to the link", async () => {
    const page = await open();
    await engage(page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "lk";
      a.href = "#top";
      a.textContent = "a link in the paragraph";
      document.getElementById("p2")!.append(" ", a);
      a.focus();
    });
    await page.waitForSelector("[data-sk=gutter-play]");
    expect(await page.evaluate(() => document.getElementById("lk")!.nextElementSibling?.localName)).toBe("speakkit-ui");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.querySelector("speakkit-ui")!.shadowRoot!.activeElement?.getAttribute("data-sk"))).toBe("gutter-play");
    await page.keyboard.press("Escape");
    expect(await page.locator("[data-sk=gutter-play]").count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("lk");
    expect(await page.evaluate(() => document.documentElement.lastElementChild?.localName)).toBe("speakkit-ui");
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
