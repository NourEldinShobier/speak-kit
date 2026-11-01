import type { Page } from "@playwright/test";
import { test, expect, begin } from "../support/ext";
import { startApp } from "../support/servers";

/** Animations still running that are longer than a flash, as "target: duration ms x iterations", through open shadow roots. */
const motion = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const scan = (root: Document | ShadowRoot) => {
      for (const a of root.getAnimations()) {
        const t = a.effect?.getComputedTiming();
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (t && a.playState === "running" && Number(t.duration) > 50) out.push(`${target?.tagName.toLowerCase()}.${String(target?.className).split(" ")[0]}: ${t.duration} ms x ${t.iterations}`);
      }
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) scan(el.shadowRoot);
    };
    scan(document);
    return out;
  });

test.describe("reduced motion", () => {
  test("popup spinner and progress, options and the in-page UI stop looping animations", async ({ ext }) => {
    const slow = await startApp({ state: "loading" });
    try {
      const { page, popup } = await begin(ext, slow);
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "loading-model", { timeout: 8000 });
      await popup.emulateMedia({ reducedMotion: "no-preference" });
      expect((await motion(popup)).length, "the loading state animates when motion is allowed (so this test can fail)").toBeGreaterThan(0);
      await popup.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => motion(popup)).toEqual([]);

      await ext.setSettings({ launcher: { enabled: false } });
      await page.emulateMedia({ reducedMotion: "reduce" });
      slow.engine.setStatus({ state: "ready" });
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.waitState("playing");
      await expect(page.locator('[data-sk="dock"]')).toBeVisible();
      await expect.poll(() => motion(page)).toEqual([]);
    } finally {
      await slow.stop();
    }
  });
});

test.describe("forced colours (Windows high contrast)", () => {
  test("every stop of the keyboard path keeps a focus outline, which does not depend on shadows or fills", async ({ ext, app }) => {
    const { popup } = await begin(ext, app, "/article");
    await popup.emulateMedia({ forcedColors: "active" });
    expect(await popup.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    for (let i = 0; i < 6; i++) {
      await popup.keyboard.press("Tab");
      const f = await popup.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return { name: el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName, outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 };
      });
      expect(f.outline, `${f.name} has an outline`).toBe(true);
    }
    await popup.getByRole("button", { name: /^Voice:/ }).click();
    await popup.keyboard.press("Tab");
    await popup.keyboard.press("Tab");
    await popup.keyboard.press("Tab");
    await popup.locator(".sk-voice__opt").first().focus();
    expect(await popup.evaluate(() => { const cs = getComputedStyle(document.activeElement!); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0; })).toBe(true);
  });

  test("the reading highlight keeps an underline, which forced colours cannot remove", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await page.emulateMedia({ forcedColors: "active" });
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await expect.poll(() => page.evaluate(() => CSS.highlights.get("speakkit-sentence")?.size ?? 0)).toBeGreaterThan(0);
    const deco = await page.evaluate(() => {
      const r = [...CSS.highlights.get("speakkit-sentence")!][0] as Range;
      const el = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement) as Element;
      return { sentence: getComputedStyle(el, "::highlight(speakkit-sentence)").textDecorationLine, word: getComputedStyle(el, "::highlight(speakkit-word)").textDecorationLine };
    });
    expect(deco).toEqual({ sentence: "underline", word: "underline" });
  });
});

test.describe("highlight spans", () => {
  test("sentence and word highlight add an underline as a second cue and never padding or weight", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await expect.poll(() => page.evaluate(() => CSS.highlights.get("speakkit-word")?.size ?? 0)).toBeGreaterThan(0);
    const s = await page.evaluate(() => {
      const r = [...CSS.highlights.get("speakkit-word")!][0] as Range;
      const el = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement) as Element;
      const w = getComputedStyle(el, "::highlight(speakkit-word)");
      const base = getComputedStyle(el);
      return { line: w.textDecorationLine, thickness: w.textDecorationThickness, weight: w.fontWeight === base.fontWeight, padding: base.padding };
    });
    expect(s).toMatchObject({ line: "underline", weight: true, padding: "0px" });
  });
});
