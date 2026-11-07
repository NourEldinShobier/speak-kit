import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles.css"), "utf8");
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
});
afterAll(async () => {
  await browser?.close();
});

/** Computed values of `props` for the element `sel` inside `html` rendered under the real styles.css. */
const look = async (html: string, sel: string, props: string[], pseudo?: string): Promise<string[]> => {
  await page.setContent(`<style>${css}</style><div class="lm" style="padding:20px">${html}</div>`);
  return page.evaluate(
    ([s, p, ps]) => {
      const c = getComputedStyle(document.querySelector(s as string)!, (ps as string) || null);
      return (p as string[]).map((n) => c.getPropertyValue(n));
    },
    [sel, props, pseudo ?? ""] as const,
  );
};

describe("slider", () => {
  const html = '<span class="lm-slider"><span class="lm-slider__track"><span class="lm-slider__range" style="right:50%"></span></span><span class="lm-slider__thumb"></span></span>';
  test("the track is inset by half the thumb so the thumb is centred on the fill end", async () => {
    expect(await look(html, ".lm-slider__track", ["margin-left", "margin-right"])).toEqual(["9px", "9px"]);
  });
  test("the track is 240 wide by default and fills its container with lm-progress--block", async () => {
    const wrap = (cls: string) => `<div style="width:500px"><div class="${cls}"><div class="lm-progress__bar"></div></div></div>`;
    expect(await look(wrap("lm-progress"), ".lm-progress", ["width"])).toEqual(["240px"]);
    expect(await look(wrap("lm-progress lm-progress--block"), ".lm-progress", ["width"])).toEqual(["500px"]);
  });
});

describe("destructive button", () => {
  test("focus is a 2px solid #C62828 ring 2px outside the button (5.6:1 on white; the earlier 40% red was 1.97:1)", async () => {
    const focus = '<button class="lm-btn lm-btn--danger is-focus">Delete</button>';
    expect(await look(focus, "button", ["outline-width", "outline-style", "outline-color", "outline-offset"])).toEqual(["2px", "solid", "rgb(198, 40, 40)", "2px"]);
  });
});

describe("search field focus", () => {
  const field = '<div class="lm-input"><input class="lm-input__field is-focus" aria-label="Search"></div>';
  const outline = ["outline-width", "outline-style", "outline-color"];
  test("the field inside the frame keeps a 1px transparent outline, so nothing is drawn normally", async () => {
    expect(await look(field, ".lm-input__field", outline)).toEqual(["1px", "solid", "rgba(0, 0, 0, 0)"]);
  });
  test("in forced colors that outline is drawn in a system colour, so the focused field stays visible", async () => {
    await page.emulateMedia({ forcedColors: "active" });
    const [w, style, color] = await look(field, ".lm-input__field", outline);
    await page.emulateMedia({ forcedColors: "none" });
    expect([w, style]).toEqual(["1px", "solid"]);
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
  });
});

describe("indeterminate progress", () => {
  const bar = '<div class="lm-progress is-indeterminate" style="--p:0"><div class="lm-progress__bar"></div></div>';
  test("moves normally and rests as a static 40% segment under reduced motion", async () => {
    expect(await look(bar, ".lm-progress__bar", ["animation-name", "width"])).toEqual(["lm-indeterminate", "96px"]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const still = await look(bar, ".lm-progress__bar", ["animation-name", "width", "transform"]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(still).toEqual(["none", "96px", "none"]);
  });
});

describe("menu rows", () => {
  test("the current row is full width, radius 6, with the check mark at the right", async () => {
    const html = '<div class="lm-menu" style="width:200px"><div class="lm-menu__item" data-state="checked"><span class="lm-menu__label">Serif</span><span class="lm-menu__check">x</span></div></div>';
    expect(await look(html, ".lm-menu__item", ["background-color", "border-top-left-radius", "width"])).toEqual(["rgb(240, 240, 240)", "6px", "190px"]);
    const check = await page.evaluate(() => {
      const r = document.querySelector(".lm-menu__check")!.getBoundingClientRect();
      const row = document.querySelector(".lm-menu__item")!.getBoundingClientRect();
      return Math.round(row.right - r.right);
    });
    expect(check).toBe(6);
  });
  test("the select list scrolls with a 3px visible thumb that sits 3px from the right edge, and its border and shadow are not clipped", async () => {
    const html = `<div class="lm-menu lm-select__menu" style="width:200px;max-height:100px">${'<div class="lm-menu__item">Row</div>'.repeat(10)}</div>`;
    await page.setContent(`<style>${css}</style><div class="lm" style="padding:20px">${html}</div>`);
    const m = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>(".lm-select__menu")!;
      const thumb = getComputedStyle(e, "::-webkit-scrollbar-thumb");
      const bar = getComputedStyle(e, "::-webkit-scrollbar").width;
      return { bar, endBorder: thumb.borderInlineEndWidth, border: getComputedStyle(e).borderTopWidth, shadow: getComputedStyle(e).boxShadow };
    });
    expect(m).toEqual({ bar: "6px", endBorder: "3px", border: "1px", shadow: "rgba(0, 0, 0, 0.06) 0px 2px 6px 0px" });
  });
});

describe("row helper", () => {
  const heights = async (html: string, sel: string): Promise<number[]> => {
    await page.setContent(`<style>${css}</style><div class="lm" style="padding:20px">${html}</div>`);
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().height), sel);
  };
  test(".lm-row--control is 68 high with 16 px above, below and right, the title block centred", async () => {
    const html =
      '<div class="lm-card" style="width:600px"><div class="lm-row lm-row--control"><div class="lm-row__text"><div class="lm-row__label">Language</div></div><div class="lm-row__control"><button class="lm-btn lm-btn--secondary">English</button></div></div></div>';
    expect(await heights(html, ".lm-row")).toEqual([68]);
    expect(await look(html, ".lm-row", ["padding-top", "padding-bottom", "padding-right", "align-items"])).toEqual(["16px", "16px", "16px", "center"]);
    const gaps = await page.evaluate(() => {
      const r = document.querySelector(".lm-row")!.getBoundingClientRect();
      const b = document.querySelector(".lm-btn")!.getBoundingClientRect();
      const t = document.querySelector(".lm-row__text")!.getBoundingClientRect();
      return [b.top - r.top, r.bottom - b.bottom, r.right - b.right, Math.round(t.top + t.height / 2 - (r.top + r.height / 2))];
    });
    expect(gaps).toEqual([16, 16, 16, 0]);
  });
  test("control rows after the first measure 68 including the divider, with the control 16 px from the row top", async () => {
    const row = `<div class="lm-row lm-row--control"><div class="lm-row__text"><div class="lm-row__label">A</div></div><div class="lm-row__control"><button class="lm-btn lm-btn--secondary">English</button></div></div>`;
    const html = `<div class="lm-card" style="width:600px">${row}${row}${row}</div>`;
    expect(await heights(html, ".lm-row")).toEqual([68, 68, 68]);
    const tops = await page.evaluate(() => [...document.querySelectorAll(".lm-row")].map((r) => Math.round(r.querySelector(".lm-btn")!.getBoundingClientRect().top - r.getBoundingClientRect().top)));
    expect(tops).toEqual([16, 16, 16]);
  });
  test("a row holding a 36 px dropdown gets the same 68 without the class; a toggle row stays 42", async () => {
    const row = (c: string) =>
      `<div class="lm-card" style="width:600px"><div class="lm-row"><div class="lm-row__text"><div class="lm-row__label">A</div></div><div class="lm-row__control">${c}</div></div></div>`;
    expect(await heights(row('<div class="lm-select"><button class="lm-select__trigger">A</button></div>'), ".lm-row")).toEqual([68]);
    expect(await heights(row('<button class="lm-toggle" role="switch" aria-checked="false"><span class="lm-toggle__knob"></span></button>'), ".lm-row")).toEqual([42]);
  });
});

describe("segmented control", () => {
  const html = '<div class="lm-seg" style="width:240px"><button class="lm-seg__opt" aria-checked="true">Serif</button><button class="lm-seg__opt" aria-checked="false">Sans</button></div>';
  test("tabs fill the container width and its inner height", async () => {
    await page.setContent(`<style>${css}</style><div class="lm">${html}</div>`);
    const m = await page.evaluate(() => [...document.querySelectorAll(".lm-seg__opt")].map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
    expect(m).toEqual([
      [117, 28],
      [117, 28],
    ]);
  });
});
