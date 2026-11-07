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
