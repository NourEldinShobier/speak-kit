import type { Page } from "@playwright/test";
import { test, expect, begin, highlights } from "../support/ext";
import { startApp } from "../support/servers";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const selectNodeContents = (page: Page, id: string) =>
  page.evaluate((i) => {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById(i)!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  }, id);

test.describe("keyboard commands (driven through the service worker's onCommand handler)", () => {
  test("read-selection reads the selection; without one it reads the page", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await selectNodeContents(page, "b");
    await ext.cmd("read-selection", page);
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBe(3);
    expect(app.engine.calls.every((c) => c.text.startsWith("P2S"))).toBe(true);
    await ext.cmd("stop");
    await ext.waitState("idle");
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await ext.cmd("read-selection", page);
    await ext.waitState("playing");
    expect((await ext.state()).sentenceCount).toBe(10); // heading + 3 paragraphs of 3
  });

  test("play-pause toggles, stop ends", async ({ ext, app }) => {
    const { page } = await begin(ext, app);
    await ext.cmd("play-pause", page); // nothing playing: starts reading
    await ext.waitState("playing");
    await ext.cmd("play-pause", page);
    await ext.waitState("paused");
    await ext.cmd("play-pause", page);
    await ext.waitState("playing");
    await ext.cmd("stop", page);
    await ext.waitState("idle");
  });

  test("the manifest declares the three shortcuts", async ({ ext }) => {
    const cmds = await ext.sw.evaluate(() => chrome.commands.getAll());
    expect(Object.fromEntries(cmds.filter((c: { name: string }) => c.name).map((c: { name: string; shortcut: string }) => [c.name, c.shortcut]))).toMatchObject({
      "read-selection": "Ctrl+Shift+S",
      "play-pause": "Ctrl+Shift+Y",
      stop: "Ctrl+Shift+X",
    });
  });
});

test.describe("context menu (entries read back from the worker; clicks go through its onClicked handler)", () => {
  test("registers the SpeakKit entries and removes them live when the setting is off", async ({ ext }) => {
    await expect.poll(() => ext.menuTitles()).toEqual(["Speak Kit", "Read selection", "Read from here", "Add to queue"]);
    await ext.setSettings({ show: { contextMenu: false } });
    await expect.poll(() => ext.menuTitles()).toEqual([]);
    await ext.setSettings({ show: { contextMenu: true } });
    await expect.poll(() => ext.menuTitles()).toHaveLength(4);
  });

  test("Read selection and Read from here", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await selectNodeContents(page, "p7");
    await ext.menu("speakkit-read-selection", page, "x");
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBe(3);
    expect(app.engine.calls[0]!.text.startsWith("P7S1")).toBe(true);
    await ext.cmd("stop");
    await ext.waitState("idle");
    app.engine.calls.length = 0;
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await page.locator("#p9").click({ button: "right" });
    await ext.menu("speakkit-read-from-here", page);
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBeGreaterThan(0);
    // Read from here starts at the sentence under the pointer, which is inside paragraph 9.
    expect(app.engine.calls[0]!.text).toMatch(/^P9S/);
    expect(app.engine.calls.some((c) => c.text.startsWith("P8S"))).toBe(false);
  });
});

test.describe("queue and side panel", () => {
  test("empty state, then add / play now / remove / clear", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ speed: 1 });
    const a = await ext.open("/article");
    const b = await ext.open("/select");
    const c = await ext.open("/lists");
    const panel = await ext.sidepanel(a);
    await expect(panel.getByRole("heading", { name: "Nothing queued" })).toBeVisible();
    await panel.getByRole("button", { name: "Add this page" }).click(); // starts reading A (queue was empty)
    await ext.waitState("playing");
    await expect(panel.getByRole("region", { name: "Now playing" })).toBeVisible();
    // The outline lists the paragraphs of the playing page.
    await expect(panel.locator(".sp-outline li").first()).toContainText("The Long Harbor");
    expect(await panel.locator(".sp-outline li").count()).toBeGreaterThan(8);
    await ext.menu("speakkit-add-queue", b);
    await ext.menu("speakkit-add-queue", c);
    const queue = panel.getByRole("list", { name: "Up next" });
    await expect(queue.locator("li")).toHaveCount(2);
    await expect(queue.locator("li").first()).toContainText("Selection Targets");
    await expect(sk(b, "toast")).toContainText("Added to queue");
    await panel.getByRole("button", { name: "Remove Lists And Tables" }).click();
    await expect(queue.locator("li")).toHaveCount(1);
    await panel.getByRole("button", { name: "Play Selection Targets now" }).click();
    await expect.poll(async () => (await ext.state()).title).toBe("Selection Targets");
    await expect(queue.locator("li")).toHaveCount(0);
    await ext.menu("speakkit-add-queue", c);
    await expect(queue.locator("li")).toHaveCount(1);
    await panel.getByRole("button", { name: "Clear all" }).click();
    await expect(queue.locator("li")).toHaveCount(0);
  });

  test("auto-advance moves to the next queued page when one finishes; with auto-play off it waits", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ speed: 3 });
    const a = await ext.open("/short");
    const b = await ext.open("/lists");
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(a), mode: "page" });
    await ext.waitState("playing");
    await ext.menu("speakkit-add-queue", b);
    await expect.poll(async () => (await ext.state()).queueLength).toBe(1);
    await expect.poll(async () => (await ext.state()).title, { timeout: 20_000 }).toBe("Lists And Tables");
    expect((await ext.state()).tabId).toBe(await ext.tabId(b));
    await ext.waitState("finished", 20_000);

    // Auto-play off: the next item is kept, not started.
    const c = await ext.open("/short");
    const d = await ext.open("/select");
    await ext.bg({ t: "set-auto-play", on: false });
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(c), mode: "page" });
    await ext.waitState("playing");
    await ext.menu("speakkit-add-queue", d);
    await ext.waitState("finished", 20_000);
    await c.waitForTimeout(1000);
    const st = await ext.state();
    expect(st.status).toBe("finished");
    expect(st.queueLength).toBe(1);
  });
});

test.describe("site rules (edited in the options page)", () => {
  async function addRule(ext: import("../support/ext").Ext, host: string, rule: string) {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#sites");
    await opt.getByLabel("Site", { exact: true }).fill(host);
    const label = { "always-dock": "Always show dock", "hide-controls": "Hide controls", "never-read": "Never read" }[rule]!;
    await opt.getByRole("combobox", { name: "Rule for new site" }).click(); // Radix Select
    await opt.getByRole("option", { name: label }).click();
    await opt.getByRole("button", { name: "Add site", exact: true }).click();
    await expect.poll(async () => (await ext.settings()).sites?.[host]).toBe(rule);
    return opt;
  }

  test("never-read: nothing appears and nothing is sent", async ({ ext, app }) => {
    await ext.pair(app);
    await addRule(ext, "localhost", "never-read");
    const page = await ext.open("/article");
    await page.waitForTimeout(1500);
    await expect(sk(page, "launcher-tab")).toHaveCount(0);
    await page.locator("#p2").hover();
    await page.waitForTimeout(400);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    await ext.cmd("read-selection", page);
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await page.waitForTimeout(800);
    expect((await ext.bgState()).status).toBe("idle");
    expect(app.engine.calls.length).toBe(0);
  });

  test("hide-controls: no launcher, bubble or gutter, but the popup can still read", async ({ ext, app }) => {
    await ext.pair(app);
    await addRule(ext, "localhost", "hide-controls");
    const page = await ext.open("/select");
    await page.waitForTimeout(1500);
    await expect(sk(page, "launcher-tab")).toHaveCount(0);
    await page.locator("#a").click({ clickCount: 3 });
    await page.waitForTimeout(500);
    await expect(sk(page, "bubble")).toHaveCount(0);
    await page.locator("#b").hover();
    await page.waitForTimeout(400);
    await expect(sk(page, "gutter-play")).toHaveCount(0);
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await expect(sk(page, "dock")).toHaveCount(0);
  });

  test("a rule added while a page is open takes effect without reloading", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await expect(sk(page, "launcher-tab")).toBeVisible({ timeout: 8000 });
    await addRule(ext, "localhost", "hide-controls");
    await expect(sk(page, "launcher-tab")).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("settings apply live", () => {
  test("highlight colour chosen in the options page reaches an open page", async ({ ext, app }) => {
    const { page, popup } = await begin(ext, app);
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await ext.waitState("playing");
    const css = () => page.evaluate(() => [...document.adoptedStyleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join("\n"));
    await expect.poll(css).toContain("speakkit-sentence");
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#highlight");
    await opt.getByRole("radio", { name: "Sky" }).click();
    await expect.poll(css).toMatch(/rgb\(221, 239, 255\)|#ddefff/i);
    await opt.getByRole("radio", { name: "Off" }).click();
    await expect
      .poll(async () => {
        const h = await highlights(page);
        return h.sentence + h.word;
      })
      .toBe("");
  });

  test("dark page gets the dark palette", async ({ ext, app }) => {
    await ext.pair(app);
    const light = await ext.open("/article");
    const dark = await ext.open("/dark");
    const sentenceRule = (p: Page) => p.evaluate(() => [...document.adoptedStyleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).find((t) => t.includes("speakkit-sentence")) ?? "");
    for (const p of [light, dark]) {
      const id = await ext.tabId(p);
      await ext.bg({ t: "read-tab", tabId: id, mode: "page" });
      await ext.waitState("playing");
      await expect.poll(() => sentenceRule(p)).toContain("speakkit-sentence");
    }
    const [l, d] = [await sentenceRule(light), await sentenceRule(dark)];
    expect(d).not.toBe(l);
    await expect(sk(dark, "launcher-tab").locator("xpath=ancestor::div[contains(@class,'sk')][1]")).toHaveAttribute("data-theme", "dark");
    await expect(sk(light, "launcher-tab").locator("xpath=ancestor::div[contains(@class,'sk')][1]")).not.toHaveAttribute("data-theme", "dark");
  });
});

test.describe("two tabs", () => {
  test("playing in one tab: audio keeps going when another tab is in front, and each tab shows its own state", async ({ ext, app }) => {
    await ext.pair(app);
    const a = await ext.open("/article");
    const b = await ext.open("/select");
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(a), mode: "page" });
    await ext.waitState("playing");
    await b.bringToFront();
    await expect.poll(async () => (await ext.state()).elapsedMs).toBeGreaterThan(1500);
    expect((await ext.hook()).ctxState).toBe("running");
    expect(await ext.peakRms(800)).toBeGreaterThan(0.02);
    // A highlights, B does not.
    expect((await highlights(a)).sentence).not.toBe("");
    expect((await highlights(b)).sentence).toBe("");
    // The popup for B reports the player that is running elsewhere.
    const popup = await ext.popup(b);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "playing");
    await expect(popup.locator(".pp")).toContainText("The Long Harbor");
    // B's launcher is not in the reading layout.
    await expect(sk(b, "launcher-tab")).not.toHaveClass(/reading/);
    await expect(sk(a, "launcher-tab")).toHaveClass(/reading/, { timeout: 6000 });
    // Reading B replaces A: A's highlight is cleared.
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(b), mode: "page" });
    await expect.poll(async () => (await ext.state()).tabId).toBe(await ext.tabId(b));
    await expect.poll(async () => (await highlights(a)).sentence).toBe("");
  });

  test("closing the playing tab stops playback", async ({ ext, app }) => {
    const { page } = await begin(ext, app);
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await page.close();
    await expect.poll(async () => (await ext.bg<{ status: string }>({ t: "get-state" })).status).toBe("idle");
  });

  test("navigating the playing tab away stops playback", async ({ ext, app }) => {
    const { page } = await begin(ext, app);
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    await page.goto(ext.fx.url("/short"));
    await expect.poll(async () => (await ext.bg<{ status: string }>({ t: "get-state" })).status).toBe("idle");
  });
});

test.describe("server failures during playback", () => {
  test.describe("with a slow engine", () => {
    test.use({ appOptions: { latencyMs: 700 } });
    test("restart mid-playback surfaces an error, then reading works again", async ({ ext, app }) => {
      ext.allowed.push(/ERR_CONNECTION|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|Failed to fetch|network error|offscreen exception|ERR_INCOMPLETE/i);
      const { page, popup } = await begin(ext, app);
      await ext.setSettings({ launcher: { enabled: false } });
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await ext.waitState("playing");
      await app.stop();
      // The player had a little audio buffered; once that and the stream are gone it reports the failure.
      await expect.poll(async () => (await ext.bg<{ status: string }>({ t: "get-state" })).status, { timeout: 30_000 }).toBe("error");
      const st = await ext.bg<{ error: { code: string } }>({ t: "get-state" });
      expect(["app-not-running", "synthesis-failed"]).toContain(st.error.code);
      await expect(sk(page, "dock")).toHaveAttribute("data-state", "error");
      await app.start();
      await expect(sk(page, "dock-retry")).toBeVisible();
      await sk(page, "dock-retry").click();
      await ext.waitState("playing", 20_000);
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
    });
  });

  test("the app comes back with a different token: reading reports token-rejected", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION|Failed to fetch|401|Unauthorized/i);
    const { popup } = await begin(ext, app);
    await app.stop();
    const other = await startApp({ port: app.port, token: "a-different-token-entirely" });
    try {
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await expect.poll(async () => (await ext.bg<{ status: string; error?: { code: string } }>({ t: "get-state" })).error?.code, { timeout: 20_000 }).toBe("token-rejected");
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "token", { timeout: 10_000 });
    } finally {
      await other.stop();
    }
  });

  test("engine not ready: reading reports it instead of hanging", async ({ ext }) => {
    const loading = await startApp({ state: "loading" });
    try {
      const { popup } = await begin(ext, loading);
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "loading-model", { timeout: 8000 });
      loading.engine.setStatus({ state: "ready" });
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle", { timeout: 10_000 });
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await ext.waitState("playing");
    } finally {
      await loading.stop();
    }
  });
});
