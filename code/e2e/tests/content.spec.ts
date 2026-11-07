import type { Page } from "@playwright/test";
import { test, expect, begin } from "../support/ext";
import { startApp } from "../support/servers";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const callsText = (app: { engine: { calls: { text: string }[] } }) => app.engine.calls.map((c) => c.text);

test.describe("selection bubble", () => {
  test("select text -> bubble -> Listen reads only the selection", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.locator("#b").click({ clickCount: 3 });
    await expect(sk(page, "bubble")).toBeVisible({ timeout: 5000 });
    await sk(page, "bubble-listen").click();
    await ext.waitState("playing");
    await expect(sk(page, "bubble")).toHaveCount(0);
    await expect.poll(() => app.engine.calls.length).toBeGreaterThanOrEqual(3);
    const t = callsText(app);
    expect(
      t.every((x) => x.startsWith("P2S")),
      JSON.stringify(t),
    ).toBe(true);
    expect((await ext.state()).sentenceCount).toBe(3);
  });

  test("the bubble goes away when the selection collapses and respects the setting live", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.locator("#a").click({ clickCount: 3 });
    await expect(sk(page, "bubble")).toBeVisible({ timeout: 5000 });
    await page.mouse.click(5, 400);
    await expect(sk(page, "bubble")).toHaveCount(0);
    await ext.setSettings({ show: { bubble: false } });
    await page.locator("#a").click({ clickCount: 3 });
    await page.waitForTimeout(600);
    await expect(sk(page, "bubble")).toHaveCount(0);
    await ext.setSettings({ show: { bubble: true } });
    await page.mouse.click(5, 400);
    await page.locator("#c").click({ clickCount: 3 });
    await expect(sk(page, "bubble")).toBeVisible({ timeout: 5000 });
  });

  test("the bubble's speed popover changes the speed", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.locator("#a").click({ clickCount: 3 });
    await sk(page, "bubble-settings").click();
    await expect(sk(page, "popover-speed")).toBeVisible();
    await sk(page, "speed-1.5").click();
    await expect.poll(async () => (await ext.settings()).speed).toBe(1.5);
  });
});

test.describe("paragraph gutter", () => {
  test("no play buttons are shown on a fresh page, only after reading was started", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await page.locator("#p5").hover();
    await page.waitForTimeout(500);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    await ext.cmd("read-selection", page);
    await ext.waitState("playing");
    await page.locator("#p7").hover();
    await expect(sk(page, "gutter-play")).toBeVisible({ timeout: 5000 });
    await page.reload();
    await ext.waitState("idle");
    // The reloaded page can ask for the state before the background finished stopping the old playback and then counts as engaged; the next load starts idle.
    await page.reload();
    await page.locator("#p5").hover();
    await page.waitForTimeout(500);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
  });

  test("hover a paragraph after reading started -> play button -> reads from there", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await ext.cmd("read-selection", page);
    await ext.waitState("playing");
    await page.locator("#p5").hover();
    await expect(sk(page, "gutter-play")).toBeVisible({ timeout: 5000 });
    app.engine.calls.length = 0;
    await sk(page, "gutter-play").click();
    await expect.poll(() => app.engine.calls.length).toBeGreaterThan(0);
    expect(app.engine.calls[0]!.text).toBe("P5S1 the quiet harbor wakes before the first ferry leaves the dock.");
  });

  test("the gutter button is off when the setting is off", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ show: { gutter: false } });
    const page = await ext.open("/article");
    await page.locator("#p5").hover();
    await page.waitForTimeout(500);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
  });
});

test.describe("edge launcher", () => {
  test("hidden tab -> hover expands -> Listen reads -> reading state", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    const tab = sk(page, "launcher-tab");
    await expect(tab).toBeVisible({ timeout: 8000 });
    expect((await tab.boundingBox())!.width).toBeLessThan(30);
    await tab.hover();
    await expect(sk(page, "launcher-pill")).toBeVisible();
    await sk(page, "launcher-play").click();
    await ext.waitState("playing");
    // The pill collapses after its close delay once the pointer is away from it.
    await expect
      .poll(
        async () => {
          await page.mouse.move(300 + Math.random() * 40, 300);
          return sk(page, "launcher-tab").count();
        },
        { timeout: 8000, message: await page.evaluate(() => document.querySelector("speakkit-ui")?.shadowRoot?.innerHTML.slice(0, 600) ?? "no host") },
      )
      .toBe(1);
    await expect(sk(page, "launcher-tab")).toHaveClass(/reading/, { timeout: 6000 });
    // Reading: the tab is only a slim progress rail; the pill (hover or Enter) has the play/pause button.
    const rail = (await sk(page, "launcher-tab").boundingBox())!;
    expect([rail.width, rail.height]).toEqual([12, 96]);
    await sk(page, "launcher-tab").hover();
    await sk(page, "launcher-play").click();
    await ext.waitState("paused");
    await sk(page, "launcher-play").click();
    await ext.waitState("playing");
  });

  test("drag moves the tab and the new height is saved", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    const tab = sk(page, "launcher-tab");
    await expect(tab).toBeVisible({ timeout: 8000 });
    const b = (await tab.boundingBox())!;
    const y0 = (await ext.settings()).launcher?.y ?? 0.42;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 60, { steps: 6 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 180, { steps: 6 });
    await page.mouse.up();
    const b2 = (await sk(page, "launcher-tab").boundingBox())!;
    expect(b.y - b2.y).toBeGreaterThan(100);
    await expect.poll(async () => (await ext.settings()).launcher.y).toBeLessThan(y0 - 0.1);
    // A reload keeps the saved position.
    await page.reload();
    const b3 = await sk(page, "launcher-tab")
      .boundingBox({ timeout: 8000 } as never)
      .catch(() => null);
    await expect(sk(page, "launcher-tab")).toBeVisible({ timeout: 8000 });
    const again = (await sk(page, "launcher-tab").boundingBox())!;
    expect(Math.abs(again.y - b2.y)).toBeLessThan(8);
    void b3;
  });

  test("the pill closes after the close delay when the pointer leaves", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { closeDelayMs: 400 } });
    const page = await ext.open("/article");
    await expect(sk(page, "launcher-tab")).toBeVisible({ timeout: 8000 });
    await sk(page, "launcher-tab").hover();
    await expect(sk(page, "launcher-pill")).toBeVisible();
    await page.mouse.move(300, 300);
    await page.waitForTimeout(150);
    await expect(sk(page, "launcher-pill")).toBeVisible(); // still within the delay
    await expect(sk(page, "launcher-pill")).toHaveCount(0, { timeout: 3000 });
  });

  test("open on click: hover alone does not open it", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { openOn: "click" } });
    const page = await ext.open("/article");
    await expect(sk(page, "launcher-tab")).toBeVisible({ timeout: 8000 });
    await sk(page, "launcher-tab").hover();
    await page.waitForTimeout(500);
    await expect(sk(page, "launcher-pill")).toHaveCount(0);
    await sk(page, "launcher-tab").click();
    await expect(sk(page, "launcher-pill")).toBeVisible();
  });

  test("side setting applies live to an open page", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await expect(sk(page, "launcher-tab")).toBeVisible({ timeout: 8000 });
    const vw = page.viewportSize()!.width;
    expect((await sk(page, "launcher-tab").boundingBox())!.x).toBeGreaterThan(vw - 40);
    await ext.setSettings({ launcher: { side: "left" } });
    await expect.poll(async () => (await sk(page, "launcher-tab").boundingBox())?.x ?? 999).toBeLessThan(5);
  });

  test("idle mode 'hidden' keeps the tab invisible until hover", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { idle: "hidden" } });
    const page = await ext.open("/article");
    const tab = sk(page, "launcher-tab");
    await expect(tab).toHaveClass(/ghost/, { timeout: 8000 });
    expect(await tab.evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
    await tab.hover();
    await expect(sk(page, "launcher-pill")).toBeVisible();
  });

  test("launcher disabled: no tab", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await page.waitForTimeout(1500);
    await expect(sk(page, "launcher-tab")).toHaveCount(0);
  });
});

test.describe("dock", () => {
  test("shows while reading when the launcher is off; speed and voice popovers work", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await expect(sk(page, "dock")).toHaveCount(0);
    const popup = await ext.popup(page);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await ext.waitState("playing");
    await expect(sk(page, "dock")).toBeVisible();
    await sk(page, "dock-speed").click();
    await expect(sk(page, "popover-speed")).toBeVisible();
    await sk(page, "speed-2").click();
    await expect.poll(async () => (await ext.state()).speed).toBe(2);
    await sk(page, "dock-voice").click();
    await expect(sk(page, "popover-voice")).toBeVisible();
    await page.locator('[data-voice="bm_george"]').click();
    await expect.poll(() => app.engine.calls.at(-1)!.voice).toBe("bm_george");
    // Pause / resume / skip from the dock.
    if (await sk(page, "popover-voice").count()) await page.keyboard.press("Escape"); // closes the popover only
    await sk(page, "dock-toggle").click();
    await ext.waitState("paused");
    await sk(page, "dock-toggle").click();
    await ext.waitState("playing");
    const s0 = (await ext.state()).sentenceIndex;
    await sk(page, "dock-next").click();
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBeGreaterThan(s0 + 2);
  });

  test("the dock is forced on by an always-dock site rule even with the launcher on", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ sites: { localhost: "always-dock" } });
    const page = await ext.open("/article");
    await expect(sk(page, "dock")).toBeVisible({ timeout: 8000 });
    await expect(sk(page, "dock-play")).toBeVisible();
    await sk(page, "dock-play").click();
    await ext.waitState("playing");
    await expect(sk(page, "dock")).toHaveAttribute("data-state", "playing");
  });
});

test.describe("keyboard while reading", () => {
  test("arrows change paragraph and speed, space toggles, escape stops", async ({ ext, app }) => {
    const { page, popup } = await begin(ext, app);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await ext.waitState("playing");
    await page.bringToFront();
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBe(1);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBe(4);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBe(1);
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await ext.state()).speed).toBeCloseTo(1.3, 2);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await ext.state()).speed).toBeCloseTo(1.1, 2);
    await page.keyboard.press(" ");
    await ext.waitState("paused");
    await page.keyboard.press(" ");
    await ext.waitState("playing");
    await page.keyboard.press("Escape");
    await ext.waitState("idle");
  });
});

test.describe("back to current", () => {
  test("scrolling away shows the pill; clicking it returns to the sentence", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/tall");
    const popup = await ext.popup(page);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await ext.waitState("playing");
    await page.bringToFront();
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 6000);
    await expect(sk(page, "back-to-current")).toBeVisible({ timeout: 6000 });
    const far = await page.evaluate(() => scrollY);
    await sk(page, "back-to-current").click();
    await expect(sk(page, "back-to-current")).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(far - 2000);
  });

  test("with auto-scroll off the page is left alone and the pill shows when the sentence leaves the view", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ show: { autoScroll: false } });
    const page = await ext.open("/tall");
    const popup = await ext.popup(page);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await ext.waitState("playing");
    for (let i = 0; i < 4; i++) await popup.getByRole("button", { name: "Next paragraph" }).click();
    await expect(sk(page, "back-to-current")).toBeVisible({ timeout: 8000 });
    expect(await page.evaluate(() => scrollY)).toBeLessThan(50);
  });
});

test.describe("engine asleep (B22)", () => {
  test("the idle dock says the engine is asleep and wakes on play; after play it reads normally", async ({ ext }) => {
    const app = await startApp({ state: "unloaded", loadMs: 800 });
    app.engine.warm = () => {}; // stay asleep until a play request
    try {
      await ext.pair(app);
      await ext.setSettings({ launcher: { enabled: false }, sites: { localhost: "always-dock" } });
      const page = await ext.open("/article");
      await expect(sk(page, "dock").locator(".sk-sub")).toHaveText("Engine asleep · wakes on play", { timeout: 10_000 });
      await sk(page, "dock-play").click();
      await ext.waitState("playing", 20_000);
      await expect(sk(page, "dock")).toHaveAttribute("data-state", "playing");
    } finally {
      await app.stop();
    }
  });

  test("the edge pill's tooltip says Wakes on play for an unloaded engine", async ({ ext }) => {
    const app = await startApp({ state: "unloaded", loadMs: 800 });
    app.engine.warm = () => {};
    try {
      await ext.pair(app);
      const page = await ext.open("/article");
      await page.mouse.move(1270, 300);
      const tab = sk(page, "launcher-tab");
      await expect(tab).toBeVisible({ timeout: 10_000 });
      await tab.click();
      await sk(page, "launcher-play").hover();
      await expect(sk(page, "launcher-tooltip")).toContainText("Wakes on play", { timeout: 10_000 });
    } finally {
      await app.stop();
    }
  });
});
