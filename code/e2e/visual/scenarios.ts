import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { OUT, playerState, seed, send, sleep, tabIdOf, type Env, type Ext } from "./support";

export interface Ctx {
  ext: Ext;
  env: Env;
}
export const GROUPS = {
  popup: "Extension popup",
  page: "On-page reading",
  reader: "Reader view",
  options: "Options",
  panel: "Side panel (queue)",
  setup: "Desktop setup",
  home: "Desktop home and shell",
  library: "Desktop library",
  readerApp: "Desktop reader and export",
  voices: "Voices and engines",
  settings: "Desktop settings",
  system: "Tray, notifications and system states",
  errors: "Errors and edge states",
} as const;
export type Group = (typeof GROUPS)[keyof typeof GROUPS];

/**
 * One captured screen. `id` is the design frame id the screen answers (or an own id when the design has none), `state` a short slug.
 * Files are written as built/<id>-<state>-<theme>.png. Captures are light only. `design` is false when no design frame exists.
 */
export interface Scenario {
  id: string;
  state: string;
  group: Group;
  title: string;
  design?: boolean;
  run(c: Ctx): Promise<string>;
}

/** The capture in progress: scenario files call builtPath() without arguments and get the stable name. */
export const cur = { id: "", state: "" };
export const builtName = (id: string, state: string) => `${id}-${state}-light.png`;
export const builtPath = (_legacy?: string) => {
  mkdirSync(join(OUT, "built"), { recursive: true });
  return join(OUT, "built", builtName(cur.id, cur.state));
};

export const S = (id: string, state: string, group: Group, title: string, run: Scenario["run"], o: { design?: boolean } = {}): Scenario => ({
  id,
  state,
  group,
  title,
  run,
  ...o,
});

// ---------------------------------------------------------------- extension pages with a mocked service-worker surface

export interface Mock {
  state?: unknown;
  health?: unknown;
  queue?: unknown;
  tab?: { id: number; url: string; title: string; selection?: string; chars?: number } | null;
  fileAccess?: boolean;
  commands?: { name: string; description: string; shortcut: string }[];
}
export const OK_HEALTH = { ok: true, ms: 38, health: { app: "speakkit", version: "0.4.2", apiVersion: 1, engine: { id: "kokoro", state: "ready" } } };
export const engineHealth = (state: string) => ({ ...OK_HEALTH, health: { ...OK_HEALTH.health, engine: { id: "kokoro", state } } });
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
    chrome.scripting.executeScript = async () => [{ result: { sel: M.tab ? M.tab.selection || "" : "", chars: M.tab ? M.tab.chars || 0 : 0 } }];
  }
  if (M.commands) chrome.commands.getAll = async () => M.commands;
  if (M.fileAccess === false) chrome.extension.isAllowedFileSchemeAccess = (cb) => cb(false);
})();`;

export async function extPage(c: Ctx, file: string, mock: Mock, o: { w: number; h: number; hash?: string }): Promise<Page> {
  const page = await c.ext.ctx.newPage();
  await page.setViewportSize({ width: o.w, height: o.h });
  await page.addInitScript(mockScript(mock));
  await page.goto(`chrome-extension://${c.ext.id}/${file}${o.hash ?? ""}`);
  return page;
}

// ---------------------------------------------------------------- popup A1-A17

export const POPUP_W = 360;
const popupShot = async (c: Ctx, mock: Mock, o: { after?: (p: Page) => Promise<void>; token?: string | null; settings?: (s: any) => any } = {}) => {
  await seed(c.ext, o.settings ?? ((s) => s), o.token === undefined ? undefined : o.token);
  const page = await extPage(c, "popup.html", mock, { w: POPUP_W, h: 900 });
  await page.waitForSelector(".pp:not(.pp-wait)", { timeout: 10_000 });
  await sleep(500);
  if (o.after) {
    await o.after(page);
    await sleep(300);
  }
  const h = await page.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
  const path = builtPath();
  await page.screenshot({ path, clip: { x: 0, y: 0, width: POPUP_W, height: h } });
  await page.close();
  return path;
};

export const playing = (status: string, extra: object = {}) =>
  playerState({ status: status as never, title: READER_TAB.title, url: READER_TAB.url, docId: "d1", tabId: 1, sentenceIndex: 4, elapsedMs: 147_000, totalMs: 408_000, queueLength: 2, ...extra });
const queue = { autoPlay: true, outline: [], items: [{ docId: "q1", title: "How small speech models got good", url: "https://blog.example.org/a", sentenceCount: 40, estMs: 360_000 }] };
const P = GROUPS.popup;

export const popupScenarios: Scenario[] = [
  S("A1", "idle", P, "Popup · idle on an article", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playerState() })),
  S("A2", "selection", P, "Popup · selection ready", (c) =>
    popupShot(c, {
      health: OK_HEALTH,
      tab: { ...READER_TAB, selection: "Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.", chars: 7344 },
      state: playerState(),
    }),
  ),
  S("A3", "preparing", P, "Popup · preparing audio", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playing("preparing", { elapsedMs: 0 }) })),
  S("A4", "playing", P, "Popup · playing", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playing("playing") })),
  S("A5", "paused", P, "Popup · paused", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playing("paused") })),
  S("A6", "voice-picker", P, "Popup · voice picker", (c) =>
    popupShot(
      c,
      { health: OK_HEALTH, tab: READER_TAB, state: playing("playing") },
      {
        after: async (p) => {
          await p.locator(".pp-voice, [data-pp=voice], button:has-text('Heart')").first().click();
        },
      },
    ),
  ),
  S("A7", "speed-picker", P, "Popup · speed picker", (c) =>
    popupShot(
      c,
      { health: OK_HEALTH, tab: READER_TAB, state: playing("paused") },
      {
        after: async (p) => {
          await p.locator("button:has-text('1.2x')").first().click();
        },
      },
    ),
  ),
  S("A8", "finished", P, "Popup · finished", (c) => popupShot(c, { health: OK_HEALTH, tab: READER_TAB, queue, state: playing("finished", { elapsedMs: 408_000, queueLength: 2 }) })),
  S("A9", "app-not-running", P, "Popup · app not running", (c) => popupShot(c, { health: { ok: false, error: "app-not-running" }, tab: READER_TAB, state: playerState() })),
  S("A10", "model-loading", P, "Popup · model loading", (c) => popupShot(c, { health: engineHealth("loading"), tab: READER_TAB, state: playerState() })),
  S("A11", "page-unreadable", P, "Popup · page not readable", (c) =>
    popupShot(c, { health: OK_HEALTH, tab: { ...READER_TAB, url: "chrome://extensions/", title: "Extensions" }, state: playerState() }),
  ),
  S("A13", "not-installed", P, "Popup · app not installed", (c) => popupShot(c, { health: { ok: false, error: "app-not-running" }, tab: READER_TAB, state: playerState() }, { token: null })),
  S("A14", "token-rejected", P, "Popup · pairing token rejected", (c) => popupShot(c, { health: { ok: false, error: "token-rejected" }, tab: READER_TAB, state: playerState() })),
  S("A15", "file-permission", P, "Popup · local file needs permission", (c) =>
    popupShot(c, { health: OK_HEALTH, tab: { ...READER_TAB, url: "file:///C:/Users/maya/essay.html", title: "essay.html" }, fileAccess: false, state: playerState() }),
  ),
  S("A18", "version-mismatch", P, "Popup · app and extension versions differ (K5)", (c) => popupShot(c, { health: { ok: false, error: "version-mismatch" }, tab: READER_TAB, state: playerState() }), {
    design: false,
  }),
  S(
    "A19",
    "pdf",
    P,
    "Popup · PDF viewer",
    (c) => popupShot(c, { health: OK_HEALTH, tab: { ...READER_TAB, url: "https://reader.example.com/files/attention.pdf", title: "attention.pdf" }, state: playerState() }),
    { design: false },
  ),
  S("A16", "engine-asleep", P, "Popup · engine asleep", (c) => popupShot(c, { health: engineHealth("unloaded"), tab: READER_TAB, state: playerState() })),
  S("A17", "engine-waking", P, "Popup · waking the engine", (c) => popupShot(c, { health: engineHealth("unloaded"), tab: READER_TAB, state: playing("preparing", { elapsedMs: 0 }) })),
];

export { tabIdOf, send };

// ---------------------------------------------------------------- options page and side panel

export const OPT_W = 1278;
export const OPT_H = 718;
const optionsShot = async (
  c: Ctx,
  hash: string,
  o: { w?: number; h?: number; settings?: (s: any) => any; token?: string | null; after?: (p: Page) => Promise<void>; full?: boolean; mock?: Mock } = {},
) => {
  await seed(c.ext, o.settings ?? ((s) => s), o.token === undefined ? undefined : o.token);
  const w = o.w ?? OPT_W;
  const page = await extPage(c, "options.html", o.mock ?? {}, { w, h: o.h ?? OPT_H, hash });
  await page.waitForSelector("main, .op-main, h1", { timeout: 10_000 });
  await sleep(1800);
  if (o.after) {
    await o.after(page);
    await sleep(300);
  }
  const path = builtPath();
  await page.screenshot({ path, clip: { x: 0, y: 0, width: w, height: o.h ?? OPT_H } });
  await page.close();
  return path;
};
const O = GROUPS.options;
const clickText = (t: string) => async (p: Page) => {
  await p.locator(`button:has-text('${t}'), [role=radio]:has-text('${t}')`).first().click();
};

export const optionsScenarios: Scenario[] = [
  S("C1", "general-connected", O, "Options · General (connected)", (c) => optionsShot(c, "#general")),
  S("C2", "general-offline", O, "Options · General (app not running)", (c) => optionsShot(c, "#general", { settings: (s) => ({ ...s, port: 51999 }) })),
  S("C3", "general-token-rejected", O, "Options · General (token rejected)", (c) => optionsShot(c, "#general", { token: "sk_local_wrong0000zzzz" })),
  S("C13", "pair-this-browser", O, "Options · Pair this browser (no token yet)", (c) => optionsShot(c, "#general", { token: null, settings: (s) => ({ ...s, port: 51999 }) })),
  S("C4", "voice-speed", O, "Options · Voice and speed", (c) => optionsShot(c, "#voice")),
  S("C5", "highlighting", O, "Options · Highlighting", (c) => optionsShot(c, "#highlight")),
  S("C6", "shortcuts", O, "Options · Shortcuts", (c) => optionsShot(c, "#shortcuts")),
  S("C7", "sites", O, "Options · Sites and filters", (c) =>
    optionsShot(c, "#sites", { settings: (s) => ({ ...s, sites: { "docs.google.com": "always-dock", "mail.google.com": "hide-controls", "bank.example.com": "never-read" } }) }),
  ),
  S("C15", "site-default", O, "Options · Sites not in the list (default for other sites)", (c) =>
    optionsShot(c, "#sites", { settings: (s) => ({ ...s, siteDefault: "never-read", sites: { "docs.google.com": "always-dock" } }), after: (p) => p.locator("#default-h").scrollIntoViewIfNeeded() }),
  ),
  S("C16", "shortcut-not-assigned", O, "Options · Shortcut not assigned by Chrome", (c) =>
    optionsShot(c, "#shortcuts", {
      mock: {
        commands: [
          { name: "read-selection", description: "Read the selected text", shortcut: "" },
          { name: "play-pause", description: "Play or pause", shortcut: "Ctrl+Shift+Y" },
          { name: "stop", description: "Stop reading", shortcut: "Ctrl+Shift+X" },
        ],
      },
    }),
  ),
  S("C12", "edge-launcher", O, "Options · Edge launcher", (c) => optionsShot(c, "#launcher")),
  S("C19", "reader-view", O, "Options · Reader view", (c) => optionsShot(c, "#reader"), { design: false }),
  S("C18", "narrow", O, "Options · Narrow layout", (c) => optionsShot(c, "#general", { w: 758, h: 718 })),
  S("C5", "highlighting-dark-page-preview", O, "Options · Highlighting (dark page preview)", (c) => optionsShot(c, "#highlight", { after: clickText("Dark page") }), { design: false }),
];

const panelShot = async (c: Ctx, mock: Mock) => {
  await seed(c.ext);
  const page = await extPage(c, "sidepanel.html", mock, { w: 399, h: 718 });
  await sleep(1200);
  const path = builtPath();
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 399, height: 718 } });
  await page.close();
  return path;
};
const panelQueue = {
  autoPlay: true,
  paragraphIndex: 0,
  paragraphCount: 3,
  outline: [
    { index: 0, text: "For a decade, the default answer to every software question was the cloud." },
    { index: 1, text: "The appeal is simple. When the work happens on your own machine, it keeps working on a plane." },
    { index: 2, text: "None of this is nostalgia. It is a bet that the best software is the kind that disappears." },
  ],
  items: [
    { docId: "q1", title: "How small speech models got good", url: "https://blog.example.org/a", sentenceCount: 40, estMs: 360_000 },
    { docId: "q2", title: "Privacy by default", url: "https://docs.example.com/b", sentenceCount: 20, estMs: 180_000 },
  ],
};
const SP = GROUPS.panel;
export const panelScenarios: Scenario[] = [
  S("C9", "queue-outline", SP, "Side panel · queue and outline", (c) =>
    panelShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playing("playing", { queueLength: 2, sentenceIndex: 0 }), queue: panelQueue }),
  ),
  S("C10", "empty-queue", SP, "Side panel · empty queue", (c) => panelShot(c, { health: OK_HEALTH, tab: READER_TAB, state: playerState(), queue: { autoPlay: true, outline: [], items: [] } })),
  S(
    "C9",
    "app-offline",
    SP,
    "Side panel · app not running",
    (c) => panelShot(c, { health: { ok: false, error: "app-not-running" }, tab: READER_TAB, state: playerState(), queue: { autoPlay: true, outline: [], items: [] } }),
    { design: false },
  ),
];
