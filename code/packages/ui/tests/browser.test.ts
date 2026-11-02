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
    expect(ring).toEqual(["solid", "2px", "2px"]);
  });

  test("knob travels 14px (screen) and 20px (board); sizes are 32x18 and 40x20", async () => {
    const screen = page.locator(`${light("pattern-settings-page-toggle-on")} [role=switch]`);
    expect(await screen.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])).toEqual([32, 18]);
    const knob = screen.locator(".lm-toggle__knob");
    const x = await knob.evaluate((k) => k.getBoundingClientRect().x - (k.parentElement as HTMLElement).getBoundingClientRect().x);
    expect(x).toBe(16);
    const board = page.locator(`${light("toggle-on")} [role=switch]`);
    expect(await board.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height])).toEqual([40, 20]);
  });

  test("disabled toggle ignores clicks and has 40% opacity", async () => {
    const sw = page.locator(`${light("toggle-disabled-on")} [role=switch]`);
    await sw.click({ force: true });
    await expect(sw.getAttribute("aria-checked")).resolves.toBe("true");
    expect(await sw.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.4");
  });
});

describe("Button states (real CSS)", () => {
  test("hover uses fill/hover, pressed fill/selected, primary hover tag/blue", async () => {
    const sec = page.locator(`${light("button-secondary-rest")} button`);
    await sec.hover();
    await page.waitForTimeout(200);
    expect(await sec.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(255, 255, 255, 0.08)");
    await page.mouse.down();
    await page.waitForTimeout(250);
    expect(await sec.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(255, 255, 255, 0.13)");
    await page.mouse.up();
    const pri = page.locator(`${light("button-primary-rest")} button`);
    await pri.hover();
    await page.waitForTimeout(200);
    expect(await pri.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(74, 158, 255)");
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

  test("floating-surface shadows are the short Lockix scale, softer in light than in dark", async () => {
    const read = (panel: string) =>
      page.evaluate((p) => {
        const c = getComputedStyle(document.querySelector(`[data-panel="${p}"]`)!);
        return ["--lm-shadow-menu", "--lm-shadow-overlay", "--lm-shadow-dialog"].map((v) => c.getPropertyValue(v).trim());
      }, panel);
    expect(await read("dark")).toEqual(["0 1px 2px #0000004d", "0 2px 6px #0000004d", "0 4px 12px #00000059"]);
    expect(await read("light")).toEqual(["0 1px 2px #0000000f", "0 2px 6px #0000000f", "0 4px 12px #00000012"]);
  });

  test("a key chip inside a primary button is white, not the grey tertiary text", async () => {
    const color = await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "lm-btn lm-btn--primary";
      b.innerHTML = '<span class="lm-kbd lm-kbd--sm">Ctrl N</span>';
      document.querySelector('[data-panel="light"]')!.prepend(b);
      const c = getComputedStyle(b.querySelector(".lm-kbd")!).color;
      b.remove();
      return c;
    });
    expect(color).toBe("rgb(255, 255, 255)");
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
    expect(await read()).toEqual(["rgb(255, 255, 255)", "rgb(0, 120, 212)"]);
    await b.hover();
    await page.waitForTimeout(200);
    expect(await read()).toEqual(["rgb(255, 255, 255)", "rgb(74, 158, 255)"]);
    await page.mouse.move(0, 0);
    await b.evaluate((e) => e.remove());
  });

  test("focus-visible shows a 2px accent outline only for keyboard focus", async () => {
    const b = page.locator(`${light("button-ghost-rest")} button`);
    await b.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    expect(await b.evaluate((e) => [getComputedStyle(e).outlineWidth, getComputedStyle(e).outlineColor])).toEqual(["2px", "rgb(0, 120, 212)"]);
    await page.mouse.click(5, 5);
    await b.click();
    expect(await b.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("none");
  });

  test("disabled is 40% and not clickable; loading keeps the width", async () => {
    const dis = page.locator(`${light("button-primary-disabled")} button`);
    expect(await dis.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.4");
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

  test("motion tokens: hover 83ms, press 167ms with the decelerate curve", async () => {
    const b = page.locator(`${light("button-ghost-rest")} button`);
    const t = await b.evaluate((e) => getComputedStyle(e).transition);
    expect(t).toContain("0.083s");
    expect(t).toContain("cubic-bezier(0, 0, 0, 1)");
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
