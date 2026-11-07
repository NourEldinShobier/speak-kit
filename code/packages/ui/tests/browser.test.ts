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

  test("a key chip inside a primary button is white on #3A3841, not the grey tertiary text", async () => {
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
});

describe("kit geometry", () => {
  test("hover fills are concentric with their container on both platforms: inner radius is below the outer one, at least 4", async () => {
    const measure = (platform: string) =>
      page.evaluate((pf) => {
        const root = document.documentElement;
        root.dataset.platform = pf;
        const host = document.createElement("div");
        host.innerHTML =
          '<div class="lm-menu" id="m"><button class="lm-menu__item">Copy</button></div>' +
          '<div class="lm-card" id="c"><button class="lm-listrow">First</button><button class="lm-listrow">Last</button></div>' +
          '<div class="lm-seg" id="s"><button class="lm-seg__opt">A</button></div>' +
          '<div class="lm-dialog" id="d"><div class="lm-menu__item" style="border-radius: var(--radius-palette-item)">Row</div></div>';
        document.querySelector('[data-panel="light"]')!.prepend(host);
        const px = (e: Element, prop: string) => parseFloat(getComputedStyle(e).getPropertyValue(prop));
        const q = (s: string) => host.querySelector(s)!;
        const rows = [...q("#c").children];
        const out = {
          menu: [px(q("#m"), "border-top-left-radius"), px(q(".lm-menu__item"), "border-top-left-radius")],
          select: [px(q("#m"), "border-top-left-radius"), px(q("#m .lm-menu__item"), "border-top-left-radius")],
          seg: [px(q("#s"), "border-top-left-radius"), px(q(".lm-seg__opt"), "border-top-left-radius")],
          cardTop: [px(q("#c"), "border-top-left-radius"), px(rows[0]!, "border-top-left-radius")],
          cardBottom: [px(q("#c"), "border-bottom-right-radius"), px(rows[1]!, "border-bottom-right-radius")],
          palette: [px(q("#d"), "border-top-left-radius"), px(q("#d .lm-menu__item"), "border-top-left-radius")],
        };
        host.remove();
        delete root.dataset.platform;
        return out;
      }, platform);
    for (const pf of ["darwin", "win32"]) {
      const r = await measure(pf);
      for (const [name, [outer, inner]] of Object.entries(r)) {
        expect(inner!, `${name} on ${pf}`).toBeLessThan(name.startsWith("card") ? outer! + 0.01 : outer!);
        expect(inner!, `${name} on ${pf}`).toBeGreaterThanOrEqual(4);
      }
    }
    expect((await measure("win32")).palette).toEqual([10, 4]);
    expect((await measure("darwin")).palette).toEqual([16, 8]);
    expect((await measure("darwin")).menu).toEqual([10, 6]);
    expect((await measure("darwin")).seg).toEqual([8, 6]);
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

  test("Modal: the control marked data-autofocus takes the initial focus, with no focus ring after a mouse click", async () => {
    const opener = page.locator(light("modal-live") + " button").first();
    await page.mouse.click(2, 2); // earlier tests used the keyboard; a pointer press resets the focus-visible heuristic
    await opener.click();
    const dlg = page.locator(".lm-scrim [role=dialog]");
    await dlg.waitFor();
    const focused = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      return [a.textContent, a.matches(":focus-visible"), getComputedStyle(a).outlineStyle];
    });
    expect(focused).toEqual(["Cancel", false, "none"]); // outline-color is mid-fade right after focus, so the stable signal is that no outline is drawn
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
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

describe("Tactile refinements", () => {
  /** Mounts markup in the light panel, runs fn on the host, removes it. */
  const withHost = async <T>(html: string, fn: (host: HTMLElement) => T): Promise<T> => {
    await page.evaluate((h) => {
      const host = document.createElement("div");
      host.id = "tz-host";
      host.innerHTML = h;
      document.querySelector('[data-panel="light"]')!.prepend(host);
    }, html);
    try {
      return (await page.locator("#tz-host").evaluate(fn)) as T;
    } finally {
      await page.evaluate(() => document.getElementById("tz-host")?.remove());
    }
  };

  /** Contrast ratio of a text colour on a (possibly translucent) fill laid over a backdrop, all as "rgb(a)" strings. */
  const ratio = (fg: string, fill: string, backdrop: string) => {
    // color-mix() results come back as "color(srgb 0.7 0.5 0.1 / 0.16)" with channels in 0..1
    const n = (c: string) => {
      const v = (c.match(/[\d.]+/g) ?? []).map(Number);
      return c.startsWith("color(") ? [v[0]! * 255, v[1]! * 255, v[2]! * 255, ...v.slice(3)] : v;
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3] ?? 1;
      return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a));
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const bg = over(n(fill), n(backdrop));
    const [hi, lo] = [lum(over(n(fg), bg)), lum(bg)].sort((a, b) => b - a);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  test("styles.css has no bare :hover rule: every :hover sits inside (hover: hover) and (pointer: fine)", async () => {
    const r = await page.evaluate(() => {
      const bare: string[] = [];
      let inside = 0;
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(":hover")) bare.push(rule.selectorText);
          if (rule instanceof CSSMediaRule && rule.conditionText.replace(/\s+/g, "") === "(hover:hover)and(pointer:fine)") {
            inside += [...rule.cssRules].filter((x) => x instanceof CSSStyleRule && x.selectorText.includes(":hover")).length;
          }
        }
      }
      return { bare, inside };
    });
    expect(r.bare).toEqual([]);
    expect(r.inside).toBeGreaterThan(15);
  });

  test("forced .is-hover still works outside the media query", async () => {
    const bg = await withHost('<button class="lm-btn lm-btn--secondary is-hover">A</button>', (h) => getComputedStyle(h.firstElementChild!).backgroundColor);
    expect(bg).toBe("rgb(247, 248, 250)");
  });

  test("purple and yellow pill text reach 4.5:1 on their tints, and the tag colours themselves are unchanged", async () => {
    const m = await withHost('<span class="lm-pill lm-pill--purple">A</span><span class="lm-pill lm-pill--yellow">B</span>', (h) =>
      [...h.children].map((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]),
    );
    expect(m.map(([fg, bg]) => ratio(fg!, bg!, "rgb(255, 255, 255)") >= 4.5)).toEqual([true, true]);
    expect(m.map(([fg]) => fg)).toEqual(["rgb(111, 66, 193)", "rgb(128, 96, 10)"]);
    const tags = await page.evaluate(() => ["--tag-purple", "--tag-yellow"].map((t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim()));
    expect(tags).toEqual(["#7a4cd9", "#b8860b"]);
  });

  test("segmented option text on hover and pressed fills reaches 4.5:1; ghost button hover and pressed text too", async () => {
    const seg = await withHost('<div class="lm-seg" style="background:#f0f0f0"><button class="lm-seg__opt is-hover">A</button><button class="lm-seg__opt is-pressed">B</button></div>', (h) =>
      [...h.querySelectorAll("button")].map((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]),
    );
    expect(seg[0]![0]).toBe("rgb(71, 84, 103)");
    expect(seg[1]![0]).toBe("rgb(71, 84, 103)");
    for (const [fg, bg] of seg) expect(ratio(fg!, bg!, "rgb(240, 240, 240)")).toBeGreaterThanOrEqual(4.5);
    const ghost = await withHost('<button class="lm-btn lm-btn--ghost is-hover">A</button><button class="lm-btn lm-btn--ghost is-pressed">B</button>', (h) =>
      [...h.querySelectorAll("button")].map((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]),
    );
    for (const [fg, bg] of ghost) expect(ratio(fg!, bg!, "rgb(255, 255, 255)")).toBeGreaterThanOrEqual(4.5);
  });

  test("segmented label reserves the 500-weight width so selecting does not move it", async () => {
    const seg =
      '<div class="lm-seg"><button class="lm-seg__opt" aria-checked="false"><span class="lm-seg__label" data-label="Medium">Medium</span></button><button class="lm-seg__opt" aria-checked="false"><span class="lm-seg__label" data-label="Slow">Slow</span></button></div>';
    const w = await withHost(seg, (h) => {
      const opts = [...h.querySelectorAll(".lm-seg__opt")];
      const widths = () => opts.map((o) => o.getBoundingClientRect().width);
      const before = widths();
      opts[0]!.setAttribute("aria-checked", "true");
      return { before, after: widths() };
    });
    expect(w.after).toEqual(w.before);
  });

  test("press squeezes lm-seg__opt to 0.97 and small controls to 0.92; reduced motion removes the squeeze", async () => {
    const html =
      '<div class="lm-seg" id="tz-seg"><button class="lm-seg__opt" aria-checked="false">Go</button></div><button class="lm-btn lm-btn--xs" id="tz-xs">x</button><button class="lm-close" id="tz-close"></button>';
    const scale = async (motion: "no-preference" | "reduce") => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.evaluate((h) => {
        const host = document.createElement("div");
        host.id = "tz-host";
        host.innerHTML = h;
        document.querySelector('[data-panel="light"]')!.prepend(host);
      }, html);
      const out: string[] = [];
      for (const sel of ["#tz-seg .lm-seg__opt", "#tz-xs", "#tz-close"]) {
        await page.locator(sel).hover();
        await page.mouse.down();
        await page.waitForTimeout(400);
        out.push(await page.locator(sel).evaluate((e) => getComputedStyle(e).scale));
        await page.mouse.up();
      }
      await page.evaluate(() => document.getElementById("tz-host")!.remove());
      await page.mouse.move(0, 0);
      return out;
    };
    expect(await scale("no-preference")).toEqual(["0.97", "0.92", "0.92"]);
    expect(await scale("reduce")).toEqual(["1", "1", "1"]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }, 20_000); // six presses of 400 ms each plus hovers: about 4 s on a fast machine, over the 5 s default on CI

  test("touch devices get an invisible 44px hit area on small icon buttons; mouse devices do not", async () => {
    const html = '<button class="lm-btn lm-btn--icon lm-btn--xs" aria-label="a"></button><button class="lm-close" aria-label="c"></button>';
    const probe = (h: string) => {
      const host = document.createElement("div");
      host.innerHTML = h;
      document.body.prepend(host);
      return [...host.children].map((e) => [getComputedStyle(e, "::after").width, getComputedStyle(e, "::after").height, e.getBoundingClientRect().width]);
    };
    expect(await page.evaluate(probe, html)).toEqual([
      ["auto", "auto", 24],
      ["auto", "auto", 24],
    ]);
    const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 500, height: 800 } });
    const tp = await touch.newPage();
    await tp.goto(page.url());
    await tp.waitForSelector("[data-spec]");
    const t = await tp.evaluate(probe, html);
    await touch.close();
    expect(t).toEqual([
      ["44px", "44px", 24],
      ["44px", "44px", 24],
    ]);
  });
});
