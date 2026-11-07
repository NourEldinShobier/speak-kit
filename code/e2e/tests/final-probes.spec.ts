import { test, expect } from "../support/ext";
import { shell, sentence } from "../support/pages";
import { startApp } from "../support/servers";
import { readTab } from "../support/probe";

test.describe("release probes", () => {
  test("changing the port in Options points the extension at the app on the new port", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const opt = await ext.pair(app);
    await app.stop();
    const moved = await startApp({ token: app.token });
    try {
      await opt.getByRole("button", { name: "Test connection" }).click();
      await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "offline", { timeout: 10_000 });
      await opt.locator("#port").fill(String(moved.port));
      await opt.locator("#port").press("Tab");
      await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
      expect((await ext.settings()).port).toBe(moved.port);
    } finally {
      await moved.stop();
    }
  });

  test("a new token on the same port: the popup asks for the token and a new pairing works", async ({ ext, app }) => {
    ext.allowed.push(/401|Unauthorized/i);
    await ext.pair(app);
    await app.stop();
    const rotated = await startApp({ port: app.port, token: "rotated-token-" + "0".repeat(20) });
    try {
      const page = await ext.open("/short");
      const popup = await ext.popup(page);
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "token", { timeout: 15_000 });
      const opt = await ext.pair({ port: rotated.port, token: rotated.token });
      await opt.close();
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", /idle|finished/, { timeout: 15_000 });
    } finally {
      await rotated.stop();
    }
  });

  test("a page of 10,000 words is read from its first sentence without an error", async ({ ext, app }) => {
    const paragraph = (p: number) => `<p>${sentence(p, 1)} ${sentence(p, 2)}</p>`; // 14 words
    const html = shell("Big", `<main><article><h1>Big page</h1>${Array.from({ length: 715 }, (_, i) => paragraph(i + 1)).join("")}</article></main>`);
    ext.fx.set("/big", html);
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/big");
    const t0 = Date.now();
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing", 30_000);
    const state = await ext.state();
    expect(state.sentenceCount).toBeGreaterThan(1400);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });
});
