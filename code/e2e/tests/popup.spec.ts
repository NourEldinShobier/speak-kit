import { test, expect, begin } from "../support/ext";
import { startApp } from "../support/servers";

const view = (popup: import("@playwright/test").Page) => popup.locator(".pp");

test.describe("popup states", () => {
  test("not paired -> install state; wrong token -> not paired state", async ({ ext, app }) => {
    const page = await ext.open("/article");
    const popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "install");
    const opt = await ext.pair({ port: app.port, token: "definitely-wrong-token" }, false);
    await opt.close();
    const popup2 = await ext.popup(page);
    await expect(view(popup2)).toHaveAttribute("data-view", "token", { timeout: 8000 });
    await expect(popup2.getByRole("button", { name: "Re-pair" })).toBeVisible();
  });

  test("app offline -> offline state, and back to idle when the app returns", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const { popup } = await begin(ext, app);
    await expect(view(popup)).toHaveAttribute("data-view", "idle");
    await app.stop();
    await expect(view(popup)).toHaveAttribute("data-view", "offline", { timeout: 10_000 });
    await app.start();
    await expect(view(popup)).toHaveAttribute("data-view", "idle", { timeout: 10_000 });
  });

  test("engine loading -> loading state with progress, then idle when ready", async ({ ext }) => {
    const slow = await startApp({ state: "downloading" });
    try {
      slow.engine.setStatus({ state: "downloading", progress: 0.25 });
      const { popup } = await begin(ext, slow);
      await expect(view(popup)).toHaveAttribute("data-view", "loading-model", { timeout: 8000 });
      await expect(popup.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
      slow.engine.setStatus({ state: "ready" });
      await expect(view(popup)).toHaveAttribute("data-view", "idle", { timeout: 10_000 });
    } finally {
      await slow.stop();
    }
  });

  test("restricted page (chrome://) -> page unreadable", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.ctx.newPage();
    await page.goto("chrome://version");
    const popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "unreadable");
  });

  test("a restricted page cannot be started from the keyboard shortcut either", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.ctx.newPage();
    await page.goto("chrome://version");
    await ext.cmd("read-selection", page);
    await expect.poll(async () => (await ext.bg<{ status: string; error?: { code: string } }>({ t: "get-state" })).error?.code).toBe("page-unreadable");
  });

  test("selection on the page -> selection state -> reads only the selection", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.locator("#c").click({ clickCount: 3 });
    await page.mouse.click(5, 500); // collapse nothing: re-select programmatically so the popup sees it
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById("c")!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    const popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "selection");
    await popup.getByRole("button", { name: "Listen to selection" }).click();
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBeGreaterThanOrEqual(3);
    expect(app.engine.calls.every((c) => c.text.startsWith("P3S"))).toBe(true);
    expect((await ext.state()).sentenceCount).toBe(3);
  });

  test("voice preview plays a sample without changing the saved voice", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await popup.getByRole("button", { name: /^Voice:/ }).click();
    await popup.getByRole("button", { name: "Preview Emma" }).click();
    await expect.poll(() => app.engine.calls.at(-1)?.voice).toBe("bf_emma");
    await ext.waitState("playing");
    expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
    expect((await ext.settings()).voice ?? "af_heart").toBe("af_heart");
  });

  test("the voice list comes from the app for the dock too", async ({ ext, app }) => {
    await ext.pair(app);
    const r = await ext.bg<{ ok: boolean; voices: { id: string; name: string; desc: string; quality: string }[] }>({ t: "get-voices" });
    expect(r.ok).toBe(true);
    expect(r.voices.length).toBe(28);
    expect(r.voices.find((v) => v.id === "bf_emma")).toMatchObject({ name: "Emma", desc: "UK English" });
  });
});
