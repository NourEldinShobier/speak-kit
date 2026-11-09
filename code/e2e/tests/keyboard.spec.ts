import type { Page } from "@playwright/test";
import { test, expect, begin, type Ext } from "../support/ext";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);

/** Name and focus-indicator facts of the element that has focus, looking through open shadow roots (test builds). */
const focused = (page: Page) =>
  page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.tagName).replace(/\s+/g, " ").trim();
    return {
      name,
      sk: el.getAttribute("data-sk") ?? "",
      id: el.id,
      outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0,
      shadow: cs.boxShadow !== "none",
      tag: el.tagName.toLowerCase(),
      inPopover: !!el.closest('[data-sk^="popover-"]'),
    };
  });

/** Press Tab `n` times and report what was focused each time. */
async function tabThrough(page: Page, n: number) {
  const seen: NonNullable<Awaited<ReturnType<typeof focused>>>[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    if (f) seen.push(f);
  }
  return seen;
}

test.describe("popup, keyboard only", () => {
  test("Tab order follows the screen, every stop shows a focus indicator, Enter on Listen starts reading", async ({ ext, app }) => {
    const { popup } = await begin(ext, app, "/article");
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
    const stops = await tabThrough(popup, 6);
    expect(stops.map((s) => s.name)).toEqual(["Open settings", "Listen to this page", "Reader view", expect.stringMatching(/^Voice: /), expect.stringMatching(/^Speed /), "Open app"]);
    for (const s of stops) expect(s.outline || s.shadow, `${s.name} shows focus`).toBe(true);
    await popup.getByRole("button", { name: "Listen to this page" }).focus();
    await popup.keyboard.press("Enter");
    await ext.waitState("playing");
  });

  test("the voice picker opens with Enter, Escape closes it and focus returns to the Voice button", async ({ ext, app }) => {
    const { popup } = await begin(ext, app, "/article");
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
    await popup.getByRole("button", { name: /^Voice:/ }).focus();
    await popup.keyboard.press("Enter");
    await expect(popup.getByRole("heading", { name: "Voice" })).toBeVisible();
    await popup.keyboard.press("Escape");
    await expect(popup.getByRole("heading", { name: "Voice" })).toHaveCount(0);
    expect((await focused(popup))?.name).toMatch(/^Voice: /);
  });

  test("the speed panel: Space opens it, arrow keys change the slider, Escape closes it and keeps focus", async ({ ext, app }) => {
    const { popup } = await begin(ext, app, "/article");
    await popup.getByRole("button", { name: /^Speed / }).focus();
    await popup.keyboard.press("Space");
    const slider = popup.getByRole("slider", { name: "Speed" });
    await expect(slider).toBeVisible();
    await slider.focus();
    await popup.keyboard.press("ArrowRight");
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(1);
    await popup.keyboard.press("Escape");
    await expect(slider).toHaveCount(0);
    expect((await focused(popup))?.name).toMatch(/^Speed /);
  });
});

test.describe("options and side panel, keyboard only", () => {
  test("Tab reaches every sidebar link with a focus indicator; Enter opens the section", async ({ ext, app }) => {
    const opt = await ext.pair(app);
    await opt.goto(ext.url("options"));
    await opt.locator("main h1").waitFor();
    const stops = await tabThrough(opt, 8);
    expect(stops.map((s) => s.name)).toEqual(["General", "Edge launcher", "Voice and speed", "Voice chat", "Highlighting", "Reader view", "Shortcuts", "Sites and filters"]);
    for (const s of stops) expect(s.outline || s.shadow, `${s.name} shows focus`).toBe(true);
    await opt.keyboard.press("Enter");
    await expect(opt.getByRole("heading", { level: 1, name: "Sites and filters" })).toBeVisible();
  });

  test("side panel: every control can be reached and shows focus", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    const panel = await ext.sidepanel(page);
    await panel.locator("button").first().waitFor();
    const stops = await tabThrough(panel, 4);
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) expect(s.outline || s.shadow, `${s.name} shows focus`).toBe(true);
  });
});

test.describe("in-page UI, keyboard only", () => {
  test("a popover takes focus, Escape closes it and focus returns to the control that opened it", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await sk(page, "dock-speed").focus();
    await page.keyboard.press("Enter");
    await expect(sk(page, "popover-speed")).toBeVisible();
    expect((await focused(page))?.inPopover, "focus moved into the popover").toBe(true);
    await page.keyboard.press("Escape");
    await expect(sk(page, "popover-speed")).toHaveCount(0);
    expect((await focused(page))?.sk).toBe("dock-speed");
    await ext.waitState("playing");
  });

  test("the reader view is modal: the page leaves the tab order, Escape closes it and focus returns to where it was", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "opener";
      b.textContent = "Open";
      document.querySelector("article")!.prepend(b);
      b.focus();
    });
    await ext.bg({ t: "reader", tabId: await ext.tabId(page), open: true });
    await expect(sk(page, "reader")).toBeVisible();
    expect(await page.evaluate(() => document.body.inert)).toBe(true);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => document.activeElement?.tagName);
      expect(["SPEAKKIT-UI", "BODY"], `Tab ${i + 1} stays in the reader`).toContain(f);
    }
    await page.keyboard.press("Escape");
    await expect(sk(page, "reader")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.inert)).toBe(false);
    expect((await focused(page))?.id).toBe("opener");
  });
});

/** The paragraph buttons appear only on a page where a reading was started once. */
async function engage(ext: Ext, page: Page) {
  await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
  await ext.waitState("playing");
  await ext.cmd("stop", page);
  await ext.waitState("idle");
}

test.describe("paragraph gutter button", () => {
  test.use({ appOptions: { secondsPerChar: 0.4 } }); // slow enough that the reading stays on one paragraph while the test looks at it

  test("focus inside a paragraph shows it and it has a focus ring", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await engage(ext, page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "lk";
      a.href = "#top";
      a.textContent = "a link inside the paragraph";
      document.querySelector("#p5")!.append(" ", a);
    });
    // the first focus loads the page script (which then misses it), so focus again until the gutter shows
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            const a = document.getElementById("lk")!;
            a.blur();
            a.focus();
          });
          return sk(page, "gutter-play").count();
        },
        { timeout: 10_000 },
      )
      .toBe(1);
    await sk(page, "gutter-play").focus();
    const f = await focused(page);
    expect(f?.sk).toBe("gutter-play");
    expect(f?.outline, "focus ring").toBe(true);
  });

  test("on the paragraph being read it says so and does nothing; on another paragraph it reads from there", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await engage(ext, page);
    await expect
      .poll(
        async () => {
          await page.mouse.move(5, 5);
          await page.locator("#p3").hover();
          return sk(page, "gutter-play").count();
        },
        { timeout: 10_000 },
      )
      .toBe(1); // the first pointer move loads the page script
    await sk(page, "gutter-play").click();
    await ext.waitState("playing");
    await page.mouse.move(5, 5);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    await page.locator("#p3").hover();
    const btn = sk(page, "gutter-play");
    await expect(btn).toHaveAttribute("data-state", "reading", { timeout: 5000 });
    await expect(btn).toHaveAttribute("aria-label", "Reading this paragraph");
    await expect(btn).toHaveAttribute("aria-disabled", "true");
    const before = (await ext.state()).sentenceIndex;
    await btn.click({ force: true }); // aria-disabled: Playwright would wait forever for it to become enabled
    await page.waitForTimeout(400);
    const after = await ext.state();
    expect(after.status).toBe("playing");
    expect(after.sentenceIndex, "the click did not restart the paragraph").toBeGreaterThanOrEqual(before);
    await page.locator("#p7").hover();
    await expect(btn).toHaveAttribute("data-state", "idle", { timeout: 5000 });
    await expect(btn).toHaveAttribute("aria-label", "Read from here");
  });

  test("the button is next in tab order after the focused link and Escape dismisses it, returning focus to the link", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await engage(ext, page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "lk";
      a.href = "#top";
      a.textContent = "a link inside the paragraph";
      document.querySelector("#p5")!.append(" ", a);
    });
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            const a = document.getElementById("lk")!;
            a.blur();
            a.focus();
          });
          return sk(page, "gutter-play").count();
        },
        { timeout: 10_000 },
      )
      .toBe(1);
    expect(await page.evaluate(() => document.getElementById("lk")!.nextElementSibling?.localName), "the host sits right after the link").toBe("speakkit-ui");
    await page.keyboard.press("Tab");
    expect((await focused(page))?.sk, "one Tab from the link reaches the button").toBe("gutter-play");
    await page.keyboard.press("Escape");
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    expect((await focused(page))?.id, "focus is back on the link").toBe("lk");
    expect(await page.evaluate(() => document.documentElement.lastElementChild?.localName), "the host is back at the end of the page").toBe("speakkit-ui");
    expect((await ext.state()).status, "Escape closed the button, it did not stop anything").toBe("idle");
  });

  test("Escape dismisses a hover button without moving the pointer, and the next Escape stops the reading", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await engage(ext, page);
    await expect
      .poll(
        async () => {
          await page.mouse.move(5, 5);
          await page.locator("#p3").hover();
          return sk(page, "gutter-play").count();
        },
        { timeout: 10_000 },
      )
      .toBe(1);
    await sk(page, "gutter-play").click();
    await ext.waitState("playing");
    await page.mouse.move(5, 5);
    await page.locator("#p7").hover();
    await expect(sk(page, "gutter-play")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    expect((await ext.state()).status, "the first Escape only closes the button").toBe("playing");
    await page.keyboard.press("Escape");
    await ext.waitState("idle");
  });
});
