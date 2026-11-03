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
  it("main window: title bar 36, panel 4 px from the edges, page header and body spacing, panel 8 / card 10 / dialog 10 / menu 10", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await l.page.evaluate(() => document.documentElement.dataset.platform)).toBe("win32");
    const [w, h] = await l.page.evaluate(() => [innerWidth, innerHeight]);
    expect(await box(l.page, ".sk-title")).toMatchObject({ h: 36, pad: [0, 0, 0, 8] });
    expect(await box(l.page, ".sk-search")).toMatchObject({ w: 420, h: 28, radius: "8px" });
    // Sidebar: items 36 high, 2 apart, 8 from the window edge and 8 from the panel.
    expect(await box(l.page, ".sk-side")).toMatchObject({ x: 0, w: 248, pad: [2, 4, 4, 8] });
    expect(await box(l.page, ".sk-side .lm-nav__item")).toMatchObject({ x: 8, w: 236, h: 36, radius: "8px" });
    const main = await box(l.page, ".sk-main");
    expect([main.x, main.y, w! - (main.x + main.w), h! - (main.y + main.h), main.radius]).toEqual([252, 36, 4, 4, "8px"]);
    // Page: header 22 from the top, 28 inset, 16 between header and body, title 22/26, subtitle 13/17.
    expect(await box(l.page, ".sk-page")).toMatchObject({ pad: [22, 28, 24, 28], gap: 16 });
    expect(await box(l.page, ".sk-page__head h1")).toMatchObject({ y: 58, h: 26 });
    expect(await box(l.page, ".sk-page__head p")).toMatchObject({ y: 88, h: 17 });
    expect(await box(l.page, ".sk-stat")).toMatchObject({ y: 121, pad: [14, 16, 14, 16], radius: "10px" });
    // Command palette: a dialog (10 on Windows) with a menu list (10).
    await l.page.keyboard.press("Control+K");
    await l.page.locator(".sk-pal__box").waitFor();
    expect(await box(l.page, ".sk-pal__box")).toMatchObject({ radius: "10px" });
    expect(await box(l.page, ".sk-pal__list .lm-menu")).toMatchObject({ radius: "10px" });
    await l.page.keyboard.press("Escape");
  });

  it("settings rows are 42 high without a description and 58 with one", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.locator(".lm-row").first().waitFor();
    const rows = await l.page.evaluate(() => [...document.querySelectorAll(".lm-row")].map((r) => [r.querySelector(".lm-row__desc") ? "desc" : "plain", r.getBoundingClientRect().height] as const));
    expect(rows.filter(([k]) => k === "plain").map(([, v]) => v)).not.toHaveLength(0);
    for (const [k, v] of rows) expect(v, k).toBeGreaterThanOrEqual(k === "desc" ? 58 : 42);
    expect(Math.min(...rows.filter(([k]) => k === "desc").map(([, v]) => v))).toBe(58);
    expect(Math.min(...rows.filter(([k]) => k === "plain").map(([, v]) => v))).toBe(42);
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
    expect(await box(panel, ".panel__now")).toMatchObject({ radius: "10px" });
  });
});
