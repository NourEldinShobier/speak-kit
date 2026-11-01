import type { Page } from "@playwright/test";
import { test, expect, begin, highlights } from "../support/ext";
import { sentence } from "../support/pages";

const listen = (popup: Page) => popup.getByRole("button", { name: "Listen to this page" }).click();

test.describe("popup playback", () => {
  test("idle -> Listen -> playing, with real sound and scheduled audio advancing", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
    await listen(popup);
    await ext.waitState("playing");
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "playing");
    const a = await ext.hook();
    expect(a.ctxState).toBe("running");
    expect(a.frames).toBeGreaterThan(0);
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
    await expect.poll(async () => (await ext.hook()).scheduledMs, { timeout: 8000 }).toBeGreaterThan(a.scheduledMs);
    await expect.poll(async () => (await ext.state()).elapsedMs).toBeGreaterThan(1000);
    expect(app.engine.calls[0]!.voice).toBe("af_heart");
  });

  test("only readable content is sent: no nav, ads, footer, code, citations; long URLs become 'link'", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBeGreaterThan(30);
    const all = app.engine.calls.map((c) => c.text).join("\n");
    for (const bad of ["HOMENAV", "ADTEXT", "FOOTERTEXT", "CODEBLOCK", "[1]", "[2]", "example.com/a/very"])
      expect(all, bad).not.toContain(bad);
    for (const good of ["The Long Harbor", "P1S1", "P10S3", "LIST one", "LIST two", "QUOTE the sea"])
      expect(all, good).toContain(good);
    expect(all).toMatch(/Read more at link/);
  });

  test("pause stops the sound, resume continues from the same place", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    await expect.poll(async () => (await ext.state()).elapsedMs).toBeGreaterThan(800);
    await popup.getByRole("button", { name: "Pause" }).click();
    await ext.waitState("paused");
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "paused");
    const p1 = await ext.hook();
    expect(p1.ctxState).toBe("suspended");
    await popup.waitForTimeout(700);
    const p2 = await ext.hook();
    expect(p2.state.elapsedMs).toBe(p1.state.elapsedMs);
    expect(p2.ctxTime).toBe(p1.ctxTime);
    await popup.getByRole("button", { name: "Play", exact: true }).click();
    await ext.waitState("playing");
    await expect.poll(async () => (await ext.state()).elapsedMs).toBeGreaterThan(p1.state.elapsedMs + 500);
    expect(await ext.peakRms(800)).toBeGreaterThan(0.02);
  });

  test("seek +-10 s lands on the nearest sentence", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    const s0 = (await ext.state()).sentenceIndex;
    await popup.getByRole("button", { name: "Forward 10 seconds" }).click();
    await expect.poll(async () => (await ext.state()).sentenceIndex - s0).toBeGreaterThanOrEqual(4);
    const s1 = await ext.state();
    expect(s1.sentenceIndex - s0).toBeLessThanOrEqual(8);
    await popup.getByRole("button", { name: "Back 10 seconds" }).click();
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBeLessThan(s1.sentenceIndex - 3);
    // Every seek re-requests from the target sentence.
    expect(app.engine.calls.at(-1)!.text).toMatch(/^P\d+S\d/);
  });

  test("next and previous paragraph jump by paragraph", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    const idx = async () => (await ext.state()).sentenceIndex;
    // sentence 0 is the heading; paragraph 1 starts at sentence 1.
    await popup.getByRole("button", { name: "Next paragraph" }).click();
    await expect.poll(idx).toBe(1);
    await expect.poll(() => app.engine.calls.some((c) => c.text === sentence(1, 1))).toBeTruthy();
    await popup.getByRole("button", { name: "Next paragraph" }).click();
    await expect.poll(idx).toBe(4);
    await popup.getByRole("button", { name: "Previous paragraph" }).click();
    await expect.poll(idx).toBe(1);
  });

  test("speed change re-requests the audio; above 2x the player speeds playback up", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    const before = app.engine.calls.length;
    await popup.getByRole("button", { name: /^Speed / }).click();
    await popup.getByRole("group", { name: "Speed presets" }).getByRole("button", { name: "2x", exact: true }).click();
    await expect.poll(async () => (await ext.state()).speed).toBe(2);
    await expect.poll(() => app.engine.calls.at(-1)!.speed).toBe(2);
    expect(app.engine.calls.length).toBeGreaterThan(before);
    expect((await ext.hook()).rate).toBe(1);
    await popup.getByRole("group", { name: "Speed presets" }).getByRole("button", { name: "3x", exact: true }).click();
    await expect.poll(async () => (await ext.state()).speed).toBe(3);
    // The server is asked for 3 and models min(speed, 2); the player covers the rest with playbackRate 1.5.
    await expect.poll(async () => (await ext.hook()).rate).toBe(1.5);
    expect(app.engine.calls.at(-1)!.speed).toBe(2);
    expect((await ext.settings()).speed).toBe(3);
    expect(await ext.peakRms(800)).toBeGreaterThan(0.02);
    // Speed continues from the same sentence rather than restarting the page.
    expect((await ext.state()).sentenceIndex).toBeLessThan(10);
  });

  test("voice change from the picker re-requests with the new voice and is remembered", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    await popup.getByRole("button", { name: /^Voice:/ }).click();
    await popup.getByRole("searchbox").fill("Emma");
    await popup.getByRole("button", { name: /^Emma/ }).click();
    await expect.poll(() => app.engine.calls.at(-1)!.voice).toBe("bf_emma");
    expect((await ext.state()).voice).toBe("bf_emma");
    expect((await ext.settings()).voice).toBe("bf_emma");
  });

  test("finished -> replay from the start", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ speed: 3 });
    const page = await ext.open("/short");
    const popup = await ext.popup(page);
    await listen(popup);
    await ext.waitState("finished", 20_000);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "finished");
    await popup.getByRole("button", { name: "Replay from the start" }).first().click();
    await ext.waitState("playing");
    await expect.poll(async () => (await ext.state()).sentenceIndex).toBeLessThanOrEqual(1);
    await ext.waitState("finished", 20_000);
  });

  test("highlights: sentence and word markers appear and move", async ({ ext, app }) => {
    const { page, popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence).toContain("the quiet harbor");
    const seen = new Set<string>();
    const words = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const h = await highlights(page);
      if (h.sentence) seen.add(h.sentence);
      if (h.word) words.add(h.word);
      await page.waitForTimeout(250);
    }
    expect(seen.size, "sentence highlight moves").toBeGreaterThanOrEqual(2);
    expect(words.size, "word highlight moves").toBeGreaterThanOrEqual(4);
    // Highlights never touch the page DOM.
    expect(await page.locator("mark").count()).toBe(0);
  });

  test("the page scrolls to follow the reading position", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/tall");
    const popup = await ext.popup(page);
    await listen(popup);
    await ext.waitState("playing");
    for (let i = 0; i < 3; i++) await popup.getByRole("button", { name: "Next paragraph" }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await expect
      .poll(() => page.evaluate(() => ([...(CSS.highlights.get("speakkit-sentence") ?? [])][0] as Range | undefined)?.getBoundingClientRect().top ?? -1))
      .toBeGreaterThan(-1);
  });
});

test.describe("server-side cancellation", () => {
  test.use({ appOptions: { latencyMs: 250 } });
  test("stop aborts the stream and the engine stops synthesizing", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await listen(popup);
    await ext.waitState("playing");
    await ext.cmd("stop");
    await ext.waitState("idle");
    await expect.poll(() => app.engine.active, { timeout: 5000 }).toBe(0);
    const n = app.engine.calls.length;
    await popup.waitForTimeout(1200);
    expect(app.engine.calls.length, "no further sentences after stop").toBe(n);
    expect(n).toBeLessThan(34);
  });
});

test.describe("preparing state", () => {
  test.use({ appOptions: { latencyMs: 1500 } });
  test("a slow first sentence shows preparing, then playing", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "preparing", { timeout: 3000 });
    await expect(popup.getByRole("progressbar")).toBeVisible();
    expect((await ext.bgState()).status).toBe("preparing");
    await ext.waitState("playing", 10_000);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "playing");
  });
});
