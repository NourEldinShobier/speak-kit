import type { Page } from "@playwright/test";
import { test, expect, highlights, type Ext } from "../support/ext";
import { shell } from "../support/pages";
import { startApp } from "../support/servers";
import { readTab, stateOf } from "../support/probe";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const longPage = (tag: string) =>
  shell(
    tag,
    `<main><article><h1>Page ${tag}</h1>${[1, 2, 3, 4].map((p) => `<p>${tag}${p} the quiet harbor wakes before the first ferry leaves. ${tag}${p} the gulls circle the pier once more.</p>`).join("")}</article></main>`,
  );
const offscreenCount = (ext: Ext) => ext.sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length);

/** Stops the extension's service worker the way Chrome does when it is idle; it starts again on the next event. */
async function killWorker(ext: Ext, page: Page) {
  await ext.sw.evaluate(() => ((globalThis as { __alive?: number }).__alive = 1));
  const cdp = await ext.ctx.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await cdp.detach();
  // The old instance is gone when the running one has no marker.
  await expect
    .poll(
      async () =>
        ext.ctx
          .serviceWorkers()[0]
          ?.evaluate(() => (globalThis as { __alive?: number }).__alive)
          .catch(() => "dead"),
      { timeout: 10_000 },
    )
    .toBeUndefined();
}

test.describe("the service worker is killed", () => {
  test("mid-read: the reading carries on, the state is the same document, and the controls still work", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    const before = await ext.bgState();
    await killWorker(ext, page);
    const after = await ext.bgState();
    expect(after.status).toBe("playing");
    expect(after.docId).toBe(before.docId);
    expect(after.tabId).toBe(before.tabId);
    await expect.poll(async () => (await ext.bgState()).sentenceIndex, { timeout: 10_000 }).toBeGreaterThan(before.sentenceIndex);
    await expect(sk(page, "dock")).toHaveAttribute("data-state", "playing");
    await sk(page, "dock-toggle").click();
    await ext.waitState("paused");
    await expect(sk(page, "dock")).toHaveAttribute("data-state", "paused");
    await ext.cmd("stop");
    await ext.waitState("idle");
  });

  test("while paused: it is still paused afterwards and resumes", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    await ext.bg({ t: "player", command: { cmd: "pause" } });
    await ext.waitState("paused");
    await killWorker(ext, page);
    expect((await ext.bgState()).status).toBe("paused");
    await ext.bg({ t: "player", command: { cmd: "resume" } });
    await ext.waitState("playing");
    expect(await ext.peakRms(800)).toBeGreaterThan(0.02);
  });
});

test.describe("several tabs start reading at once", () => {
  test("exactly one output wins, the others show nothing and the player is not duplicated", async ({ ext, app }) => {
    const tags = ["TABA", "TABB", "TABC", "TABD"];
    tags.forEach((t) => ext.fx.set(`/race-${t}`, longPage(t)));
    await ext.pair(app);
    const pages: Page[] = [];
    for (const t of tags) pages.push(await ext.open(`/race-${t}`));
    await Promise.all(pages.map((p) => readTab(ext, p)));
    await ext.waitState("playing", 20_000);
    const ids = await Promise.all(pages.map((p) => ext.tabId(p)));
    const winner = tags[ids.indexOf((await ext.bgState()).tabId!)]!;
    expect(winner).toBeDefined();
    // Every start replaces the one before it. A request that was queued or sending when its tab lost is dropped before its next sentence.
    const tagOf = (t: string) => tags.find((x) => t.includes(x))!;
    await expect.poll(() => app.engine.calls.filter((c) => tagOf(c.text) === winner).length, { timeout: 15_000 }).toBe(9);
    await pages[0]!.waitForTimeout(2000);
    const afterWinner = app.engine.calls.slice(app.engine.calls.findLastIndex((c) => tagOf(c.text) === winner) + 1);
    expect(afterWinner.length, "sentences of losing tabs synthesized after the winner's last").toBe(0);
    expect((await ext.state()).docId).toBe((await ext.bgState()).docId);
    expect(await ext.peakRms(800)).toBeGreaterThan(0.02);
    for (let i = 0; i < pages.length; i++) expect((await highlights(pages[i]!)).sentence.length > 0, tags[i]).toBe(tags[i] === winner);
    expect(await offscreenCount(ext)).toBe(1);
    await ext.cmd("stop");
    await ext.waitState("idle");
    await expect.poll(() => app.engine.active, { timeout: 5000 }).toBe(0);
  });
});

test.describe("the app changes under a running extension", () => {
  test("the token is rotated while playing: the reading stops with a re-pair state, and pairing again works", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION|Failed to fetch|401|Unauthorized|offscreen/i);
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    const popup = await ext.popup(page);
    await readTab(ext, page);
    await ext.waitState("playing");
    await app.stop();
    const rotated = await startApp({ port: app.port, token: "rotated-token-" + "0".repeat(20) });
    try {
      // The fake engine had streamed the whole page already; the first request after the rotation is the one the new token must reject.
      await ext.bg({ t: "player", command: { cmd: "next-block" } });
      await expect.poll(async () => (await stateOf(ext)).code, { timeout: 30_000 }).toBe("token-rejected");
      expect((await stateOf(ext)).status).toBe("error");
      await expect(sk(page, "dock")).toHaveAttribute("data-state", "error");
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "token", { timeout: 10_000 });
      const frames = (await ext.hook()).frames;
      await page.waitForTimeout(1500);
      expect((await ext.hook()).frames, "no audio arrives after the token was rejected").toBe(frames);
      await ext.pair(rotated);
      await popup.reload();
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle", { timeout: 10_000 });
      expect((await readTab(ext, page)).ok).toBe(true);
      await ext.waitState("playing");
    } finally {
      await rotated.stop();
    }
  });

  test("the app comes back on another port: the extension says it is not running until it is paired with the new port", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    await ext.pair(app);
    const page = await ext.open("/article");
    const popup = await ext.popup(page);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
    const oldPort = app.port;
    await app.stop();
    const moved = await startApp({ token: app.token });
    try {
      expect(moved.port).not.toBe(oldPort);
      await popup.reload();
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "offline", { timeout: 10_000 });
      await readTab(ext, page);
      await expect.poll(async () => (await stateOf(ext)).code, { timeout: 15_000 }).toBe("app-not-running");
      const opt = await ext.ctx.newPage();
      await opt.goto(ext.url("options"));
      await opt.locator("#port").fill(String(moved.port));
      await opt.locator("#port").press("Enter");
      await expect.poll(async () => (await ext.settings()).port).toBe(moved.port);
      await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
      await popup.reload();
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle", { timeout: 10_000 });
      expect((await readTab(ext, page)).ok).toBe(true);
      await ext.waitState("playing");
    } finally {
      await moved.stop();
    }
  });
});

test.describe("rapid input", () => {
  test("five seconds of play, pause, skip, speed and voice changes leave one working stream", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    const res = await fetch(`http://127.0.0.1:${app.port}/v1/voices`, { headers: { authorization: `Bearer ${app.token}` } });
    const ids = ((await res.json()) as { voices: { id: string }[] }).voices.map((v) => v.id);
    const speeds = [1, 1.5, 2, 1.2, 3];
    const click = (name: string) =>
      sk(page, name)
        .evaluate((e: HTMLElement) => e.click())
        .catch(() => {});
    const end = Date.now() + 5000;
    for (let i = 0; Date.now() < end; i++) {
      switch (i % 6) {
        case 0:
        case 5:
          await click("dock-toggle");
          break;
        case 1:
          await click("dock-next");
          break;
        case 2:
          await click("dock-prev");
          break;
        case 3:
          await ext.bg({ t: "player", command: { cmd: "set-speed", speed: speeds[i % speeds.length]! } });
          break;
        default:
          await ext.bg({ t: "player", command: { cmd: "set-voice", voice: ids[i % ids.length]! } });
      }
    }
    // not stuck: whatever state it ended in, the controls still move it
    await expect.poll(async () => (await ext.bgState()).status, { timeout: 15_000 }).toMatch(/^(playing|paused)$/);
    if ((await ext.bgState()).status === "paused") await ext.bg({ t: "player", command: { cmd: "resume" } });
    await ext.waitState("playing", 15_000);
    const a = await ext.hook();
    await expect.poll(async () => (await ext.hook()).scheduledMs, { timeout: 10_000 }).toBeGreaterThan(a.scheduledMs);
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
    await expect(sk(page, "dock")).toHaveAttribute("data-state", "playing");
    expect(await offscreenCount(ext)).toBe(1);
    await ext.cmd("stop");
    await ext.waitState("idle");
    await expect.poll(() => app.engine.active, { timeout: 8000 }).toBe(0);
  });
});
