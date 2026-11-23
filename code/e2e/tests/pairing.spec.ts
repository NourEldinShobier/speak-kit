import { test, expect } from "../support/ext";
import { startApp } from "../support/servers";

test.describe("pairing and connection", () => {
  test("pairs through the options page and shows the connected state", async ({ ext, app }) => {
    const opt = await ext.pair(app);
    await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok");
    await expect(opt.locator(".op-conn-s")).toContainText("ready");
    // The token lives in local storage, never in sync storage.
    const local = await ext.sw.evaluate(() => chrome.storage.local.get("speakkit.token"));
    expect(local["speakkit.token"]).toBe(app.token);
    const sync = JSON.stringify(await ext.sw.evaluate(() => chrome.storage.sync.get(null)));
    expect(sync).not.toContain(app.token);
    expect((await ext.sw.evaluate(() => chrome.storage.local.get("speakkit.port")))["speakkit.port"]).toBe(app.port);
  });

  test("a wrong token is rejected and the token field waits for the right one", async ({ ext, app }) => {
    const opt = await ext.pair({ port: app.port, token: "not-the-token-0000" }, false);
    await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "token", { timeout: 10_000 });
    await expect(opt.getByText("Pairing token rejected")).toBeVisible();
    await expect(opt.locator("#token")).toHaveValue("");
    // Fix it by pasting the right one.
    await opt.locator("#token").fill(app.token);
    await opt.locator("#token").press("Enter");
    await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok", { timeout: 10_000 });
  });

  test("app not running shows offline, then recovers when it starts", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const opt = await ext.pair(app);
    await app.stop();
    await opt.getByRole("button", { name: "Test connection" }).click();
    await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "offline", { timeout: 10_000 });
    await expect(opt.getByText("Speak Kit isn't running")).toBeVisible();
    await app.start();
    // The page polls every 3 s by itself.
    await expect(opt.locator(".op-conn")).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
  });

  test("engine states are shown while the model starts", async ({ ext, appOptions: _o }) => {
    const slow = await startApp({ state: "downloading" });
    slow.engine.setStatus({ state: "downloading", progress: 0.4 });
    try {
      const opt = await ext.pair(slow);
      await expect(opt.locator(".op-conn-s")).toContainText("Downloading Kokoro-82M, 40%");
      slow.engine.setStatus({ state: "loading" });
      await opt.getByRole("button", { name: "Test connection" }).click();
      await expect(opt.locator(".op-conn-s")).toContainText("starting");
      slow.engine.setStatus({ state: "ready" });
      await opt.getByRole("button", { name: "Test connection" }).click();
      await expect(opt.locator(".op-conn-s")).toContainText("is ready");
    } finally {
      await slow.stop();
    }
  });
});
