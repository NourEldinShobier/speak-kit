import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, begin, DIST, type Ext } from "../support/ext";

/**
 * Chrome's own surfaces (the context menu, keyboard shortcuts, the toolbar) cannot be clicked from Playwright. What can be proven:
 * what the extension registered with Chrome (read back through the service worker) and that the handlers Chrome calls do the work.
 */
const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) as { commands: Record<string, { suggested_key: { default: string }; description: string }> };

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const created = (ext: Ext) => ext.sw.evaluate(() => (globalThis as unknown as { __created: string[] }).__created);
/** Chrome is sent to speakkit://launch: record the link instead of opening an external-protocol prompt. */
const fakeProtocolHandler = (ext: Ext) =>
  ext.sw.evaluate(() => {
    const g = globalThis as unknown as { __created: string[]; __removed: number[] };
    g.__created = [];
    g.__removed = [];
    const tabs = chrome.tabs as unknown as { create: (p: { url: string }) => Promise<{ id: number }>; remove: (id: number) => Promise<void> };
    tabs.create = async (p) => (g.__created.push(p.url), { id: 987654 });
    tabs.remove = async (id) => void g.__removed.push(id);
  });

test.describe("keyboard shortcuts as Chrome has them registered", () => {
  test("names, descriptions and default keys match the manifest, and no two commands share a key", async ({ ext }) => {
    const all = (await ext.sw.evaluate(() => chrome.commands.getAll())) as { name: string; description: string; shortcut: string }[];
    const cmds = all.filter((c) => c.name !== "_execute_action");
    // chrome.commands.getAll returns them sorted by name
    expect(cmds.map((c) => [c.name, c.description, c.shortcut]).sort()).toEqual([
      ["play-pause", "Play / pause", "Ctrl+Shift+Y"],
      ["read-selection", "Read selection or page", "Ctrl+Shift+S"],
      ["stop", "Stop reading", "Ctrl+Shift+X"],
    ]);
    const keys = Object.values(manifest.commands).map((c) => c.suggested_key.default);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["Ctrl+Shift+S", "Ctrl+Shift+Y", "Ctrl+Shift+X"]);
  });

  test("the options page and the popup show the keys Chrome reports", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#shortcuts");
    for (const label of ["Read selection", "Play / pause", "Stop"]) await expect(opt.getByText(label, { exact: false }).first()).toBeVisible();
    for (const key of ["Ctrl", "Shift", "S", "Y", "X"]) await expect(opt.locator(".lm-kbd", { hasText: new RegExp(`^${key}$`) }).first()).toBeVisible();
  });
});

test.describe("context menu as registered with Chrome", () => {
  test("SpeakKit parent with Read selection, Read from here and Add to queue", async ({ ext }) => {
    await expect.poll(() => ext.sw.evaluate(() => (globalThis as any).__speakkit.menuDefs())).toEqual([
      { id: "speakkit", title: "SpeakKit", contexts: ["all"] },
      { id: "speakkit-read-selection", parentId: "speakkit", title: "Read selection", contexts: ["selection"] },
      { id: "speakkit-read-from-here", parentId: "speakkit", title: "Read from here", contexts: ["all"] },
      { id: "speakkit-add-queue", parentId: "speakkit", title: "Add to queue", contexts: ["all"] },
    ]);
  });

  test("turning the context menu off removes every entry, turning it on brings them back", async ({ ext }) => {
    await expect.poll(() => ext.menuTitles()).toHaveLength(4);
    await ext.setSettings({ show: { contextMenu: false } });
    await expect.poll(() => ext.menuTitles()).toEqual([]);
    await ext.setSettings({ show: { contextMenu: true } });
    await expect.poll(() => ext.menuTitles()).toEqual(["SpeakKit", "Read selection", "Read from here", "Add to queue"]);
  });

  test("each entry's click handler does what its title says", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.locator("#b").click({ clickCount: 3 });
    await ext.menu("speakkit-read-selection", page, "selection");
    await ext.waitState("playing");
    expect((await ext.state()).sentenceCount).toBe(3);
    const other = await ext.open("/short");
    await ext.menu("speakkit-add-queue", other);
    await expect.poll(async () => (await ext.bg<{ items: unknown[] }>({ t: "get-queue" })).items.length).toBe(1);
  });
});

test.describe("Open SpeakKit and the app not running", () => {
  test("the launch link is speakkit://launch; the helper tab is closed again once the app answers", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    await ext.pair(app);
    await fakeProtocolHandler(ext);
    await app.stop();
    const launching = ext.bg<{ ok: boolean; via: string }>({ t: "launch-app" });
    await expect.poll(() => created(ext), { timeout: 5000 }).toEqual(["speakkit://launch"]);
    await app.start();
    expect(await launching).toEqual({ ok: true, via: "protocol" });
    expect(await ext.sw.evaluate(() => (globalThis as unknown as { __removed: number[] }).__removed)).toEqual([987654]);
  });

  test("with the app already running no link is opened", async ({ ext, app }) => {
    await ext.pair(app);
    await fakeProtocolHandler(ext);
    expect(await ext.bg({ t: "launch-app" })).toEqual({ ok: true, via: "running" });
    expect(await created(ext)).toEqual([]);
  });

  test("when the app never starts the popup says so and stays usable", async ({ ext, app }) => {
    test.setTimeout(90_000);
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const { popup } = await begin(ext, app);
    await fakeProtocolHandler(ext);
    await app.stop();
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "offline", { timeout: 10_000 });
    await popup.getByRole("button", { name: "Open SpeakKit" }).click();
    await expect(popup.getByRole("status")).toContainText("Starting SpeakKit", { timeout: 5000 });
    await expect(popup.getByRole("status")).toContainText("SpeakKit did not start", { timeout: 20_000 });
    await expect(popup.getByRole("button", { name: "Open SpeakKit" })).toBeEnabled();
    await app.start();
    await expect(popup.locator(".pp")).toHaveAttribute("data-view", "idle", { timeout: 15_000 });
  });

  test("the in-page error dock: Open app starts the app, Retry then reads without reloading the page", async ({ ext, app }) => {
    test.setTimeout(90_000);
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    await ext.pair(app);
    await ext.setSettings({ launcher: { enabled: false } });
    const page = await ext.open("/article");
    await fakeProtocolHandler(ext);
    await app.stop();
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await expect(sk(page, "dock-open-app")).toBeVisible({ timeout: 15_000 });
    await sk(page, "dock-open-app").click();
    await expect.poll(() => created(ext), { timeout: 8000 }).toContain("speakkit://launch");
    await app.start();
    await sk(page, "dock-retry").click();
    await ext.waitState("playing", 20_000);
  });
});
