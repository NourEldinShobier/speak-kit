import http from "node:http";
import type { Page } from "@playwright/test";
import { test, expect, begin, type Ext } from "../support/ext";
import { startApp, type App } from "../support/servers";
import { axeViolations, layoutIssues } from "../support/ui-checks";

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);

/** Axe (WCAG 2.2 AA) and the layout checks (light only). */
async function audit(page: Page, label: string, opts: { include?: string; scope?: string } = {}) {
  // axe reads colours mid-transition otherwise
  await page.waitForFunction(() => !document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === "running"));
  expect(await axeViolations(page, opts.include), `axe: ${label}`).toEqual([]);
  expect(await layoutIssues(page, opts.scope), `layout: ${label}`).toEqual([]);
}
const view = (popup: Page) => popup.locator(".pp");

test.describe("popup: every state is accessible and fits", () => {
  test("install, token, unreadable page, PDF, file permission", async ({ ext, app }) => {
    await ext.setSettings({ port: 58123 }); // nothing listens here, so a machine with a real SpeakKit on the default port still starts unpaired
    const page = await ext.open("/article");
    let popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "install");
    await audit(popup, "popup install");
    await popup.close();

    const opt = await ext.pair({ port: app.port, token: "definitely-wrong-token" }, false);
    await opt.close();
    popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "token", { timeout: 8000 });
    await audit(popup, "popup token");
    await popup.close();

    await ext.pair(app);
    const pdf = await ext.open("/paper.pdf");
    popup = await ext.popup(pdf);
    await expect(view(popup)).toHaveAttribute("data-view", "pdf");
    await expect(popup.getByRole("button", { name: "Paste text in the app" })).toBeVisible();
    await audit(popup, "popup pdf");
    await popup.close();

    const restricted = await ext.ctx.newPage();
    await restricted.goto("chrome://version");
    popup = await ext.popup(restricted);
    await expect(view(popup)).toHaveAttribute("data-view", "unreadable");
    await audit(popup, "popup unreadable");

    const p = await ext.ctx.newPage();
    await p.goto(ext.url("popup", `?tab=${await ext.tabId(page)}&view=fileurl`));
    await expect(view(p)).toHaveAttribute("data-view", "fileurl");
    await audit(p, "popup file permission");
  });

  test("offline and recovery", async ({ ext, app }) => {
    ext.allowed.push(/ERR_CONNECTION_REFUSED|Failed to fetch/);
    const { popup } = await begin(ext, app);
    await app.stop();
    await expect(view(popup)).toHaveAttribute("data-view", "offline", { timeout: 10_000 });
    await audit(popup, "popup offline");
  });

  test("version mismatch", async ({ ext, app }) => {
    ext.allowed.push(/version/i);
    const { popup } = await begin(ext, app);
    const old = http.createServer((_, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ app: "speakkit", version: "9.0.0", apiVersion: 2, engine: { id: "kokoro", state: "ready" } }));
    });
    await new Promise<void>((r) => old.listen(0, "127.0.0.1", r));
    try {
      await ext.setSettings({ port: (old.address() as { port: number }).port });
      await expect(view(popup)).toHaveAttribute("data-view", "version", { timeout: 10_000 });
      await expect(popup.getByRole("button", { name: "Download the latest app" })).toBeVisible();
      await expect(popup.getByText("Update needed")).toBeVisible();
      await audit(popup, "popup version mismatch");
    } finally {
      old.close();
    }
  });

  test("engine missing and model loading", async ({ ext }) => {
    const missing = await startApp({ state: "missing" });
    try {
      const { popup } = await begin(ext, missing);
      await expect(view(popup)).toHaveAttribute("data-view", "engine-missing", { timeout: 8000 });
      await audit(popup, "popup engine missing");
      missing.engine.setStatus({ state: "downloading", progress: 0.4 });
      await expect(view(popup)).toHaveAttribute("data-view", "loading-model", { timeout: 10_000 });
      await audit(popup, "popup loading model");
    } finally {
      await missing.stop();
    }
  });

  test("idle, selection, voice picker, speed panel", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    let popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "idle");
    await audit(popup, "popup idle");
    await popup.getByRole("button", { name: /^Speed/ }).click();
    await audit(popup, "popup speed panel");
    await popup.getByRole("button", { name: /^Speed/ }).click();
    await popup.getByRole("button", { name: /^Voice:/ }).click();
    await expect(popup.getByRole("heading", { name: "Voice" })).toBeVisible();
    await audit(popup, "popup voice picker");
    await popup.close();

    await page.locator("#a").click({ clickCount: 3 });
    popup = await ext.popup(page);
    await expect(view(popup)).toHaveAttribute("data-view", "selection");
    await audit(popup, "popup selection");
  });

  test("playing, paused, finished", async ({ ext, app }) => {
    await ext.setSettings({ speed: 3 });
    const { popup } = await begin(ext, app, "/short");
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    await expect(view(popup)).toHaveAttribute("data-view", "playing", { timeout: 10_000 });
    await audit(popup, "popup playing");
    await ext.cmd("play-pause");
    await expect(view(popup)).toHaveAttribute("data-view", "paused");
    await audit(popup, "popup paused");
    await ext.cmd("play-pause");
    await expect(view(popup)).toHaveAttribute("data-view", "finished", { timeout: 30_000 });
    await audit(popup, "popup finished");
  });
});

test.describe("options and side panel", () => {
  test("every options section", async ({ ext, app }) => {
    const opt = await ext.pair(app);
    for (const id of ["general", "launcher", "voice", "highlight", "reader", "shortcuts", "sites"]) {
      await opt.goto(ext.url("options") + `#${id}`);
      await expect(opt.locator(`main[data-section="${id}"] h1`)).toBeVisible();
      await expect(opt.locator("main")).not.toHaveAttribute("aria-busy", "true");
      await audit(opt, `options ${id}`);
    }
  });

  test("options at 200% zoom and 320 px reflow", async ({ ext, app }) => {
    const opt = await ext.pair(app);
    for (const [w, h, label] of [
      [640, 360, "200% zoom of 1280x720"],
      [320, 640, "320 px reflow"],
    ] as const) {
      await opt.setViewportSize({ width: w, height: h });
      for (const id of ["general", "launcher", "voice", "highlight", "reader", "shortcuts", "sites"]) {
        await opt.goto(ext.url("options") + `#${id}`);
        await expect(opt.locator(`main[data-section="${id}"] h1`)).toBeVisible();
        expect(await layoutIssues(opt), `options ${id} at ${label}`).toEqual([]);
      }
    }
  });

  test("side panel: empty and with queued pages", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    const panel = await ext.sidepanel(page);
    await audit(panel, "side panel empty");
    const other = await ext.open("/short");
    await ext.menu("speakkit-add-queue", other);
    await ext.menu("speakkit-add-queue", page);
    await expect(panel.getByText(/Up next/i).first()).toBeVisible({ timeout: 8000 });
    await audit(panel, "side panel queue");
  });
});

async function pageUi(ext: Ext, app: App, path: string, dark = false) {
  await ext.pair(app);
  const page = await ext.open(dark ? "/dark" : path);
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  return page;
}

test.describe("in-page UI", () => {
  for (const dark of [false, true]) {
    const mode = dark ? "dark page" : "light page";

    test(`launcher tab and pill, ${mode}`, async ({ ext, app }) => {
      const page = await pageUi(ext, app, "/article", dark);
      const tab = sk(page, "launcher-tab");
      await expect(tab).toBeVisible({ timeout: 8000 });
      expect(await axeViolations(page, "speakkit-ui"), "axe: launcher tab").toEqual([]);
      await tab.hover();
      await expect(sk(page, "launcher-pill")).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: launcher pill").toEqual([]);
      expect(await layoutIssues(page, "speakkit-ui"), "layout: launcher pill").toEqual([]);
    });

    test(`bubble, gutter and toast, ${mode}`, async ({ ext, app }) => {
      const page = await pageUi(ext, app, "/select", dark);
      await ext.setSettings({ launcher: { enabled: false } });
      await page.locator(dark ? "#p1" : "#a").click({ clickCount: 3 });
      await expect(sk(page, "bubble")).toBeVisible({ timeout: 5000 });
      expect(await axeViolations(page, "speakkit-ui"), "axe: bubble").toEqual([]);
      expect(await layoutIssues(page, "speakkit-ui"), "layout: bubble").toEqual([]);
      await sk(page, "bubble-settings").click();
      await expect(sk(page, "popover-speed")).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: bubble speed popover").toEqual([]);
      await page.mouse.click(5, 500);
      await ext.cmd("read-selection", page);
      await ext.waitState("playing");
      await page.locator(dark ? "#p2" : "#b").hover();
      await expect(sk(page, "gutter-play")).toBeVisible({ timeout: 5000 });
      expect(await axeViolations(page, "speakkit-ui"), "axe: gutter").toEqual([]);
    });

    test(`dock, popovers and reader view, ${mode}`, async ({ ext, app }) => {
      const page = await pageUi(ext, app, "/article", dark);
      await ext.setSettings({ launcher: { enabled: false } });
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.waitState("playing");
      const dock = sk(page, "dock");
      await expect(dock).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: dock playing").toEqual([]);
      expect(await layoutIssues(page, "speakkit-ui"), "layout: dock playing").toEqual([]);
      await sk(page, "dock-speed").click();
      await expect(sk(page, "popover-speed")).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: dock speed popover").toEqual([]);
      await sk(page, "dock-voice").click();
      await expect(sk(page, "popover-voice")).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: dock voice popover").toEqual([]);
      expect(await layoutIssues(page, "speakkit-ui"), "layout: voice popover").toEqual([]);
      await page.keyboard.press("Escape");
      await ext.cmd("play-pause", page);
      await ext.waitState("paused");
      expect(await axeViolations(page, "speakkit-ui"), "axe: dock paused").toEqual([]);

      await ext.bg({ t: "reader", tabId: await ext.tabId(page), open: true });
      await expect(sk(page, "reader")).toBeVisible();
      expect(await axeViolations(page, "speakkit-ui"), "axe: reader view").toEqual([]);
      expect(await layoutIssues(page, "speakkit-ui"), "layout: reader view").toEqual([]);
    });
  }

  test("the dock fits a 200% zoom viewport (640x400) and a narrow phone width", async ({ ext, app }) => {
    const page = await pageUi(ext, app, "/article");
    await ext.setSettings({ launcher: { enabled: false } });
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await ext.waitState("playing");
    for (const [w, h] of [
      [640, 400],
      [360, 640],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      expect(await layoutIssues(page, "speakkit-ui"), `dock at ${w}x${h}`).toEqual([]);
    }
  });
});
