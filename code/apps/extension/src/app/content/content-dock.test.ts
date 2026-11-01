/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vite-plus/test";
import { KEY, base, st, deliver, sent, lastPlay, box, startPage, contentSession } from "../../testing/content-page";

const { open } = contentSession();

describe("floating dock (B4-B9, B15, B16)", () => {
  const dockSettings = (over: any = {}) => base({ launcher: { ...base().launcher, enabled: false }, ...over });

  test("idle dock only with the always-dock rule: 'Read this page' with the time estimate", async () => {
    let page = await open(dockSettings());
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=dock]").count()).toBe(0);
    await page.context().close();
    page = await open(dockSettings({ sites: { "sk.test": "always-dock" } }));
    await page.waitForSelector("[data-sk=dock]");
    const txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Read this page");
    expect(txt).toMatch(/\d+ min \d+ s at 1\.2x|\d+ s at 1\.2x/);
    await page.click("[data-sk=dock-play]");
    expect((await lastPlay(page)).source).toBe("page");
    await page.context().close();
  });

  test("idle dock says the engine is asleep and wakes on play only when the app reports it unloaded (B22)", async () => {
    const health = (state: string) => ({ ok: true, ms: 3, health: { engine: { id: "kokoro", state } } });
    let page = await open(dockSettings({ sites: { "sk.test": "always-dock" } }), { health: health("unloaded") });
    await page.waitForSelector("[data-sk=dock]");
    await page.waitForFunction(() => document.querySelector("speakkit-ui")!.shadowRoot!.textContent!.includes("Engine asleep"));
    expect(await page.locator("[data-sk=dock] .sk-sub").innerText()).toBe("Engine asleep · wakes on play");
    await page.context().close();
    page = await open(dockSettings({ sites: { "sk.test": "always-dock" } }), { health: health("ready") });
    await page.waitForSelector("[data-sk=dock]");
    await page.waitForTimeout(300);
    expect(await page.locator("[data-sk=dock] .sk-sub").innerText()).toMatch(/at 1\.2x/);
    await page.context().close();
  });

  test("preparing shows a spinner and 'Preparing voice...', playing shows time, speed and voice", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "preparing", elapsedMs: 0, totalMs: 0 }) });
    await page.waitForSelector("[data-sk=dock]");
    let txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Preparing voice...");
    expect(await page.locator("[data-sk=dock-toggle] .lm-spin").count()).toBe(1);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    txt = await page.locator("[data-sk=dock]").innerText();
    expect(txt).toContain("Paragraph 1 of 9 \u00b7 4 min left");
    expect(txt).toContain("1.2x");
    expect(txt).toContain("Heart \u00b7 on device");
    expect(await page.locator("[data-sk=dock-voice] .lm-avatar").textContent()).toBe("H");
    const d = await box(page, "[data-sk=dock]");
    // Lumen F5 read-aloud pill is 52 px tall (docs/screen-map.md); 6 px padding around the 40 px play button gives 52 to 54.
    expect(d.height).toBeGreaterThanOrEqual(52);
    expect(d.height).toBeLessThanOrEqual(56);
    expect(Math.abs(d.y + d.height - (720 - 24))).toBeLessThan(1);
    expect(Math.abs(d.x + d.width / 2 - 640)).toBeLessThan(1);
    await page.context().close();
  });

  test("controls send the right commands", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-toggle]");
    await page.click("[data-sk=dock-prev]");
    await page.click("[data-sk=dock-next]");
    const bar = await box(page, "[data-sk=seek]");
    await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds.slice(-4, -1)).toEqual([{ cmd: "toggle" }, { cmd: "prev-block" }, { cmd: "next-block" }]);
    const seek = cmds.at(-1);
    expect(seek.cmd).toBe("seek-ms");
    expect(Math.abs(seek.deltaMs - (0.5 * 408000 - 147000))).toBeLessThan(4000);
    await page.context().close();
  });

  test("paused shows 'Paused'; finished shows 'Finished' and replay restarts from the first sentence", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "paused" }) });
    expect(await page.locator("[data-sk=dock-toggle]").getAttribute("aria-label")).toBe("Play"); // paused: the pill offers Play
    expect(await page.locator("[data-sk=dock]").getAttribute("data-state")).toBe("paused");
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "finished", elapsedMs: 408000 }) });
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("Done · Read again");
    expect(await page.locator("[data-sk=dock-toggle]").getAttribute("aria-label")).toBe("Replay");
    await page.click("[data-sk=dock-toggle]");
    const d = await lastPlay(page);
    expect(d.docId).toBe(doc.docId);
    expect(d.startIndex).toBe(0);
    await page.context().close();
  });

  test("error shows one surface with Open app, Retry and Details", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "error", error: { code: "app-not-running", message: "connect ECONNREFUSED 127.0.0.1:47615" } }) });
    await page.waitForSelector("[data-sk=dock]");
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("Speak Kit isn't running");
    await page.click("[data-sk=dock-open-app]");
    expect((await sent(page)).at(-1)).toEqual({ t: "open-app" });
    await page.click("[data-sk=dock-details]");
    expect(await page.locator("[data-sk=dock-details-text]").textContent()).toContain("ECONNREFUSED");
    await page.click("[data-sk=dock-retry]");
    expect((await sent(page)).at(-1).command.cmd).toBe("play");
    await page.context().close();
  });

  test("with the launcher enabled the dock appears only for errors and the finished state", async () => {
    const page = await open();
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    expect(await page.locator("[data-sk=dock]").count()).toBe(0);
    await deliver(page, { t: "state", state: st({ docId: doc.docId, status: "error", error: { code: "token-rejected" } }) });
    expect(await page.locator("[data-sk=dock]").innerText()).toContain("needs to be paired");
    await page.context().close();
  });

  test("speed popover: presets, slider and reset send set-speed (B15)", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-speed]");
    await page.waitForSelector("[data-sk=popover-speed]");
    const pop = await box(page, "[data-sk=popover-speed]");
    const trig = await box(page, "[data-sk=dock-speed]");
    expect(pop.width).toBe(300); // the popover surface is 300 wide
    expect(Math.abs(pop.x + pop.width - (trig.x + trig.width))).toBeLessThan(1);
    expect(Math.abs(pop.y + pop.height - (await box(page, "[data-sk=dock]")).y + 26)).toBeLessThan(1.5);
    await page.click("[data-sk=speed-1\\.5]");
    await page.click("[data-sk=speed-reset]");
    const cmds = (await sent(page)).filter((m) => m.t === "player").map((m) => m.command);
    expect(cmds.slice(-2)).toEqual([
      { cmd: "set-speed", speed: 1.5 },
      { cmd: "set-speed", speed: 1 },
    ]);
    // the slider is a Radix-style slider: keys move it by 0.05 and commit
    await page.focus("[data-sk=popover-speed] [role=slider]");
    await page.keyboard.press("End");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-speed", speed: 3 } });
    await page.keyboard.press("ArrowLeft");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-speed", speed: 2.95 } });
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-sk=popover-speed]", { state: "detached" });
    await page.context().close();
  });

  test("voice popover lists voices, filters, selects and previews (B16)", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.evaluate(() => {
      (window as any).__voices = [
        { id: "af_heart", name: "Heart", desc: "US English", quality: "A" },
        { id: "af_bella", name: "Bella", desc: "US English", quality: "A-" },
        { id: "bf_emma", name: "Emma", desc: "UK English", quality: "B-" },
      ];
    });
    await page.click("[data-sk=dock-voice]");
    await page.waitForSelector("[data-sk=popover-voice]");
    await page.waitForSelector("[data-sk=popover-voice] .sk-vrow");
    expect(await page.locator("[data-sk=popover-voice] .sk-pop-count").textContent()).toBe("3 voices");
    expect(await page.locator("[data-sk=popover-voice] .sk-vrow.is-selected b").textContent()).toBe("Heart");
    await page.fill("[data-sk=popover-voice] input", "emm");
    expect(await page.locator("[data-sk=popover-voice] .sk-vrow").count()).toBe(1);
    await page.fill("[data-sk=popover-voice] input", "bel");
    await page.click("[data-sk=popover-voice] .sk-vrow [data-sk=voice-preview]");
    expect((await sent(page)).at(-1)).toEqual({ t: "preview-voice", voice: "af_bella" });
    await page.click("[data-sk=popover-voice] .sk-vrow b");
    expect((await sent(page)).at(-1)).toEqual({ t: "player", command: { cmd: "set-voice", voice: "af_bella" } });
    expect(await page.locator("[data-sk=dock-voice] .lm-avatar").textContent()).toBe("B");
    await page.context().close();
  });

  test("menu: Hide on this site stores the rule and removes the controls", async () => {
    const page = await open(dockSettings());
    const doc = await startPage(page);
    await deliver(page, { t: "state", state: st({ docId: doc.docId }) });
    await page.click("[data-sk=dock-more]");
    await page.click("[data-sk=menu-hide-site]");
    await page.waitForFunction((k: string) => (window as any).__store[k]?.sites?.["sk.test"] === "hide-controls", KEY);
    await page.waitForSelector("[data-sk=dock]", { state: "detached" });
    expect(await page.locator("[data-sk=toast]").textContent()).toContain("Controls hidden");
    await page.context().close();
  });
});
