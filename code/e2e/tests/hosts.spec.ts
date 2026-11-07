import type { Page } from "@playwright/test";
import { test, expect, highlights } from "../support/ext";
import { shell } from "../support/pages";
import { axeViolations } from "../support/ui-checks";
import { extractOf, readTab } from "../support/probe";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const TEXT = ["HOSTA the quiet harbor wakes before the first ferry leaves the dock.", "HOSTB the gulls circle the pier once more as the tide turns."];
const body = `<main><h1>Dark host</h1><p id="one">${TEXT.join(" ")}</p><p id="two">${TEXT.join(" ")}</p></main>`;
const DARK = "background:#0b0c10;color:#e8e8e8;";

const TRAPS: Record<string, string> = {
  "html and body scroll lock with an inner scroller": `html,body{margin:0;height:100%;overflow:hidden;${DARK}} body{overflow:auto}`,
  "a universal reset that unsets everything": `*{all:unset} body{display:block;${DARK}} p,main,h1{display:block;margin:12px} h1{font-size:28px}`,
  "an app shell with a fixed, scrolling body": `html{overflow:hidden;height:100%} body{position:fixed;inset:0;overflow-y:scroll;margin:0;${DARK}}`,
  "a transformed, clipped html element": `html{transform:translateZ(0);overflow:hidden;height:100%;${DARK}} body{margin:0}`,
  "a transformed html element on a page taller than the window": `html{transform:translateZ(0);${DARK}} main{padding-bottom:3000px}`,
};

test.describe("dark host pages with CSS resets and overflow traps", () => {
  for (const [name, css] of Object.entries(TRAPS)) {
    test(`${name}: dock, bubble and highlight stay visible and readable`, async ({ ext, app }) => {
      const path = `/trap-${Object.keys(TRAPS).indexOf(name)}`;
      ext.fx.set(path, shell("Trap", body, css));
      await ext.pair(app);
      const page = await ext.open(path);
      const vp = page.viewportSize()!;

      await page.locator("#two").click({ clickCount: 3 });
      await expect(sk(page, "bubble")).toBeVisible({ timeout: 5000 });
      const bb = (await sk(page, "bubble").boundingBox())!;
      expect(bb.x).toBeGreaterThanOrEqual(0);
      expect(bb.y).toBeGreaterThanOrEqual(0);
      expect(bb.x + bb.width).toBeLessThanOrEqual(vp.width);
      expect(bb.y + bb.height).toBeLessThanOrEqual(vp.height);
      await page.mouse.click(vp.width - 5, vp.height - 5);
      await ext.setSettings({ launcher: { enabled: false } });

      await readTab(ext, page);
      await ext.waitState("playing");
      const dock = sk(page, "dock");
      await expect(dock).toBeVisible();
      const d = (await dock.boundingBox())!;
      expect(d.width).toBeGreaterThan(100);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.x + d.width).toBeLessThanOrEqual(vp.width);
      expect(d.y + d.height).toBeLessThanOrEqual(vp.height);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.localName, [d.x + d.width / 2, d.y + d.height / 2] as const);
      expect(top, "what is on top at the centre of the dock").toBe("speakkit-ui");
      expect(await axeViolations(page, "speakkit-ui")).toEqual([]);

      await expect.poll(async () => (await highlights(page)).sentence).toContain("HOST");
      await ext.bg({ t: "player", command: { cmd: "pause" } });
      await ext.waitState("paused");
      const rect = await page.evaluate(() => {
        const r = (([...(CSS.highlights.get("speakkit-sentence") ?? [])][0]) as Range).getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, r.width), height: Math.max(1, r.height) };
      });
      expect(rect.y + rect.height, "the highlighted sentence is on screen").toBeLessThan(vp.height);
      const marked = await page.screenshot({ clip: rect });
      await ext.cmd("stop");
      await ext.waitState("idle");
      await expect.poll(async () => (await highlights(page)).sentence).toBe("");
      expect(Buffer.compare(marked, await page.screenshot({ clip: rect })), "the highlight is drawn").not.toBe(0);
    });
  }
});

const AR = ["ذهب الولد إلى المدرسة في الصباح الباكر.", "ثم عاد إلى البيت مساء بعد يوم طويل."];
const HE = ["הילד הלך לבית הספר בבוקר מוקדם.", "אחר כך חזר הביתה בערב אחרי יום ארוך."];
const MIXED = "اشترى أحمد جهاز Apple جديدا من المتجر في المدينة.";

test.describe("right-to-left pages", () => {
  const rtl = (lang: string, sentences: string[], extra = "") =>
    shell("RTL", `<main dir="rtl" lang="${lang}"><h1>${sentences[0]}</h1><p id="p">${sentences.join(" ")}</p>${extra}</main>`).replace('lang="en"', `lang="${lang}" dir="rtl"`);

  test("Arabic and Hebrew pages are extracted in reading order, the highlight starts at the right edge and the controls fit", async ({ ext, app }) => {
    ext.fx.set("/rtl-ar", rtl("ar", AR, `<p id="m" dir="auto">${MIXED}</p>`));
    ext.fx.set("/rtl-he", rtl("he", HE));
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const ar = await ext.open("/rtl-ar");
    expect((await extractOf(ext, ar)).sentences).toEqual([AR[0], AR[0], AR[1], MIXED]);
    await readTab(ext, ar);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(ar)).sentence).toBe(AR[0]);
    const box = await ar.evaluate(() => {
      const r = (([...(CSS.highlights.get("speakkit-sentence") ?? [])][0]) as Range).getBoundingClientRect();
      const m = document.querySelector("main")!.getBoundingClientRect();
      return { right: r.right, left: r.left, mainRight: m.right, mainLeft: m.left };
    });
    expect(box.right, "an RTL sentence begins at the right edge").toBeGreaterThan(box.mainRight - 60);
    const dock = (await sk(ar, "dock").boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(ar.viewportSize()!.width);
    expect(await axeViolations(ar, "speakkit-ui")).toEqual([]);
    await ext.cmd("stop");
    await ext.waitState("idle");

    const he = await ext.open("/rtl-he");
    expect((await extractOf(ext, he)).sentences).toEqual([HE[0], HE[0], HE[1]]);
    await readTab(ext, he);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(he)).sentence).toBe(HE[0]);
    expect(app.engine.calls.map((c) => c.text).slice(0, 2)).toEqual([AR[0], AR[0]]);
  });

  test("a left-to-right page with an Arabic paragraph, and mixed direction in one sentence, keep their text and highlight it whole", async ({ ext, app }) => {
    const mixedPage = shell("Mixed", `<main><h1>English heading for the page</h1><p dir="rtl" lang="ar" id="ar">${AR.join(" ")}</p><p id="en">The end of the page is written in English again.</p></main>`);
    ext.fx.set("/mixed-dir", mixedPage);
    await ext.pair(app);
    const page = await ext.open("/mixed-dir");
    expect((await extractOf(ext, page)).sentences).toEqual(["English heading for the page", AR[0], AR[1], "The end of the page is written in English again."]);
    await readTab(ext, page);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence, { timeout: 10_000 }).toBe(AR[0]);
    await ext.bg({ t: "player", command: { cmd: "next-block" } });
    await expect.poll(async () => (await highlights(page)).sentence, { timeout: 10_000 }).toBe("The end of the page is written in English again.");
  });
});
