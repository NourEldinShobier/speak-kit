import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { OUT, playerState, seed, sleep, type Env, type Ext } from "./support";

export interface Ctx {
  ext: Ext;
  env: Env;
}

/** One captured screen: `id` is a short screen id, `state` a short slug. `run` writes the PNG and returns its path. */
export interface Scenario {
  id: string;
  state: string;
  run(c: Ctx): Promise<string>;
}

/** The capture in progress: scenarios call builtPath() and get the stable file name. */
export const cur = { id: "", state: "" };
export const builtPath = () => {
  mkdirSync(join(OUT, "built"), { recursive: true });
  return join(OUT, "built", `${cur.id}-${cur.state}-light.png`);
};

export const S = (id: string, state: string, run: Scenario["run"]): Scenario => ({ id, state, run });

export interface Mock {
  state?: unknown;
  health?: unknown;
  queue?: unknown;
  tab?: { id: number; url: string; title: string; selection?: string; chars?: number; hidden?: boolean } | null;
  fileAccess?: boolean;
  commands?: { name: string; description: string; shortcut: string }[];
}
export const OK_HEALTH = { ok: true, ms: 38, health: { app: "speakkit", version: "0.4.2", apiVersion: 1, engine: { id: "kokoro", state: "ready" } } };
export const READER_TAB = { id: 1, url: "https://reader.example.com/essays/local-first", title: "The quiet return of local-first software", selection: "", chars: 7344 };

/** Wraps chrome.runtime.sendMessage / chrome.tabs.query / chrome.scripting before the page script runs. Everything not mocked goes to the real worker. */
const mockScript = (m: Mock) => `(() => {
  const M = ${JSON.stringify(m)};
  const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = async (msg) => {
    if (msg && msg.t === "get-state" && "state" in M) return M.state;
    if (msg && msg.t === "get-health" && "health" in M) return M.health;
    if (msg && msg.t === "get-queue" && "queue" in M) return M.queue;
    if (msg && (msg.t === "player" || msg.t === "read-tab" || msg.t === "preview" || msg.t === "launch-app")) return undefined;
    return orig(msg);
  };
  if (M.tab !== undefined) {
    chrome.tabs.query = async () => (M.tab ? [{ id: M.tab.id, url: M.tab.url, title: M.tab.title, active: true }] : []);
    chrome.scripting.executeScript = async () => [{ result: { sel: M.tab ? M.tab.selection || "" : "", chars: M.tab ? M.tab.chars || 0 : 0, hidden: M.tab ? !!M.tab.hidden : false } }];
  }
  if (M.commands) chrome.commands.getAll = async () => M.commands;
  if (M.fileAccess === false) chrome.extension.isAllowedFileSchemeAccess = (cb) => cb(false);
})();`;

async function extPage(c: Ctx, file: string, mock: Mock, o: { w: number; h: number; hash?: string }): Promise<Page> {
  const page = await c.ext.ctx.newPage();
  await page.setViewportSize({ width: o.w, height: o.h });
  await page.addInitScript(mockScript(mock));
  await page.goto(`chrome-extension://${c.ext.id}/${file}${o.hash ?? ""}`);
  return page;
}

const POPUP_W = 360;
const popupShot = async (c: Ctx, mock: Mock) => {
  await seed(c.ext);
  const page = await extPage(c, "popup.html", mock, { w: POPUP_W, h: 900 });
  await page.waitForSelector(".pp:not(.pp-wait)", { timeout: 10_000 });
  await sleep(500);
  const h = await page.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
  const path = builtPath();
  await page.screenshot({ path, clip: { x: 0, y: 0, width: POPUP_W, height: h } });
  await page.close();
  return path;
};

const playing = (status: string) =>
  playerState({ status: status as never, title: READER_TAB.title, url: READER_TAB.url, docId: "d1", tabId: 1, sentenceIndex: 4, elapsedMs: 147_000, totalMs: 408_000, queueLength: 2 });

export const popupScenarios: Scenario[] = [S("A4", "playing", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playing("playing") }))];

const OPT = { w: 1278, h: 718 };
const optionsShot = async (c: Ctx, hash: string) => {
  await seed(c.ext);
  const page = await extPage(c, "options.html", {}, { ...OPT, hash });
  await page.waitForSelector("main, .op-main, h1", { timeout: 10_000 });
  await sleep(1800);
  const path = builtPath();
  await page.screenshot({ path, clip: { x: 0, y: 0, width: OPT.w, height: OPT.h } });
  await page.close();
  return path;
};

export const optionsScenarios: Scenario[] = [S("C4", "voice-speed", (c) => optionsShot(c, "#voice"))];
