import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const hook = (app: ElectronApplication, fn: string, ...a: unknown[]) =>
  app.evaluate((_, [f, args]) => (globalThis as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>).__speakkit![f as string]!(...(args as unknown[])), [fn, a] as const);

/** Runs in the page: the rectangle and the computed spacing of the first element that matches. */
const probe = (p: Page, sel: string) =>
  p.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e);
    const px = (v: string) => Number.parseFloat(v);
    return { x: r.x, y: r.y, w: r.width, h: r.height, pad: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map(px), gap: px(c.rowGap) || 0, radius: c.borderTopLeftRadius };
  }, sel);

const box = (p: Page, sel: string) => probe(p, sel).then((b) => b!);

describe("spacing and radius on Windows (data-platform=win32; the macOS values are pinned in packages/ui)", () => {
  it("main window: title bar 38, panel 8 px from the right and bottom edges and 4 px from the sidebar, page header and body spacing, panel 8 / card 8 / dialog 10 / menu 10", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await l.page.evaluate(() => document.documentElement.dataset.platform)).toBe("win32");
    const [w, h] = await l.page.evaluate(() => [innerWidth, innerHeight]);
    expect(await box(l.page, ".sk-title")).toMatchObject({ h: 38, pad: [0, 0, 0, 8] });
    expect(await box(l.page, ".sk-search")).toMatchObject({ w: 420, h: 30, radius: "8px" });
    // Sidebar: items 36 high, 2 apart, 8 from the window edge and 8 from the panel.
    expect(await box(l.page, ".sk-side")).toMatchObject({ x: 0, w: 248, pad: [2, 4, 2, 8] });
    expect(await box(l.page, ".sk-side .lm-nav__item")).toMatchObject({ x: 8, w: 236, h: 36, radius: "8px" });
    const main = await box(l.page, ".sk-main");
    expect([main.x, main.y, w! - (main.x + main.w), h! - (main.y + main.h), main.radius]).toEqual([252, 38, 8, 8, "8px"]);
    // The sidebar ends 8 px above the window bottom too, and no footer band exists.
    const side = await box(l.page, ".sk-side");
    expect([side.y, h! - (side.y + side.h)]).toEqual([38, 8]);
    expect(await l.page.locator(".sk-footer").count()).toBe(0);
    // Search field: border and no shadow; the key chip is grey, borderless, 16 high and 7 px from the field's right, top and bottom.
    const search = await box(l.page, ".sk-search");
    const kbd = await box(l.page, ".sk-search .lm-kbd");
    // rounded: on a scaled screen the 1 px border is one device pixel (0.67 px)
    expect([kbd.h, kbd.y - search.y, search.y + search.h - (kbd.y + kbd.h), search.x + search.w - (kbd.x + kbd.w), kbd.radius].map((v) => (typeof v === "number" ? Math.round(v) : v))).toEqual([
      16,
      7,
      7,
      7,
      "4px",
    ]);
    expect(
      await l.page.locator(".sk-search").evaluate((e) => [getComputedStyle(e).boxShadow, getComputedStyle(e).borderTopColor, Number.parseFloat(getComputedStyle(e).borderTopWidth) > 0.5]),
    ).toEqual(["none", "rgb(229, 229, 229)", true]);
    expect(
      await l.page.locator(".sk-search .lm-kbd").evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopWidth, getComputedStyle(e).color, getComputedStyle(e).fontWeight]),
    ).toEqual(["rgb(236, 236, 236)", "0px", "rgb(95, 106, 125)", "500"]);
    // New reading: 36 high, a solid 18 high chip 9 px from the top, bottom and right, the plus box 9 from the left, the label on the nav labels.
    const btn = await box(l.page, ".sk-side .lm-btn--primary");
    const chip = await box(l.page, ".sk-side .lm-btn--primary .lm-kbd");
    expect([btn.h, chip.h, chip.y - btn.y, btn.y + btn.h - (chip.y + chip.h), btn.x + btn.w - (chip.x + chip.w)].map(Math.round)).toEqual([36, 18, 9, 9, 9]);
    expect(await l.page.locator(".sk-side .lm-btn--primary .lm-kbd").evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopWidth, getComputedStyle(e).fontSize])).toEqual([
      "color(srgb 0.226059 0.219118 0.243412)",
      "0px",
      "11px",
    ]);
    const labelX = (sel: string) =>
      l.page
        .locator(sel)
        .first()
        .evaluate((e) => {
          const r = document.createRange();
          r.selectNodeContents(e);
          return r.getBoundingClientRect().x;
        });
    expect(await labelX(".sk-side .lm-btn--primary .sk-side__grow")).toBe(await labelX(".sk-side .lm-nav__item .lm-nav__label"));
    // Page: header 22 from the top, 28 inset, 16 between header and body, title 22/26, subtitle 13/17.
    expect(await box(l.page, ".sk-page")).toMatchObject({ pad: [22, 28, 24, 28], gap: 16 });
    expect(await box(l.page, ".sk-page__head h1")).toMatchObject({ y: 60, h: 26 });
    expect(await box(l.page, ".sk-page__head p")).toMatchObject({ y: 90, h: 17 });
    expect(await box(l.page, ".sk-stat")).toMatchObject({ y: 123, pad: [14, 16, 14, 16], radius: "8px" });
    // Command palette: a dialog (10 on Windows) with a menu list (10).
    await l.page.keyboard.press("Control+K");
    await l.page.locator(".sk-pal__box").waitFor();
    expect(await box(l.page, ".sk-pal__box")).toMatchObject({ radius: "10px" });
    expect(await box(l.page, ".sk-pal__list .lm-menu")).toMatchObject({ radius: "10px" });
    await l.page.keyboard.press("Escape");
  });

  it("settings rows are 42 high without a description, 58 with one and 68 with a 36 px control", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.locator(".lm-row").first().waitFor();
    const measure = () =>
      l.page.evaluate(() =>
        [...document.querySelectorAll(".lm-row")].map((r) => {
          const control = !!r.querySelector(".lm-select, .lm-btn, .lm-input, .lm-seg");
          let kind = r.querySelector(".lm-row__desc") ? "desc" : "plain";
          if (control) kind = "control";
          return [kind, r.getBoundingClientRect().height] as const;
        }),
      );
    const rows = [...(await measure())];
    await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Storage" }).click();
    await l.page.getByText("Voice models").waitFor();
    rows.push(...(await measure()));
    for (const kind of ["plain", "desc", "control"])
      expect(
        rows.filter(([k]) => k === kind),
        kind,
      ).not.toHaveLength(0);
    const min = (kind: string) => Math.min(...rows.filter(([k]) => k === kind).map(([, v]) => v));
    expect([min("plain"), min("desc"), min("control")]).toEqual([42, 58, 68]);
  });

  it("tray panel: 24 px page padding, 10 px radius, 32 px head with the 20 px logo 6 px from the top and left; mini player 10 px", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_LATENCY_MS: "250" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const open = async (part: string, hookFn: string) => {
      const win = l.app.waitForEvent("window", { predicate: (w) => w.url().includes(part), timeout: 15_000 });
      await hook(l.app, hookFn, ...(hookFn === "readText" ? ["One short sentence here. A second sentence follows it."] : []));
      return win;
    };
    const mini = await open("mini.html", "readText");
    await mini.getByTestId("mini").waitFor();
    expect(await box(mini, ".mini")).toMatchObject({ x: 24, y: 24, radius: "10px" });
    const panel = await open("panel.html", "togglePanel");
    await panel.getByTestId("tray-panel").waitFor();
    expect(await box(panel, ".panel")).toMatchObject({ x: 24, y: 24, radius: "10px", pad: [0, 8, 8, 8] });
    expect(await box(panel, ".panel__head")).toMatchObject({ h: 32 });
    expect(await box(panel, ".panel__head .lm-logo")).toMatchObject({ x: 30, y: 30, w: 20, h: 20 });
    expect(await box(panel, ".panel__now")).toMatchObject({ radius: "8px" });
  });
});

describe("title bar on macOS (data-platform=darwin set by hand; Windows keeps its native caption buttons)", () => {
  it("the right group runs to the far right with equal right and top gaps while the search box stays centred", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.evaluate(() => (document.documentElement.dataset.platform = "darwin"));
    const bell = await box(l.page, ".sk-bell");
    const search = await box(l.page, ".sk-search");
    const toggle = await box(l.page, ".sk-title__l button");
    const w = await l.page.evaluate(() => innerWidth);
    expect(w - (bell.x + bell.w)).toBe(8); // the bell's right edge lines up with the panel's right edge, 8 px from the window edge
    expect(bell.y).toBe(5); // 28 px button centred in the 38 px bar
    expect(Math.round(search.x + search.w / 2)).toBe(Math.round(w / 2));
    expect(toggle.x).toBeGreaterThanOrEqual(78); // clear of the traffic lights
  });
});
