import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Page } from "@playwright/test";
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
