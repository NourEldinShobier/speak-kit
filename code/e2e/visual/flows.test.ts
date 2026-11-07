import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, it } from "vite-plus/test";
import { openPage, armDoc, state, selectSentences, startReading, hoverLauncher } from "./pages";
import { OK_HEALTH, POPUP_W, engineHealth, extPage, playing, READER_TAB, type Ctx, type Mock } from "./scenarios";
import { HERE, launchExt, playerState, seed, sleep, startEnv, type Env, type Ext } from "./support";
import { DONE, press } from "./desktop";
import { libraryWith } from "./desktop-app";

// Short flows as ordered step screenshots: designs/review/flows/<slug>/<nn>.png and designs/review/flows.json.
// FLOWS=slug,slug limits the run. Extension steps that need the background worker's broadcasts are forged the same way as in the scenarios.

const ROOT = resolve(HERE, "../../../designs/review");
// FLOWS=all or FLOWS=slug,slug (the flows only run on request)
const only = process.env.FLOWS && process.env.FLOWS !== "all" ? process.env.FLOWS.split(",").map((s) => s.trim()) : undefined;
const done: { title: string; slug: string; steps: { caption: string; file: string }[] }[] = [];
let ext: Ext;
let env: Env;

beforeAll(async () => {
  env = await startEnv();
  ext = await launchExt();
});
afterAll(async () => {
  await ext?.close();
  await env?.close();
  const file = join(ROOT, "flows.json");
  const prev: typeof done = (() => {
    try {
      return JSON.parse(readFileSync(file, "utf8")).map((f: { title: string; steps: never[] }) => ({ ...f, slug: (f as { slug?: string }).slug ?? f.title }));
    } catch {
      return [];
    }
  })();
  const fresh = new Set(done.map((f) => f.slug));
  writeFileSync(file, JSON.stringify([...prev.filter((f) => !fresh.has(f.slug)), ...done], null, 1));
});

class Flow {
  steps: { caption: string; file: string }[] = [];
  constructor(
    readonly slug: string,
    readonly title: string,
  ) {
    rmSync(join(ROOT, "flows", slug), { recursive: true, force: true });
    mkdirSync(join(ROOT, "flows", slug), { recursive: true });
  }
  async step(page: Page, caption: string, clip?: { width: number; height: number }) {
    const file = `flows/${this.slug}/${String(this.steps.length + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: join(ROOT, file), scale: "css", ...(clip ? { clip: { x: 0, y: 0, ...clip } } : {}) });
    this.steps.push({ caption, file });
  }
  finish() {
    done.push({ title: this.title, slug: this.slug, steps: this.steps });
  }
}
const flow = (slug: string, title: string, run: (f: Flow) => Promise<void>) =>
  it.runIf(!only || only.includes(slug))(slug, async () => {
    const f = new Flow(slug, title);
    await run(f);
    f.finish();
  });

const ctx = (): Ctx => ({ ext, env });
const dock = (s: any) => ({ ...s, launcher: { ...s.launcher, enabled: false }, sites: { "127.0.0.1": "always-dock" } });
const view = { width: 1278, height: 718 };

async function popup(m: Mock, f: Flow, caption: string, after?: (p: Page) => Promise<void>) {
  await seed(ext);
  const page = await extPage(ctx(), "popup.html", m, { w: POPUP_W, h: 900 });
  await page.waitForSelector(".pp:not(.pp-wait)", { timeout: 10_000 });
  await sleep(500);
  await after?.(page);
  const h = await page.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
  await f.step(page, caption, { width: POPUP_W, height: h });
  await page.close();
}

describe.runIf(!!process.env.FLOWS)("flows", () => {
  flow("extension-read-selection", "Extension: select text, Listen, read, pause, change speed, finish", async (f) => {
    const p = await openPage(ctx(), { settings: dock });
    await sleep(500);
    await f.step(p.page, "The article is open and the Speak Kit pill waits at the bottom.", view);
    await selectSentences(p, 1, 2);
    await f.step(p.page, "Select a few sentences: the selection bubble offers Listen.", view);
    const { docId } = await armDoc(p);
    await state(p, docId, "preparing", { elapsedMs: 0 });
    await sleep(500);
    await f.step(p.page, "Listen was pressed: the pill says it is preparing audio.", view);
    await startReading(p);
    await sleep(4500);
    await f.step(p.page, "Playing: the current sentence and word are highlighted and the pill shows progress.", view);
    await state(p, docId, "paused");
    await sleep(500);
    await f.step(p.page, "Paused from the pill: the highlight stays where reading stopped.", view);
    await p.page.locator("speakkit-ui [data-sk=dock] button:has-text('1.2x')").click();
    await sleep(400);
    await f.step(p.page, "The speed button opens the speed popover above the pill.", view);
    await p.page.keyboard.press("Escape");
    await state(p, docId, "finished", { elapsedMs: 408_000 });
    await sleep(600);
    await f.step(p.page, "Finished: the pill offers to replay.", view);
    await p.page.close();
  });

  flow("popup-offline-to-ready", "Popup: app offline, app starts, ready", async (f) => {
    await popup({ health: { ok: false, error: "app-not-running" }, tab: READER_TAB, state: playerState() }, f, "Speak Kit is not running: the popup offers to open it.");
    await popup({ health: engineHealth("loading"), tab: READER_TAB, state: playerState() }, f, "The app started and the voice model is loading.");
    await popup({ health: OK_HEALTH, tab: READER_TAB, state: playerState() }, f, "Ready: Listen is enabled for this page.");
    await popup({ health: OK_HEALTH, tab: READER_TAB, state: playing("playing") }, f, "Reading: transport, progress and voice.");
  });

  flow("extension-launcher", "Extension: edge launcher tab to expanded control", async (f) => {
    const p = await openPage(ctx());
    await sleep(500);
    await f.step(p.page, "The edge launcher tab sits at the right edge.", view);
    await hoverLauncher(p);
    await f.step(p.page, "Hover opens the launcher with play.", view);
    await startReading(p);
    await sleep(4500);
    await f.step(p.page, "While reading the tab shows progress.", view);
    await p.page.close();
  });

  flow("desktop-setup-to-reading", "Desktop: setup wizard through Done, then open a document and read it", async (f) => {
    const { launch } = await import("../../apps/desktop/tests/harness");
    const SETUP = { width: 958, height: 678 };
    const l = await launch({ env: { SPEAKKIT_TEST: "1" } });
    try {
      await l.app.evaluate(({ BrowserWindow }, s) => void BrowserWindow.getAllWindows()[0]!.setContentSize(s.width, s.height), SETUP);
      const p = l.page;
      await p.getByRole("heading").first().waitFor({ timeout: 15_000 });
      await sleep(700);
      await f.step(p, "Setup 1: welcome.");
      await press(p, /Get started/);
      await p.getByRole("heading", { name: "Choose a voice engine" }).waitFor();
      await f.step(p, "Setup 2: choose the voice engine.");
      await press(p, /Download Kokoro/);
      await sleep(300);
      await f.step(p, "Setup 3: the voice model downloads.");
      await p.getByRole("heading", { name: "Kokoro-82M is ready" }).waitFor();
      await press(p, /^Continue/);
      await p.getByRole("heading", { name: "Connect your browser" }).waitFor();
      await f.step(p, "Setup 4: connect the browser extension.");
      await p.getByRole("button", { name: "Reveal" }).click();
      await p.getByRole("button", { name: "Copy" }).click();
      await press(p, /^Continue/);
      await p.getByRole("heading", { name: "You're all set" }).waitFor();
      await sleep(400);
      await f.step(p, "Setup 5: done.");
    } finally {
      await l.cleanup();
    }
    const l2 = await launch({ env: { SPEAKKIT_TEST: "1", SPEAKKIT_FAKE_LATENCY_MS: "250" }, config: DONE });
    try {
      const p = l2.page;
      await l2.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1278, 798));
      await p.getByRole("heading", { name: "Home" }).waitFor({ timeout: 15_000 });
      await sleep(600);
      await f.step(p, "Home after setup, with the New reading row in the sidebar.");
      await libraryWith(p);
      await sleep(400);
      await f.step(p, "Library with three readings.");
      await p.getByRole("button", { name: "Open Why local-first matters" }).click();
      await p.getByTestId("reader").waitFor();
      await sleep(500);
      await f.step(p, "The reader opens the document.");
      await p.getByRole("button", { name: "Play", exact: true }).click();
      await p.waitForFunction(() => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === "playing");
      await sleep(2500);
      await f.step(p, "Playing: the sentence is highlighted and the player bar shows progress.");
      await p.getByRole("button", { name: "Pause" }).click();
      await sleep(500);
      await f.step(p, "Paused.");
    } finally {
      await l2.cleanup();
    }
  });
});
