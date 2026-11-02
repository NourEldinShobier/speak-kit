import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build } from "vite-plus";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { serveDir } from "../scripts/serve.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let browser: Browser;
let page: Page;
let close: () => void;
const light = (spec: string) => `[data-panel="light"] [data-spec="${spec}"]`;

beforeAll(async () => {
  await build({ configFile: resolve(root, "vite.config.ts"), logLevel: "silent" });
  const s = await serveDir(resolve(root, "out/gallery"));
  close = () => s.server.close();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(s.url);
  await page.waitForSelector("[data-spec]");
});
afterAll(async () => {
  await browser?.close();
  close?.();
});

describe("Toggle (role=switch)", () => {
  test("Space and Enter toggle it, aria-checked follows, focus ring is shown for keyboard focus", async () => {
    const sw = page.locator(`${light("toggle-off")} [role=switch]`);
    await sw.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(sw.getAttribute("aria-checked")).resolves.toBe("false");
    await page.keyboard.press("Space");
    await expect(sw.getAttribute("aria-checked")).resolves.toBe("true");
    await page.keyboard.press("Enter");
    await expect(sw.getAttribute("aria-checked")).resolves.toBe("false");
    const ring = await sw.evaluate((e) => {
      const c = getComputedStyle(e);
      return [c.outlineStyle, c.outlineWidth, c.outlineOffset];
    });
    expect(ring).toEqual(["solid", "1px", "2px"]);
  });

  test("switch is 32x20 with a 16px knob that travels 12px, in every placement", async () => {
    for (const spec of ["pattern-settings-page-toggle-on", "toggle-on"]) {
      const sw = page.locator(`${light(spec)} [role=switch]`);
      expect(await sw.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])).toEqual([32, 20]);
      const knob = sw.locator(".lm-toggle__knob");
      expect(await knob.evaluate((k) => [k.getBoundingClientRect().width, k.getBoundingClientRect().x - (k.parentElement as HTMLElement).getBoundingClientRect().x])).toEqual([16, 14]);
    }
    const off = page.locator(`${light("toggle-off")} .lm-toggle__knob`);
    expect(await off.evaluate((k) => k.getBoundingClientRect().x - (k.parentElement as HTMLElement).getBoundingClientRect().x)).toBe(2);
  });

  test("disabled toggle ignores clicks and dims by opaque greys, not opacity", async () => {
    const sw = page.locator(`${light("toggle-disabled-on")} [role=switch]`);
    await sw.click({ force: true });
    await expect(sw.getAttribute("aria-checked")).resolves.toBe("true");
    expect(await sw.evaluate((e) => [getComputedStyle(e).opacity, getComputedStyle(e).backgroundColor])).toEqual(["1", "rgb(183, 185, 191)"]);
  });
});

describe("Button states (real CSS)", () => {
  test("hover and pressed fills of the white button, hover of the black button", async () => {
    const sec = page.locator(`${light("button-secondary-rest")} button`);
    await sec.hover();
    await page.waitForTimeout(200);
    expect(await sec.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(247, 248, 250)");
    await page.mouse.down();
    await page.waitForTimeout(250);
    expect(await sec.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(240, 240, 240)");
    await page.mouse.up();
    const pri = page.locator(`${light("button-primary-rest")} button`);
    await pri.hover();
    await page.waitForTimeout(200);
    expect(await pri.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("color(srgb 0.12549 0.117647 0.145098 / 0.9)");
    await page.mouse.move(0, 0);
  });

  test("play, pause and stop glyphs are filled with the current colour and keep round joins", async () => {
    const styles = await page.evaluate(() =>
      ["player-play", "player-pause", "player-stop"].map((n) => {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("class", `lm-icon lm-icon--${n}`);
        s.style.color = "rgb(255, 255, 255)";
        document.querySelector('[data-panel="light"]')!.prepend(s);
        const c = getComputedStyle(s);
        const r = [c.fill, c.strokeLinejoin];
        s.remove();
        return r;
      }),
    );
    expect(styles).toEqual(Array(3).fill(["rgb(255, 255, 255)", "round"]));
  });

  test("floating surfaces use the Lockix shadows (ring plus a soft drop, two layers at most)", async () => {
    const shadow = (cls: string) =>
      page.evaluate((c) => {
        const e = document.createElement("div");
        e.className = c;
        document.querySelector('[data-panel="light"]')!.prepend(e);
        const v = getComputedStyle(e).boxShadow;
        e.remove();
        return v;
      }, cls);
    expect(await shadow("lm-menu")).toBe("rgba(0, 0, 0, 0.06) 0px 1px 2px 0px");
    expect(await shadow("lm-dialog")).toBe("rgba(0, 0, 0, 0.1) 0px 0px 0px 1px, rgba(0, 0, 0, 0.07) 0px 4px 12px 0px");
  });

  test("a key chip inside a primary button takes the on-cta text, not the grey tertiary text", async () => {
    const color = await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "lm-btn lm-btn--primary";
      b.innerHTML = '<span class="lm-kbd lm-kbd--sm">Ctrl N</span>';
      document.querySelector('[data-panel="light"]')!.prepend(b);
      const c = getComputedStyle(b.querySelector(".lm-kbd")!).color;
      b.remove();
      return c;
    });
    expect(color).toBe("rgb(250, 250, 250)");
  });

  test("primary icon button (play/pause) keeps a light icon and the primary fill on rest and hover", async () => {
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "t-play";
      b.className = "lm-btn lm-btn--icon lm-btn--primary lm-btn--round";
      b.textContent = "x";
      document.querySelector('[data-panel="light"]')!.prepend(b);
    });
    const b = page.locator("#t-play");
    const read = () => b.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
    expect(await read()).toEqual(["rgb(250, 250, 250)", "rgb(32, 30, 37)"]);
    await b.hover();
    await page.waitForTimeout(200);
    expect(await read()).toEqual(["rgb(250, 250, 250)", "color(srgb 0.12549 0.117647 0.145098 / 0.9)"]);
    await page.mouse.move(0, 0);
    await b.evaluate((e) => e.remove());
  });

  test("focus-visible shows a 1px accent outline only for keyboard focus", async () => {
    const b = page.locator(`${light("button-ghost-rest")} button`);
    await b.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(250);
    expect(await b.evaluate((e) => [getComputedStyle(e).outlineWidth, getComputedStyle(e).outlineColor])).toEqual(["1px", "rgb(0, 105, 204)"]);
    await page.mouse.click(5, 5);
    await b.click();
    expect(await b.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("none");
  });

  test("disabled is 50% and not clickable; loading keeps the width", async () => {
    const dis = page.locator(`${light("button-primary-disabled")} button`);
    expect(await dis.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.5");
    expect(await dis.isDisabled()).toBe(true);
    const w = (spec: string) => page.locator(`${light(spec)} button`).evaluate((e) => e.getBoundingClientRect().width);
    expect(await w("button-primary-loading")).toBe(await w("button-primary-rest"));
    expect(await w("icon-button-loading")).toBe(await w("icon-button-rest"));
  });

  test("reduced motion stops the spinner loop", async () => {
    const spin = page.locator(`${light("button-primary-loading")} .lm-spin`);
    expect(await spin.evaluate((e) => getComputedStyle(e).animationName)).toBe("lm-spin");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await spin.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("motion tokens: leaving a state 83ms ease-in, entering 167ms ease-out", async () => {
    const b = page.locator(`${light("button-ghost-rest")} button`);
    await b.evaluate((e) => e.blur());
    await page.mouse.move(0, 0);
    expect(await b.evaluate((e) => getComputedStyle(e).transitionDuration.split(",")[0])).toBe("0.083s");
    await b.hover();
    await page.waitForTimeout(250);
    expect(await b.evaluate((e) => getComputedStyle(e).transitionDuration.split(",")[0])).toBe("0.167s");
    await page.mouse.move(0, 0);
  });
});

describe("Lockix geometry", () => {
  /** Mounts markup in the light panel and returns the [width, height] of every matching element. */
  const boxes = (html: string, sel: string) =>
    page.evaluate(
      ([h, q]) => {
        const host = document.createElement("div");
        host.innerHTML = h!;
        document.querySelector('[data-panel="light"]')!.prepend(host);
        host.getAnimations({ subtree: true }).forEach((a) => a.finish());
        const out = [...host.querySelectorAll(q!)].map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]);
        host.remove();
        return out;
      },
      [html, sel] as const,
    );
  const heights = async (html: string, sel: string) => (await boxes(html, sel)).map((x) => x[1]);

  test("buttons are 36, 28, 24 and 40 high; icon buttons are square", async () => {
    const html = ["", " lm-btn--sm", " lm-btn--xs", " lm-btn--xl"].map((c) => `<button class="lm-btn lm-btn--secondary${c}">Go</button><button class="lm-btn lm-btn--icon${c}"></button>`).join("");
    const b = await boxes(html, "button");
    expect(b.map((x) => x[1])).toEqual([36, 36, 28, 28, 24, 24, 40, 40]);
    expect([b[1], b[3], b[5], b[7]]).toEqual([
      [36, 36],
      [28, 28],
      [24, 24],
      [40, 40],
    ]);
  });

  test("checkbox and radio boxes are 16x16, the check glyph is 12px", async () => {
    const html =
      '<label class="lm-check"><input class="lm-check__input" type="checkbox" checked><span class="lm-check__box"><svg class="lm-icon lm-icon--check" style="--s:12" viewBox="0 0 24 24"><path d="M5 12l5 5l10 -10"/></svg></span></label><label class="lm-radio"><input class="lm-check__input" type="radio" checked><span class="lm-check__box"></span></label>';
    expect(await boxes(html, ".lm-check__box")).toEqual([
      [16, 16],
      [16, 16],
    ]);
    expect(await boxes(html, ".lm-icon")).toEqual([[12, 12]]);
    const look = await page.evaluate((h) => {
      const host = document.createElement("div");
      host.innerHTML = h;
      document.querySelector('[data-panel="light"]')!.prepend(host);
      const r = [...host.querySelectorAll(".lm-check__box")].map((e) => getComputedStyle(e).borderRadius + " " + getComputedStyle(e).backgroundColor);
      host.remove();
      return r;
    }, html);
    expect(look).toEqual(["5px rgb(32, 30, 37)", "9999px rgb(32, 30, 37)"]);
  });

  test("segmented control: track 36 with 32px items (sm 28 with 24px items)", async () => {
    const seg = (c: string) => `<div class="lm-seg${c}"><button class="lm-seg__opt" aria-checked="true">On</button><button class="lm-seg__opt" aria-checked="false">Off</button></div>`;
    expect(await heights(seg(""), ".lm-seg, .lm-seg__opt")).toEqual([36, 32, 32]);
    expect(await heights(seg(" lm-seg--sm"), ".lm-seg, .lm-seg__opt")).toEqual([28, 24, 24]);
  });

  test("input and select trigger are 36 high (sm 28); status pill 20; menu item 28; tooltip 28", async () => {
    expect(await heights('<div class="lm-input"><input class="lm-input__field"></div><div class="lm-input lm-input--sm"></div>', ".lm-input")).toEqual([36, 28]);
    expect(await heights('<button class="lm-select__trigger">A</button>', ".lm-select__trigger")).toEqual([36]);
    expect(await heights('<span class="lm-pill lm-pill--green">Read</span><span class="lm-badge">2</span>', "span")).toEqual([20, 20]);
    expect(await heights('<div class="lm-menu"><button class="lm-menu__item">Copy</button></div>', ".lm-menu__item")).toEqual([28]);
    expect(await heights('<span class="lm-tooltip">Play</span>', ".lm-tooltip")).toEqual([28]);
  });

  test("radius follows the container level: dialog 16, menu 10, control 8, chip 6", async () => {
    const r = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = '<div class="lm-dialog"></div><div class="lm-menu"></div><button class="lm-btn"></button><button class="lm-btn lm-btn--xs"></button>';
      document.querySelector('[data-panel="light"]')!.prepend(host);
      const out = [...host.children].map((e) => getComputedStyle(e).borderRadius);
      host.remove();
      return out;
    });
    expect(r).toEqual(["16px", "10px", "8px", "6px"]);
  });
});

describe("Select (Radix)", () => {
  const sel = () => page.locator(`${light("pattern-select-dropdown-select")} .lm-select`);
  const optionFocused = async () => {
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
    await page.waitForTimeout(120); // Radix settles focus and ignores keys for a moment after opening
  };
  const press = async (k: string) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(80);
  };
  const gone = () => sel().locator("[role=listbox]").waitFor({ state: "detached" });
  test("click opens the listbox; arrows + Enter choose; focus returns to the trigger", async () => {
    const trigger = sel().locator("button");
    await trigger.click();
    await expect(trigger.getAttribute("aria-expanded")).resolves.toBe("true");
    const list = sel().locator("[role=listbox]");
    await list.waitFor();
    expect(await list.locator("[role=option]").count()).toBe(2);
    await optionFocused();
    await press("ArrowDown");
    await press("Enter");
    await gone();
    expect(await trigger.innerText()).toBe("Deutsch");
    expect(await trigger.evaluate((e) => e === document.activeElement)).toBe(true);
    await expect(trigger.getAttribute("aria-expanded")).resolves.toBe("false");
  });

  test("Escape closes without changing; outside click closes; ArrowDown on the trigger opens", async () => {
    const trigger = sel().locator("button");
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await sel().locator("[role=listbox]").waitFor();
    await optionFocused();
    await press("ArrowUp");
    await press("Escape");
    await gone();
    expect(await trigger.innerText()).toBe("Deutsch");
    await trigger.click();
    await sel().locator("[role=listbox]").waitFor();
    await page.mouse.click(2, 2);
    await gone();
  });

  test("the current option is marked checked (data-state) with a check mark", async () => {
    const trigger = sel().locator("button");
    await trigger.click();
    const opts = sel().locator("[role=option]");
    await opts.first().waitFor();
    expect(await opts.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(["unchecked", "checked"]);
    expect(await opts.nth(1).locator(".lm-menu__check").count()).toBe(1);
    await page.keyboard.press("Escape");
    await gone();
  });
});

describe("Tabs, Modal", () => {
  test("Tabs: ArrowRight selects the next tab and moves focus (roving tabindex)", async () => {
    const tabs = page.locator(`${light("tabs-underline-default")} [role=tab]`);
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("role") === "tab" && document.activeElement.getAttribute("aria-selected") === "true" && document.activeElement.previousElementSibling !== null,
    );
    expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("aria-selected")))).toEqual(["false", "true", "false"]);
    expect(await tabs.nth(1).evaluate((e) => e === document.activeElement)).toBe(true);
    expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("tabindex")))).toEqual(["-1", "0", "-1"]);
  });

  test("Modal: focus moves in, Tab is trapped, Escape closes and focus returns", async () => {
    const opener = page.locator(`${light("modal-live")} > button, ${light("modal-live")} button`).first();
    await opener.click();
    const dlg = page.locator(".lm-scrim [role=dialog]");
    await dlg.waitFor();
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.tagName === "BUTTON" && !document.activeElement.closest(".lm-scrim"));
    expect(await opener.evaluate((e) => e === document.activeElement)).toBe(true);
  });

  test("icons keep a 1.5px on-screen stroke at every size", async () => {
    const w = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const svg of document.querySelectorAll(".lm-icon")) {
        const s = getComputedStyle(svg).getPropertyValue("--s").trim();
        out[s] = getComputedStyle(svg).strokeWidth;
      }
      return out;
    });
    const n = (s?: string) => parseFloat((s ?? "0").replace("calc(", ""));
    expect(n(w["16"])).toBeCloseTo(2.25, 3);
    expect(n(w["14"])).toBeCloseTo(36 / 14, 3);
    expect(n(w["12"])).toBeCloseTo(3, 3);
  });
});
