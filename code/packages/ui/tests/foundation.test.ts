import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/lumen.css"), "utf8");
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
});
afterAll(async () => {
  await browser?.close();
});

/** Computed values of `props` for the element `sel` inside `html` rendered under the real lumen.css. */
const look = async (html: string, sel: string, props: string[], pseudo?: string): Promise<string[]> => {
  await page.setContent(`<style>${css}</style><div class="lm" style="padding:20px">${html}</div>`);
  return page.evaluate(([s, p, ps]) => {
    const c = getComputedStyle(document.querySelector(s as string)!, (ps as string) || null);
    return (p as string[]).map((n) => c.getPropertyValue(n));
  }, [sel, props, pseudo ?? ""] as const);
};

describe("a) slider", () => {
  const html = '<span class="lm-slider"><span class="lm-slider__track"><span class="lm-slider__range" style="right:50%"></span></span><span class="lm-slider__thumb"></span></span>';
  test("track 4 high, radius 2, #ECECEC", async () => {
    expect(await look(html, ".lm-slider__track", ["height", "border-top-left-radius", "background-color"])).toEqual(["4px", "2px", "rgb(236, 236, 236)"]);
  });
  test("fill #201E25 with radius 2", async () => {
    expect(await look(html, ".lm-slider__range", ["background-color", "border-top-left-radius"])).toEqual(["rgb(32, 30, 37)", "2px"]);
  });
  test("thumb 18, white, 1px inside #C3C6CC border, shadow 0 1 2 at 10%", async () => {
    expect(await look(html, ".lm-slider__thumb", ["width", "height", "background-color", "box-shadow"])).toEqual([
      "18px",
      "18px",
      "rgb(255, 255, 255)",
      "rgb(195, 198, 204) 0px 0px 0px 1px inset, rgba(0, 0, 0, 0.1) 0px 1px 2px 0px",
    ]);
  });
  test("the track is inset by half the thumb so the thumb is centred on the fill end", async () => {
    expect(await look(html, ".lm-slider__track", ["margin-left", "margin-right"])).toEqual(["9px", "9px"]);
  });
  test("progress bars (player, popup, mini player) are a 4px #ECECEC track with a dark fill", async () => {
    const bar = '<div class="lm-progress" style="--p:40"><div class="lm-progress__bar"></div></div>';
    expect(await look(bar, ".lm-progress", ["height", "background-color"])).toEqual(["4px", "rgb(236, 236, 236)"]);
    expect(await look(bar, ".lm-progress__bar", ["background-color"])).toEqual(["rgb(32, 30, 37)"]);
    expect(await look(bar.replace('class="lm-progress"', 'class="lm-progress is-error"'), ".lm-progress__bar", ["background-color"])).toEqual(["rgb(198, 40, 40)"]);
  });
});

describe("b) destructive button", () => {
  const btn = '<button class="lm-btn lm-btn--danger">Delete</button>';
  test("rest: white fill, 1px #E5E5E5 ring, shadow 0 1 2 at 6%, radius 8, text #C62828", async () => {
    expect(await look(btn, "button", ["background-color", "border-top-color", "border-top-width", "box-shadow", "border-top-left-radius", "color"])).toEqual([
      "rgb(255, 255, 255)",
      "rgb(229, 229, 229)",
      "1px",
      "rgba(0, 0, 0, 0.06) 0px 1px 2px 0px",
      "8px",
      "rgb(198, 40, 40)",
    ]);
  });
  test("hover #FEF2F2 with a #F2B8B8 ring, pressed #FDE4E4", async () => {
    const hover = '<button class="lm-btn lm-btn--danger is-hover">Delete</button>';
    expect(await look(hover, "button", ["background-color", "border-top-color"])).toEqual(["rgb(254, 242, 242)", "rgb(242, 184, 184)"]);
    const pressed = '<button class="lm-btn lm-btn--danger is-pressed">Delete</button>';
    expect(await look(pressed, "button", ["background-color"])).toEqual(["rgb(253, 228, 228)"]);
  });
  test("focus is a 2px red ring at 40% outside the button", async () => {
    const focus = '<button class="lm-btn lm-btn--danger is-focus">Delete</button>';
    expect(await look(focus, "button", ["outline-width", "outline-style", "outline-color", "outline-offset"])).toEqual(["2px", "solid", "color(srgb 0.776471 0.156863 0.156863 / 0.4)", "0px"]);
  });
  test("disabled keeps the white button and dims only the text to 40%", async () => {
    expect(await look('<button class="lm-btn lm-btn--danger" disabled>Delete</button>', "button", ["opacity", "color", "background-color"])).toEqual(["1", "color(srgb 0.776471 0.156863 0.156863 / 0.4)", "rgb(255, 255, 255)"]);
  });
  test("there is no filled red button class", () => {
    expect(css).not.toContain("danger-solid");
  });
});

describe("c) keyboard chip", () => {
  const props = ["background-color", "border-top-width", "border-top-left-radius", "height", "padding-left", "padding-right", "color", "font-size", "font-weight"];
  test("small chip: #ECECEC, no border, radius 4, 16 high, 6 side padding, #5F6A7D Inter Medium 12", async () => {
    expect(await look('<kbd class="lm-kbd lm-kbd--sm">Ctrl K</kbd>', "kbd", props)).toEqual(["rgb(236, 236, 236)", "0px", "4px", "16px", "6px", "6px", "rgb(95, 106, 125)", "12px", "500"]);
  });
  test("inside a dark primary button: #3A3841, white 11, 18 high", async () => {
    const html = '<button class="lm-btn lm-btn--primary">New reading <kbd class="lm-kbd lm-kbd--sm">N</kbd></button>';
    expect(await look(html, "kbd", ["background-color", "color", "font-size", "height"])).toEqual(["rgb(58, 56, 65)", "rgb(255, 255, 255)", "11px", "18px"]);
  });
});

describe("d) cards", () => {
  test("white, 1px #E5E5E5 ring, shadow 0 1 2 at 6%, radius 8", async () => {
    expect(await look('<div class="lm-card"><div class="lm-row">A</div></div>', ".lm-card", ["background-color", "box-shadow", "border-top-left-radius"])).toEqual([
      "rgb(255, 255, 255)",
      "rgb(229, 229, 229) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 1px 2px 0px",
      "8px",
    ]);
  });
});

describe("e) floating cards", () => {
  const props = ["border-top-width", "border-top-color", "box-shadow", "overflow-x"];
  test("menu: one 1px #E5E5E5 border and one shadow 0 2 6 at 6%", async () => {
    expect(await look('<div class="lm-menu"><button class="lm-menu__item">Copy</button></div>', ".lm-menu", props)).toEqual(["1px", "rgb(229, 229, 229)", "rgba(0, 0, 0, 0.06) 0px 2px 6px 0px", "visible"]);
  });
  test("popover has the same border and shadow", async () => {
    expect(await look('<div class="lm-popover">A</div>', ".lm-popover", props)).toEqual(["1px", "rgb(229, 229, 229)", "rgba(0, 0, 0, 0.06) 0px 2px 6px 0px", "visible"]);
  });
  test("a surface without a border (toast) gets the 1px ring plus the same drop, not a second border", async () => {
    expect(await look('<div class="lm-toast">A</div>', ".lm-toast", ["border-top-width", "box-shadow"])).toEqual(["0px", "rgb(229, 229, 229) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 2px 6px 0px"]);
  });
  test("the current row is full width, radius 6, with the check mark at the right", async () => {
    const html =
      '<div class="lm-menu" style="width:200px"><div class="lm-menu__item" data-state="checked"><span class="lm-menu__label">Serif</span><span class="lm-menu__check">x</span></div></div>';
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

describe("f) control sizing and the row helper", () => {
  const heights = async (html: string, sel: string): Promise<number[]> => {
    await page.setContent(`<style>${css}</style><div class="lm" style="padding:20px">${html}</div>`);
    return page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().height), sel);
  };
  test("default input, select trigger and button are 36 high; the 36 icon button is 36 x 36", async () => {
    expect(await heights('<div class="lm-input"><input class="lm-input__field"></div><button class="lm-select__trigger">A</button><button class="lm-btn lm-btn--secondary">Go</button>', ".lm-input, .lm-select__trigger, .lm-btn")).toEqual([36, 36, 36]);
    await page.setContent(`<style>${css}</style><div class="lm"><button id="b" class="lm-btn lm-btn--icon"></button></div>`);
    expect(await page.evaluate(() => [document.getElementById("b")!.offsetWidth, document.getElementById("b")!.offsetHeight])).toEqual([36, 36]);
  });
  test("the search field's inner input has no outline when focused; the frame shows the focus", async () => {
    await page.setContent(`<style>${css}</style><div class="lm"><div class="lm-input"><input class="lm-input__field"></div></div>`);
    await page.focus("input");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const out = await page.evaluate(() => [getComputedStyle(document.querySelector("input")!).outlineStyle, getComputedStyle(document.querySelector(".lm-input")!).borderTopColor]);
    expect(out).toEqual(["none", "rgb(23, 23, 23)"]);
  });
  test(".lm-row--control is 68 high with 16 px above, below and right, the title block centred", async () => {
    const html = '<div class="lm-card" style="width:600px"><div class="lm-row lm-row--control"><div class="lm-row__text"><div class="lm-row__label">Language</div></div><div class="lm-row__control"><button class="lm-btn lm-btn--secondary">English</button></div></div></div>';
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
  test("a row holding a 36 px dropdown gets the same 68 without the class; a toggle row stays 42", async () => {
    const row = (c: string) => `<div class="lm-card" style="width:600px"><div class="lm-row"><div class="lm-row__text"><div class="lm-row__label">A</div></div><div class="lm-row__control">${c}</div></div></div>`;
    expect(await heights(row('<div class="lm-select"><button class="lm-select__trigger">A</button></div>'), ".lm-row")).toEqual([68]);
    expect(await heights(row('<button class="lm-toggle" role="switch" aria-checked="false"><span class="lm-toggle__knob"></span></button>'), ".lm-row")).toEqual([42]);
  });
});

describe("g) segmented control", () => {
  const html = '<div class="lm-seg" style="width:240px"><button class="lm-seg__opt" aria-checked="true">Serif</button><button class="lm-seg__opt" aria-checked="false">Sans</button></div>';
  test("container 32 high, radius 8, #ECECEC, 2px padding", async () => {
    expect(await look(html, ".lm-seg", ["height", "border-top-left-radius", "background-color", "padding-top", "padding-left"])).toEqual(["32px", "8px", "rgb(236, 236, 236)", "2px", "2px"]);
  });
  test("tabs fill the container width and its inner height", async () => {
    await page.setContent(`<style>${css}</style><div class="lm">${html}</div>`);
    const m = await page.evaluate(() => [...document.querySelectorAll(".lm-seg__opt")].map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
    expect(m).toEqual([
      [117, 28],
      [117, 28],
    ]);
  });
  test("selected tab is white, radius 6, shadow 0 1 3, no border colour", async () => {
    expect(await look(html, '.lm-seg__opt[aria-checked="true"]', ["background-color", "border-top-left-radius", "box-shadow", "border-top-color"])).toEqual([
      "rgb(255, 255, 255)",
      "6px",
      "rgba(0, 0, 0, 0.12) 0px 1px 3px 0px",
      "rgba(0, 0, 0, 0)",
    ]);
  });
});
