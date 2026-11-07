import type { Page } from "@playwright/test";
import { SAMPLE_RATE } from "@speakkit/protocol";
import { test, expect, begin, type Ext } from "../support/ext";
import { startApp } from "../support/servers";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const readTab = async (ext: Ext, page: Page, mode: "page" | "selection" = "page") => ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode });
const fakeHz = (text: string) => {
  // Mirrors FakeEngine: the tone of a sentence depends on a hash of its text.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return 200 + (h % 40) * 10;
};
/** Frequency with the most energy between 150 and 800 Hz in the current output (plain DFT, 4 Hz steps). */
const dominantHz = (w: number[]) => {
  let best = 0;
  let bestP = 0;
  for (let f = 150; f <= 800; f += 4) {
    let re = 0;
    let im = 0;
    const k = (2 * Math.PI * f) / SAMPLE_RATE;
    for (let i = 0; i < w.length; i += 2) {
      re += w[i]! * Math.cos(k * i);
      im += w[i]! * Math.sin(k * i);
    }
    const p = re * re + im * im;
    if (p > bestP) {
      bestP = p;
      best = f;
    }
  }
  return bestP > 1e-3 ? best : 0;
};
const windowed = (ext: Ext) => ext.off<{ w: number[]; idx: number }>(`({ w: window.__speakkit.wave(), idx: window.__speakkit.state.sentenceIndex })`);

test.describe("read-aloud pill (dock)", () => {
  test("all controls work, the paragraph text and progress follow playback", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    const dock = sk(page, "dock");
    await expect(dock).toBeVisible();
    await expect(dock).toHaveAttribute("data-state", "playing");
    // The in-page container carries the browser platform: Windows radii on Windows (window 10), the macOS set elsewhere (window 12).
    const win = process.platform === "win32";
    await expect(page.locator(".sk")).toHaveAttribute("data-platform", process.platform === "win32" || process.platform === "darwin" ? process.platform : "linux");
    expect(await dock.evaluate((e) => getComputedStyle(e).getPropertyValue("--radius-window").trim())).toBe(win ? "10px" : "12px");

    const text = page.locator(".sk-dock-text");
    await expect(text).toHaveText(/^Paragraph 1 of \d+ · /);
    const bar = sk(page, "seek").getByRole("progressbar");
    const p0 = Number(await bar.getAttribute("aria-valuenow"));
    await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow")), { timeout: 8000 }).toBeGreaterThan(p0);
    await expect(sk(page, "dock-voice")).toContainText("on device");
    await expect(sk(page, "dock-speed")).toHaveText(/\d(\.\d+)?×|\d(\.\d+)?x/);

    await sk(page, "dock-speed").click();
    await sk(page, "speed-1.5").click();
    await expect.poll(async () => (await ext.state()).speed).toBe(1.5);
    await expect(sk(page, "dock-speed")).toContainText("1.5");
    await sk(page, "dock-voice").click();
    await page.locator('[data-voice="bm_george"]').click();
    await expect(sk(page, "dock-voice")).toContainText("George");
    await expect.poll(() => app.engine.calls.at(-1)!.voice).toBe("bm_george");

    const para = async () => Number(/^Paragraph (\d+) of/.exec((await text.textContent()) ?? "")?.[1]);
    const n = await para();
    await sk(page, "dock-next").click();
    await expect.poll(para).toBeGreaterThan(n);
    const n2 = await para();
    await sk(page, "dock-prev").click();
    await expect.poll(para).toBe(n2 - 1);

    const s0 = (await ext.state()).sentenceIndex;
    const box = (await sk(page, "seek").boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
    await expect.poll(async () => (await ext.state()).sentenceIndex, { timeout: 8000 }).toBeGreaterThan(s0 + 5);

    await sk(page, "dock-toggle").click();
    await ext.waitState("paused");
    await expect(dock).toHaveAttribute("data-state", "paused");
    await expect(sk(page, "dock-toggle")).toHaveAttribute("aria-label", "Play");
    await sk(page, "dock-toggle").click();
    await ext.waitState("playing");
    await expect(sk(page, "dock-toggle")).toHaveAttribute("aria-label", "Pause");

    await sk(page, "dock-close").click();
    await expect.poll(async () => (await ext.bgState()).status).toBe("idle");
    await expect(dock).toHaveCount(0);
  });

  test("the voice list in the pill comes from the app's /v1/voices", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    const res = await fetch(`http://127.0.0.1:${app.port}/v1/voices`, { headers: { Authorization: `Bearer ${app.token}` } });
    const list = (await res.json()) as { voices: { id: string }[] };
    expect(list.voices.length).toBeGreaterThan(20);
    await sk(page, "dock-voice").click();
    await expect(page.locator("[data-voice]").first()).toBeVisible();
    const shown = await page.locator("[data-voice]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.voice));
    expect(shown.sort()).toEqual(list.voices.map((v) => v.id).sort());
  });

  test("finished shows 'Done · Read again' and replays", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false }, speed: 2 });
    const page = await ext.open("/short");
    await readTab(ext, page);
    await ext.waitState("finished", 30_000);
    await expect(page.locator(".sk-dock-text")).toHaveText("Done · Read again");
    await expect(sk(page, "dock-toggle")).toHaveAttribute("aria-label", "Replay");
    await sk(page, "dock-toggle").click();
    await ext.waitState("playing");
  });
});

test.describe("reader view", () => {
  test("opens from the launcher pill; reading settings change the view and persist; highlights move; closing keeps the audio", async ({ ext, app }) => {
    await ext.pair(app);
    let page = await ext.open("/article");
    await sk(page, "launcher-tab").hover();
    await sk(page, "launcher-reader").click();
    const reader = sk(page, "reader");
    await expect(reader).toBeVisible();
    await expect(reader.locator(".sk-reader-title")).toBeVisible();
    expect(await reader.locator(".sk-reader-block").count()).toBeGreaterThan(8);
    await expect(reader).toHaveAttribute("data-rtheme", "paper");
    await expect(reader).toHaveAttribute("data-rfont", "sans");

    await sk(page, "reader-settings").click();
    const panel = page.locator(".sk-pop-reading");
    await expect(panel).toBeVisible();
    await panel.getByRole("radio", { name: "Serif" }).click();
    await expect(reader).toHaveAttribute("data-rfont", "serif");
    await panel.getByRole("radio", { name: "Light" }).click();
    await expect(reader).toHaveAttribute("data-rtheme", "light");
    await expect(reader).toHaveAttribute("data-theme", "light");
    const size = panel.getByRole("slider", { name: "Text size" });
    await size.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await ext.settings()).reader?.size).toBe(19);
    await expect.poll(() => reader.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--rd-size"))).toBe("19px");
    await expect.poll(async () => (await ext.settings()).reader?.font).toBe("serif");
    expect((await ext.settings()).reader?.theme).toBe("light");
    await page.keyboard.press("Escape");

    await readTab(ext, page);
    await ext.waitState("playing");
    const cur = reader.locator(".sk-reader-s.is-sentence");
    await expect(cur).toHaveCount(1);
    await expect(reader.locator(".sk-reader-block.is-current")).toHaveCount(1);
    const first = await cur.getAttribute("data-s");
    await expect.poll(() => cur.getAttribute("data-s"), { timeout: 10_000 }).not.toBe(first);
    await expect(reader.locator(".sk-reader-w.is-word")).toHaveCount(1, { timeout: 5000 });

    const target = reader.locator(".sk-reader-block").nth(6);
    const startIdx = Number(await target.locator(".sk-reader-s").first().getAttribute("data-s"));
    await target.click();
    await expect.poll(async () => (await ext.state()).sentenceIndex, { timeout: 8000 }).toBeGreaterThanOrEqual(startIdx);
    await expect(target).toHaveClass(/is-current/, { timeout: 8000 });

    await sk(page, "reader-settings").click();
    await page.locator(".sk-pop-reading").getByRole("switch").click();
    await expect(reader).toHaveAttribute("data-rhl", "off");
    await expect.poll(async () => (await ext.settings()).reader?.highlight).toBe(false);
    await page.keyboard.press("Escape");

    await sk(page, "reader-close").click();
    await expect(reader).toHaveCount(0);
    expect((await ext.state()).status).toBe("playing");
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
    await ext.bg({ t: "player", command: { cmd: "stop" } });

    // The choices persist: reopen from the popup on a fresh load
    await page.close(); // tabs are found by URL
    page = await ext.open("/article");
    const popup = await ext.popup(page);
    await popup.getByRole("button", { name: "Reader view" }).click();
    const again = sk(page, "reader");
    await expect(again).toBeVisible();
    await expect(again).toHaveAttribute("data-rfont", "serif");
    await expect(again).toHaveAttribute("data-rtheme", "light");
    await expect(again).toHaveAttribute("data-rhl", "off");
    await page.keyboard.press("Escape");
    await expect(again).toHaveCount(0);
  });
});

test.describe("speeds above 2x (SoundTouch)", () => {
  /** Share of samples whose dominant frequency is the tone the engine made for the sentence playing (or a neighbour). */
  async function pitchMatches(ext: Ext, app: { engine: { calls: { text: string }[] } }, n: number) {
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const { w, idx } = await windowed(ext);
      const hz = dominantHz(w);
      const want = [idx - 1, idx, idx + 1].filter((k) => k >= 0 && app.engine.calls[k]).map((k) => fakeHz(app.engine.calls[k]!.text));
      if (hz && want.some((f) => Math.abs(hz - f) / f < 0.04)) ok++;
      await new Promise((r) => setTimeout(r, 150));
    }
    return ok / n;
  }

  test("1x baseline: the pitch estimator recognises the tone, playback is gapless", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ speed: 1 });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    expect((await ext.hook()).rate).toBe(1);
    expect(await pitchMatches(ext, app, 14)).toBeGreaterThanOrEqual(0.6);
    expect(await ext.off<number>("window.__speakkit.maxLateMs")).toBeLessThan(30);
  });

  test("3x: playbackRate 1.5 on top of the model's 2x, pitch is preserved, scheduling is gapless", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ speed: 3 });
    const page = await ext.open("/article");
    await readTab(ext, page);
    await ext.waitState("playing");
    await expect.poll(async () => (await ext.hook()).rate).toBe(1.5);
    expect(app.engine.calls[0]!.speed).toBe(2);
    expect(await pitchMatches(ext, app, 14), "pitch matches the unstretched tone, not 1.5x higher").toBeGreaterThanOrEqual(0.6);
    await page.waitForTimeout(3000);
    expect(await ext.off<number>("window.__speakkit.maxLateMs")).toBeLessThan(30);
    expect((await ext.state()).sentenceIndex).toBeGreaterThan(3);
    // Pause and resume keep the stretch graph working
    await ext.bg({ t: "player", command: { cmd: "pause" } });
    await ext.waitState("paused");
    await ext.bg({ t: "player", command: { cmd: "resume" } });
    await ext.waitState("playing");
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
  });
});

test.describe("deep link", () => {
  test("Open Speak Kit opens speakkit://launch; once the app answers the popup recovers", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const { popup } = await begin(ext, app);
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle");
    // Fake protocol handler: no tab is opened (Chrome would show an external-protocol prompt); the link is recorded.
    await ext.sw.evaluate(() => {
      const g = globalThis as unknown as { __created: string[] };
      g.__created = [];
      (chrome.tabs as unknown as { create: (p: { url: string }) => Promise<{ id: number }> }).create = async (p) => (g.__created.push(p.url), { id: 987654 });
    });
    await app.stop();
    await popup.reload();
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "offline", { timeout: 10_000 });
    await popup.getByRole("button", { name: "Open Speak Kit" }).click();
    // The fake protocol handler: when Chrome is sent to speakkit://launch, the "OS" starts the app.
    await expect.poll(() => ext.sw.evaluate(() => (globalThis as unknown as { __created: string[] }).__created), { timeout: 8000 }).toContain("speakkit://launch");
    await app.start();
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle", { timeout: 15_000 });
  });
});

test.describe("offscreen memory", () => {
  test("decoded audio stays within the lookahead window across many paragraph jumps", async ({ ext }) => {
    test.setTimeout(120_000);
    const app = await startApp();
    try {
      await ext.pair(app);
      await ext.setSettings({ speed: 3 });
      const page = await ext.open("/big");
      await readTab(ext, page);
      await ext.waitState("playing", 30_000);
      const held = () => ext.off<number>("window.__speakkit.retainedBytes");
      let max = 0;
      for (let i = 0; i < 250; i++) {
        await ext.bg({ t: "player", command: { cmd: "next-block" } });
        if (i % 25 === 0) {
          await page.waitForTimeout(200);
          max = Math.max(max, await held());
        }
      }
      await page.waitForTimeout(800);
      max = Math.max(max, await held());
      // 24 kHz float32 audio: a few seconds per sentence, a handful of sentences scheduled ahead.
      expect(max, "bytes of decoded audio held by the player").toBeLessThan(8 * 1024 * 1024);
      await ext.bg({ t: "player", command: { cmd: "stop" } });
      await expect.poll(held, { timeout: 5000 }).toBe(0);
    } finally {
      await app.stop();
    }
  });
});
