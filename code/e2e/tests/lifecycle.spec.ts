import type { Page } from "@playwright/test";
import { FrameDecoder } from "@speakkit/protocol";
import { test, expect, begin, type Ext } from "../support/ext";
import { startApp, type App } from "../support/servers";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const listen = (popup: Page) => popup.getByRole("button", { name: "Listen to this page" }).click();
const health = async (app: App) =>
  (await (await fetch(`http://127.0.0.1:${app.port}/v1/health`, { headers: { Authorization: `Bearer ${app.token}` } })).json()) as {
    engine: { state: string; idleUnloadAtMs?: number | null };
  };
const warms = (app: App) => app.hits("/v1/engine/warm");
/** Read the open page through the service worker (no popup, so no warm request). */
const readTab = async (ext: Ext, page: Page) => ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });

test.describe("model lifecycle: warm", () => {
  test("opening the popup and hovering the launcher call POST /v1/engine/warm once between them", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await page.waitForTimeout(500);
    expect(warms(app)).toHaveLength(0);
    await ext.popup(page);
    await expect.poll(() => warms(app).length).toBe(1);
    expect(warms(app)[0]!.method).toBe("POST");
    await sk(page, "launcher-tab").hover();
    await page.waitForTimeout(700);
    expect(warms(app), "hover right after the popup is inside the 5 s window").toHaveLength(1);
  });

  test("hovering the launcher warms once, hovering the Listen button in the pill adds nothing, a hover after the window warms again", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await sk(page, "launcher-tab").hover();
    await expect.poll(() => warms(app).length).toBe(1);
    await expect(sk(page, "launcher-pill")).toBeVisible();
    await sk(page, "launcher-play").hover();
    await page.waitForTimeout(500);
    expect(warms(app)).toHaveLength(1);
    await page.mouse.move(5, 5);
    await expect(sk(page, "launcher-pill")).toHaveCount(0, { timeout: 5000 });
    await page.waitForTimeout(5200); // the 5 s debounce window has passed
    await sk(page, "launcher-tab").hover();
    await expect.poll(() => warms(app).length).toBe(2);
  });

  test("a popup open wakes an unloaded model before any click", async ({ ext }) => {
    const app = await startApp({ state: "unloaded", loadMs: 50 });
    try {
      await ext.pair(app);
      const page = await ext.open("/article");
      expect(app.engine.loads).toBe(0);
      await ext.popup(page);
      await expect.poll(() => app.engine.loads).toBe(1);
      await expect.poll(async () => (await health(app)).engine.state).toBe("ready");
    } finally {
      await app.stop();
    }
  });
});

test.describe("model lifecycle: unloaded", () => {
  test("'unloaded' reads 'Wakes on play' in options, popup and dock, never as an error; play wakes it", async ({ ext }) => {
    const app = await startApp({ state: "unloaded", loadMs: 2500 });
    app.engine.warm = () => {}; // keep it asleep until a play request
    try {
      const opt = await ext.pair(app);
      await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok");
      await expect(opt.locator(".op-conn-s")).toContainText("Wakes on play");
      await ext.setSettings({ launcher: { enabled: false } });
      const page = await ext.open("/article");
      const popup = await ext.popup(page);
      await expect(popup.locator(".pp-head")).toContainText("Wakes on play");
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
      await expect(popup.getByText("The voice wakes when you press play")).toBeVisible();
      await expect(popup.locator('[role="alert"]')).toHaveCount(0);

      await listen(popup);
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "loading-model");
      await expect(popup.locator(".pp-head")).toContainText("Waking up");
      await expect(sk(page, "dock")).toBeVisible();
      await expect(page.locator(".sk-dock-text")).toContainText("Waking the voice engine", { timeout: 6000 });
      expect(await sk(page, "dock").getAttribute("data-state")).not.toBe("error");
      await ext.waitState("playing", 20_000);
      expect(app.engine.loads).toBe(1);
      await expect(popup.locator(".pp-head")).not.toContainText("Wakes on play");
      await expect(sk(page, "dock")).toHaveAttribute("data-state", "playing");
    } finally {
      await app.stop();
    }
  });

  test("the engine unloads when idle, health says so, and the next play reloads it without an error", async ({ ext }) => {
    const app = await startApp({ idleUnloadMs: 1500 });
    try {
      await ext.pair(app);
      const page = await ext.open("/article");
      const before = (await health(app)).engine;
      expect(before.state).toBe("ready");
      await readTab(ext, page);
      await ext.waitState("playing");
      expect(app.engine.unloads, "never unloads under an active stream").toBe(0);
      await ext.bg({ t: "player", command: { cmd: "stop" } });
      await expect.poll(() => app.engine.unloads, { timeout: 10_000 }).toBe(1);
      expect((await health(app)).engine.state).toBe("unloaded");
      expect(app.engine.status().state).toBe("unloaded");

      ext.resetCdp();
      await readTab(ext, page);
      await ext.waitState("playing", 20_000);
      expect(app.engine.loads).toBe(1);
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      expect((await health(app)).engine.state).toBe("ready");
    } finally {
      await app.stop();
    }
  });

  test("health reports when the idle unload is due", async ({ ext }) => {
    const app = await startApp({ idleUnloadMs: 60_000 });
    try {
      await ext.pair(app);
      const h = (await health(app)).engine;
      expect(h.state).toBe("ready");
      expect(h.idleUnloadAtMs).toBeGreaterThan(Date.now());
      expect(h.idleUnloadAtMs).toBeLessThanOrEqual(Date.now() + 60_000);
    } finally {
      await app.stop();
    }
  });
});

test.describe("model lifecycle: hold while paused", () => {
  test("pause holds the model past the idle window, resume releases the hold, then it unloads", async ({ ext }) => {
    const app = await startApp({ idleUnloadMs: 1200 });
    try {
      await ext.pair(app);
      const page = await ext.open("/article");
      await readTab(ext, page);
      await ext.waitState("playing");
      await ext.bg({ t: "player", command: { cmd: "pause" } });
      await ext.waitState("paused");
      await expect.poll(() => app.holds).toEqual([600_000]);
      await page.waitForTimeout(3600); // three idle windows
      expect(app.engine.unloads, "held model stays loaded while paused").toBe(0);
      expect((await health(app)).engine.state).toBe("ready");

      await ext.bg({ t: "player", command: { cmd: "resume" } });
      await ext.waitState("playing");
      await expect.poll(() => app.holds.at(-1)).toBe(0);
      await ext.bg({ t: "player", command: { cmd: "stop" } });
      await expect.poll(() => app.engine.unloads, { timeout: 10_000 }).toBe(1);
    } finally {
      await app.stop();
    }
  });
});

test.describe("offscreen document lifecycle", () => {
  test("the offscreen document closes after stop and a later play creates it again", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.fastIdleClose(1500);
    const page = await ext.open("/article");
    const hasDoc = () => ext.sw.evaluate(async () => (await (chrome.runtime as any).getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length);
    expect(await hasDoc()).toBe(0);
    await readTab(ext, page);
    await ext.waitState("playing");
    expect(await hasDoc()).toBe(1);
    await ext.bg({ t: "player", command: { cmd: "stop" } });
    await expect.poll(hasDoc, { timeout: 15_000 }).toBe(0);
    ext.resetCdp();
    expect((await ext.bgState()).status).toBe("idle");
    await readTab(ext, page);
    await expect.poll(hasDoc, { timeout: 10_000 }).toBe(1);
    await ext.waitState("playing", 20_000);
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
  });
});

test.describe("server work follows the tab", () => {
  test("closing the tab aborts the server-side synthesis", async ({ ext }) => {
    const app = await startApp({ latencyMs: 600 });
    try {
      await ext.pair(app);
      const page = await ext.open("/article");
      await readTab(ext, page);
      await expect.poll(() => app.engine.active, { timeout: 10_000 }).toBeGreaterThan(0);
      const aborted0 = app.engine.aborted;
      await page.close();
      await expect.poll(() => app.engine.active, { timeout: 8000 }).toBe(0);
      expect(app.engine.aborted).toBeGreaterThan(aborted0);
      await expect.poll(async () => (await ext.bgState()).status).toBe("idle");
      const calls = app.engine.calls.length;
      await new Promise((r) => setTimeout(r, 1500));
      expect(app.engine.calls.length, "nothing more is requested after the tab is gone").toBe(calls);
    } finally {
      await app.stop();
    }
  });
});

test.describe("concurrency", () => {
  const speak = (app: App, init: { replace?: boolean; text?: string } = {}) =>
    fetch(`http://127.0.0.1:${app.port}/v1/speak`, {
      method: "POST",
      headers: { Authorization: `Bearer ${app.token}`, "Content-Type": "application/json", ...(init.replace ? { "X-SpeakKit-Replace": "1" } : null) },
      body: JSON.stringify({ sentences: [init.text ?? "A sentence that takes a while to speak aloud.", "And a second one."], voice: "af_heart", speed: 1 }),
    });
  const drain = async (res: Response) => {
    const dec = new FrameDecoder();
    const types: string[] = [];
    if (!res.body) return types;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const f of dec.push(value)) types.push(f.header.type);
      }
    } catch {
      types.push("aborted");
    }
    return types;
  };

  test("the stream cap queues, then answers 429 busy; X-SpeakKit-Replace ends earlier streams and runs first", async ({ ext: _ext }) => {
    const app = await startApp({ latencyMs: 400, maxStreams: 1, maxQueue: 1 });
    try {
      const a = await speak(app); // running
      const b = speak(app); // queued: headers arrive only when it gets a slot
      await new Promise((r) => setTimeout(r, 300));
      const c = await speak(app); // over the queue limit
      expect(c.status).toBe(429);
      expect(c.headers.get("retry-after")).toBe("1");
      expect(((await c.json()) as { error: { code: string } }).error.code).toBe("busy");

      const d = await speak(app, { replace: true });
      expect(d.status).toBe(200);
      const [ta, tb, td] = await Promise.all([drain(a), b.then(drain), drain(d)]);
      expect(ta, "the running stream was replaced and ends without a done frame").not.toContain("done");
      expect(tb, "the queued stream was replaced and ends without frames").toEqual([]);
      expect(td.at(-1)).toBe("done");
      expect(app.hits("/v1/speak").filter((h) => h.replace)).toHaveLength(1);
    } finally {
      await app.stop();
    }
  });

  test("seek and speed changes send X-SpeakKit-Replace and never hit the cap", async ({ ext }) => {
    const app = await startApp({ latencyMs: 150 });
    try {
      const { popup } = await begin(ext, app);
      await listen(popup);
      await ext.waitState("playing");
      const plain = app.hits("/v1/speak").length;
      expect(app.hits("/v1/speak").some((h) => h.replace)).toBe(false);
      await ext.bg({ t: "player", command: { cmd: "set-speed", speed: 1.5 } });
      await ext.bg({ t: "player", command: { cmd: "set-speed", speed: 1.75 } });
      await ext.bg({ t: "player", command: { cmd: "set-speed", speed: 2 } });
      await ext.bg({ t: "player", command: { cmd: "next-block" } });
      await ext.bg({ t: "player", command: { cmd: "next-block" } });
      await expect.poll(() => app.hits("/v1/speak").filter((h) => h.replace).length).toBeGreaterThanOrEqual(3);
      expect(app.hits("/v1/speak").length).toBeGreaterThan(plain);
      await ext.waitState("playing");
      expect((await ext.state()).error).toBeUndefined();
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      // At most one stream is running at the end: the replaced ones were aborted on the server.
      await expect.poll(() => app.engine.active, { timeout: 5000 }).toBeLessThanOrEqual(1);
    } finally {
      await app.stop();
    }
  });
});
