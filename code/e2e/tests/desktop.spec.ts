import { test, expect, begin } from "../support/ext";
import { readFileSync } from "node:fs";
import path from "node:path";
import { launch } from "../../apps/desktop/tests/harness";

test.describe("desktop companion @slow", () => {
  test("pair the extension with the token shown in the app, then read a page end to end", async ({ ext }) => {
    // The desktop app runs its in-process server with the fake engine; setup is marked done so it opens on Home.
    const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 } });
    try {
      await d.page.getByRole("heading", { name: "Home" }).waitFor();
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const token = (await d.page.getByTestId("token").textContent())!;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(await d.page.getByTestId("server-address").textContent()).toBe(`127.0.0.1:${d.port}`);

      const { page, popup } = await begin(ext, { port: d.port, token }, "/short");
      await ext.setSettings({ speed: 3 });
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await ext.waitState("playing");
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      await ext.waitState("finished", 30_000);
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "finished");

      // Regenerating the token in the app locks the extension out until it is paired again.
      ext.allowed.push(/401|Unauthorized/i);
      await d.page.getByRole("button", { name: "Regenerate" }).click();
      await d.page.waitForFunction(() => document.querySelector("[data-testid=token]")?.getAttribute("data-revealed") === "false");
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const fresh = (await d.page.getByTestId("token").textContent())!;
      expect(fresh).not.toBe(token);
      const popup2 = await ext.popup(page);
      await expect(popup2.locator(".pp")).toHaveAttribute("data-view", "token", { timeout: 15_000 });
      const opt = await ext.pair({ port: d.port, token: fresh });
      await opt.close();
      await expect(popup2.locator(".pp")).toHaveAttribute("data-view", /idle|finished/, { timeout: 15_000 });
    } finally {
      await d.cleanup();
    }
  });
});

const healthOf = (port: number) => fetch(`http://127.0.0.1:${port}/v1/health`).then((r) => r.json() as Promise<{ engine: { state: string; idleUnloadAtMs?: number | null } }>);

test.describe("desktop companion, setup and memory @slow", () => {
  test("setup wizard: the real extension pairs from the Connect step, Test connection turns Connected, and the page is read", async ({ ext }) => {
    const d = await launch({ env: { SPEAKKIT_TEST: "1" } });
    try {
      await d.page.getByRole("button", { name: /Get started/ }).click();
      await d.page.getByRole("button", { name: /^Continue/ }).click();
      await d.page.getByRole("heading", { name: "Connect your browser" }).waitFor();
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const token = (await d.page.getByTestId("token").textContent())!;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      await d.page.getByRole("button", { name: "Test connection" }).click();
      await d.page.getByText("Waiting for the extension's first call").waitFor();
      // Pair through the extension's options page: its health and auth-check calls are the first authenticated ones.
      const { page } = await begin(ext, { port: d.port, token }, "/short");
      await d.page.getByText("Connected", { exact: true }).first().waitFor({ timeout: 20_000 });
      expect(await d.page.getByRole("button", { name: /^Continue/ }).isEnabled()).toBe(true);
      await d.page.getByRole("button", { name: /^Continue/ }).click();

      await ext.setSettings({ speed: 3 });
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.waitState("playing");
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      await ext.waitState("finished", 30_000);
    } finally {
      await d.cleanup();
    }
  });

  test("Settings > Memory changes reach the server: idleUnloadAtMs follows 'Idle unload'", async ({ ext }) => {
    const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_TEST: "1" } });
    try {
      await d.page.getByRole("heading", { name: "Home" }).waitFor();
      const token = readFileSync(path.join(d.userData, "token"), "utf8").trim();
      const { page } = await begin(ext, { port: d.port, token }, "/short");
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.setSettings({ speed: 3 });
      await ext.waitState("finished", 30_000);
      const due = async () => (await healthOf(d.port)).engine.idleUnloadAtMs;
      await expect.poll(async () => (await healthOf(d.port)).engine.state).toBe("ready");
      const pick = async (name: string) => {
        await d.page.getByRole("combobox", { name: "Idle unload" }).click();
        await d.page.getByRole("option", { name }).click();
      };
      await d.page.getByRole("link", { name: "Settings" }).click();
      await d.page.getByRole("link", { name: "Memory" }).click();
      await pick("After 15 minutes");
      await expect.poll(async () => ((await due()) ?? 0) - Date.now(), { timeout: 10_000 }).toBeGreaterThan(14 * 60_000);
      await pick("After 1 minute");
      await expect.poll(async () => ((await due()) ?? 0) - Date.now(), { timeout: 10_000 }).toBeLessThan(61_000);
      expect(await due()).toBeGreaterThan(Date.now());
      await pick("Never");
      await expect.poll(async () => await due(), { timeout: 10_000 }).toBeFalsy();
    } finally {
      await d.cleanup();
    }
  });

  test("speakkit://launch from a second launch brings the hidden first instance forward", async () => {
    const first = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 } });
    try {
      await first.page.getByRole("heading", { name: "Home" }).waitFor();
      await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      const visible = () => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
      expect(await visible()).toBe(false);
      const second = await launch({ userData: first.userData, port: first.port, args: ["speakkit://launch"] }).catch(() => null);
      await expect.poll(visible, { timeout: 10_000 }).toBe(true);
      await second?.cleanup();
    } finally {
      await first.cleanup();
    }
  });
});
