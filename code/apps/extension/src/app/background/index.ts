import type {
  BgToContent,
  ContentToBg,
  ErrorCode,
  ExtractReply,
  Health,
  PlayerCommand,
  PlayerState,
  ReadDoc,
} from "@speakkit/protocol";
import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import type {
  ExtraBroadcast,
  ExtraToBg,
  FromOffscreen,
  PlayerConfig,
  QueueItem,
  ToOffscreen,
} from "../../shared/internal";
import {
  classifyUrl,
  createEngineClient,
  createHealthClient,
  ERROR_TEXT,
  launchApp,
} from "../../features/connection";
import {
  getToken,
  invalidateSettings,
  loadSettings,
  migrateStoredSettings,
  saveSettings,
  siteRule,
} from "../../features/settings";
import { toInfo } from "../../features/voices";
import { LINKS } from "../../shared/links";
import { parseInbound } from "../../shared/schemas";

const OFFSCREEN_URL = "offscreen.html";
const SESSION_STATE = "speakkit.lastState";
const SESSION_DOC = "speakkit.lastDoc";
const ACCENT = "#0069CC";
const ERR = "#D92D20";

const health = createHealthClient({
  fetch: (i, init) => fetch(i, init),
  now: Date.now,
  port: async () => (await loadSettings()).port,
  token: getToken,
});

const engine = createEngineClient({
  fetch: (i, init) => fetch(i, init),
  port: async () => (await loadSettings()).port,
  token: getToken,
});

// The UI wants HealthResult ({ ok, health, ms } | { ok: false, error }); /v1/health needs no token, so the token is checked separately.
type HealthResult =
  | { ok: true; health: Health; ms: number }
  | { ok: false; error: "app-not-running" | "token-rejected" | "version-mismatch"; detail?: string };
let healthResult: { at: number; port: number; token: string; value: HealthResult } | undefined;
const clearHealth = () => {
  healthResult = undefined;
  health.clear();
};
async function getHealthResult(force = false): Promise<HealthResult> {
  const port = (await loadSettings()).port;
  const token = await getToken();
  const c = healthResult;
  if (!force && c && c.port === port && c.token === token && Date.now() - c.at < 3000) return c.value;
  const t0 = Date.now();
  const r = await health.health(force);
  let value: HealthResult;
  if (!r.ok)
    value = {
      ok: false,
      error: r.code as "app-not-running" | "version-mismatch",
      detail: r.message,
    };
  else {
    const auth = token ? await health.authCheck() : undefined;
    value =
      auth && !auth.ok
        ? { ok: false, error: auth.code as "token-rejected" | "app-not-running", detail: auth.message }
        : { ok: true, health: r.value, ms: Date.now() - t0 };
  }
  healthResult = { at: Date.now(), port, token, value };
  return value;
}

// ---- player state: cached, mirrored to session storage so a restarted worker still knows it ----

const idleState = async (): Promise<PlayerState> => {
  const s = await loadSettings();
  return {
    status: "idle",
    sentenceIndex: 0,
    sentenceCount: 0,
    elapsedMs: 0,
    totalMs: 0,
    speed: s.speed,
    voice: s.voice,
    queueLength: 0,
  };
};
let lastState: PlayerState | undefined;
let lastQueue: QueueItem[] = [];

async function getState(): Promise<PlayerState> {
  if (lastState) return lastState;
  try {
    const got = await chrome.storage.session.get(SESSION_STATE);
    if (got[SESSION_STATE]) return (lastState = got[SESSION_STATE] as PlayerState);
  } catch {
    /* session storage unavailable */
  }
  return (lastState = await idleState());
}

const sendToPages = (m: BgToContent | ExtraBroadcast) => {
  chrome.runtime.sendMessage(m).catch(() => {});
};
const sendToTab = (tabId: number | undefined, m: BgToContent) => {
  if (tabId !== undefined) chrome.tabs.sendMessage(tabId, m).catch(() => {});
};

function badge(state: PlayerState) {
  const text =
    state.status === "playing"
      ? "▶"
      : state.status === "paused"
        ? "II"
        : state.status === "error"
          ? "!"
          : "";
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: state.status === "error" ? ERR : ACCENT });
}

function publishState(state: PlayerState) {
  // Reading moved to another tab: tell the old one so it clears its highlight and controls.
  const prev = lastState?.tabId;
  if (prev !== undefined && state.tabId !== undefined && prev !== state.tabId)
    sendToTab(prev, { t: "state", state: { ...state, status: "idle", tabId: prev } });
  lastState = state;
  chrome.storage.session.set({ [SESSION_STATE]: state }).catch(() => {});
  badge(state);
  sendToPages({ t: "state", state });
  sendToTab(state.tabId, { t: "state", state });
}

async function reportError(code: ErrorCode, tabId?: number) {
  const base = await getState();
  publishState({
    ...base,
    status: "error",
    tabId: tabId ?? base.tabId,
    error: { code, message: ERROR_TEXT[code] },
  });
}

// ---- offscreen player ----

let creating: Promise<void> | undefined;

async function hasOffscreen(): Promise<boolean> {
  return (
    (
      await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      })
    ).length > 0
  );
}

async function createOffscreen(): Promise<void> {
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ["AUDIO_PLAYBACK" as chrome.offscreen.Reason],
      justification: "Plays synthesized speech",
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

async function sendOffscreen(msg: ToOffscreen): Promise<unknown> {
  // The document may not have registered its listener yet right after creation.
  for (let i = 0; ; i++) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (i >= 40) throw e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

async function playerConfig(): Promise<PlayerConfig> {
  const s = await loadSettings();
  return {
    port: s.port,
    token: await getToken(),
    voice: s.voice,
    speed: s.speed,
    pause: s.pauseBetweenParagraphs,
  };
}

async function runPlayerCommand(
  command: PlayerCommand,
  senderTabId?: number,
  cfgOverride?: Partial<PlayerConfig>,
): Promise<void> {
  if ((command.cmd === "play" || command.cmd === "queue-add") && senderTabId !== undefined)
    command = { ...command, doc: { ...command.doc, tabId: senderTabId } };
  if (command.cmd === "set-speed") await saveSettings({ speed: command.speed });
  if (command.cmd === "set-voice") await saveSettings({ voice: command.voice });

  if (!(await hasOffscreen())) {
    // The offscreen document closes by itself after ~30 s without audio, taking the player with it.
    const last = await getState();
    const doc = await lastDoc();
    if ((command.cmd === "resume" || command.cmd === "toggle") && last.status === "paused" && doc) {
      command = { cmd: "play", doc: { ...doc, startIndex: last.sentenceIndex } };
    } else if (command.cmd !== "play" && command.cmd !== "queue-add") {
      if (command.cmd !== "set-speed" && command.cmd !== "set-voice" && last.status !== "idle")
        publishState(await idleState());
      return;
    }
    await createOffscreen();
  }
  if (command.cmd === "play" || command.cmd === "queue-add")
    chrome.storage.session.set({ [SESSION_DOC]: command.doc }).catch(() => {});
  await sendOffscreen({ to: "offscreen", command, cfg: { ...(await playerConfig()), ...cfgOverride } });
}

async function sendOffscreenIfOpen(msg: ToOffscreen) {
  if (await hasOffscreen()) await sendOffscreen(msg);
}

async function lastDoc(): Promise<ReadDoc | undefined> {
  try {
    return (await chrome.storage.session.get(SESSION_DOC))[SESSION_DOC] as ReadDoc | undefined;
  } catch {
    return undefined;
  }
}

function handleOffscreen(m: FromOffscreen) {
  if (m.kind === "state") publishState(m.state);
  else if (m.kind === "sentence-start") {
    sendToPages({ t: "sentence-start", start: m.start });
    sendToTab(m.tabId ?? lastState?.tabId, { t: "sentence-start", start: m.start });
  } else if (m.kind === "idle") {
    void closeOffscreenIfIdle();
  } else {
    lastQueue = m.queue;
    sendToPages({ t: "queue", queue: m.queue });
  }
}

/** The player document is closed 60 s after playback stopped (it holds an AudioContext and decoded audio); the next play creates it again. */
async function closeOffscreenIfIdle() {
  const s = await getState();
  if (s.status !== "idle" && s.status !== "finished" && s.status !== "error") return;
  if (lastQueue.length) return;
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

// ---- reading a tab ----

async function requestExtract(
  tabId: number,
  mode: "page" | "selection" | "from-here",
): Promise<ExtractReply | undefined> {
  const ask = () =>
    chrome.tabs.sendMessage(tabId, { t: "extract", mode } satisfies BgToContent) as Promise<
      ExtractReply | undefined
    >;
  try {
    return await ask();
  } catch {
    /* no content script yet: inject on demand */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await ask();
  } catch {
    return undefined;
  }
}

async function checkReadable(url: string | undefined): Promise<ErrorCode | undefined> {
  const c = classifyUrl(url);
  if (c === "unreadable") return "page-unreadable";
  if (c === "file" && !(await chrome.extension.isAllowedFileSchemeAccess())) return "file-access";
  return undefined;
}

async function startRead(
  tabId: number,
  mode: "page" | "selection" | "from-here",
  opts: { queue?: boolean; fallbackToPage?: boolean } = {},
): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if (siteRule(await loadSettings(), tab.url) === "never-read") return false;
  const bad = await checkReadable(tab.url);
  if (bad) {
    await reportError(bad, tabId);
    return false;
  }
  let reply = await requestExtract(tabId, mode);
  if (
    opts.fallbackToPage &&
    mode === "selection" &&
    (!reply || "error" in reply || !reply.doc.sentences.length)
  )
    reply = await requestExtract(tabId, "page");
  if (!reply) {
    await reportError("page-unreadable", tabId);
    return false;
  }
  if ("error" in reply) {
    await reportError(reply.error, tabId);
    return false;
  }
  if (!reply.doc.sentences.length) {
    await reportError("page-unreadable", tabId);
    return false;
  }
  await runPlayerCommand({ cmd: opts.queue ? "queue-add" : "play", doc: { ...reply.doc, tabId } });
  if (opts.queue)
    sendToTab(tabId, {
      t: "toast",
      message: "Added to queue",
      kind: "ok",
      action: "open-sidepanel",
      actionLabel: "View queue",
    } as unknown as BgToContent);
  return true;
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

// ---- starting the app and the reader view ----

async function startApp() {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const r = await launchApp({
    openTab: async () => (await chrome.tabs.create({ url: LINKS.launch, active: false })).id,
    closeTab: (id) => chrome.tabs.remove(id),
    isRunning: async () => (await getHealthResult(true)).ok,
    sleep,
  });
  clearHealth();
  return r;
}

async function toggleReader(tabId: number, open: boolean): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if ((await checkReadable(tab.url)) || siteRule(await loadSettings(), tab.url) === "never-read") return false;
  const msg = { t: "reader", open } as unknown as BgToContent;
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch {
    /* no content script yet: inject on demand */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch {
    return false;
  }
}

// ---- router ----

type Msg = ContentToBg | ExtraToBg;

/** Message types this worker answers; a known type with a bad payload gets { ok: false }, any other message is ignored (it is for another listener). */
const KNOWN_TYPES = new Set(["player", "get-state", "open-options", "get-health", "auth-check", "get-voices", "get-queue", "read", "read-tab", "open-sidepanel", "set-auto-play", "preview", "preview-voice", "open-app", "launch-app", "warm", "reader"]);

const PREVIEW_TEXT = "Hello, this is how I sound when I read to you.";
let autoPlay = true;

/** Queue and outline for the side panel. The outline is the playing document grouped by paragraph. */
async function queueSnapshot() {
  const doc = (await getState()).status === "idle" ? undefined : await lastDoc();
  const outline: { index: number; text: string }[] = [];
  doc?.sentences.forEach((s, i) => {
    if (i === 0 || s.block !== doc.sentences[i - 1]?.block) outline.push({ index: i, text: s.text });
  });
  return { items: lastQueue, outline, autoPlay };
}

async function route(msg: Msg, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.t) {
    case "player":
      await runPlayerCommand(msg.command, sender.tab?.id);
      return { ok: true };
    case "get-state":
      return getState();
    case "open-options":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case "get-health":
      return getHealthResult(msg.force);
    case "auth-check":
      return health.authCheck(msg.port, msg.token);
    case "get-voices": {
      // The content script reads { voices }, extension pages read ConnResult.
      const r = await health.voices();
      if (!r.ok) return r;
      return { ...r, voices: r.value.voices.map(toInfo) };
    }
    case "get-queue":
      return queueSnapshot();
    case "read-tab": {
      const tabId = msg.tabId ?? (await activeTabId());
      return {
        ok: tabId !== undefined && (await startRead(tabId, msg.mode, { queue: msg.queue })),
      };
    }
    case "set-auto-play":
      autoPlay = msg.on;
      await sendOffscreenIfOpen({ to: "offscreen", autoPlay });
      return { ok: true };
    case "preview":
    case "preview-voice": {
      const voice = msg.voice;
      const speed = msg.t === "preview" ? msg.speed : undefined;
      const text = msg.t === "preview" && msg.text ? msg.text : PREVIEW_TEXT;
      await runPlayerCommand(
        {
          cmd: "play",
          doc: {
            docId: `preview-${voice}-${Date.now()}`,
            tabId: sender.tab?.id ?? -1,
            url: "",
            title: "Voice preview",
            sentences: [{ text, block: 0 }],
            startIndex: 0,
            source: "selection",
          },
        },
        undefined,
        { voice, ...(speed ? { speed } : {}) },
      );
      return { ok: true };
    }
    case "open-app":
    case "launch-app":
      return startApp();
    case "warm":
      void engine.warm();
      return { ok: true };
    case "reader": {
      const tabId = msg.tabId ?? sender.tab?.id ?? (await activeTabId());
      return { ok: tabId !== undefined && (await toggleReader(tabId, msg.open)) };
    }
    case "read": {
      const tabId = msg.tabId ?? sender.tab?.id ?? (await activeTabId());
      return {
        ok: tabId !== undefined && (await startRead(tabId, msg.mode, { queue: msg.queue })),
      };
    }
    case "open-sidepanel": {
      const windowId =
        msg.windowId ?? sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
      if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
      return { ok: true };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as { from?: string; to?: string; t?: string } | null;
  if (m?.from === "offscreen") {
    // Only the offscreen document may speak as the player; a content script cannot.
    if (!sender.tab && sender.url === chrome.runtime.getURL(OFFSCREEN_URL)) handleOffscreen(m as FromOffscreen);
    return false;
  }
  if (!m || m.to === "offscreen" || typeof m.t !== "string") return false;
  // Trust boundary: content scripts run inside web pages. Anything that is not a well-formed request is dropped.
  const parsed = parseInbound(m);
  if (!parsed) {
    if (KNOWN_TYPES.has(m.t)) sendResponse({ ok: false, error: "invalid-message" });
    return false;
  }
  route(parsed, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// ---- commands ----

const onCommand = async (name: string, tab?: chrome.tabs.Tab) => {
  const tabId = tab?.id ?? (await activeTabId());
  const state = await getState();
  const live =
    state.status === "playing" || state.status === "paused" || state.status === "preparing";
  if (name === "stop") await runPlayerCommand({ cmd: "stop" });
  else if (name === "play-pause" && live) await runPlayerCommand({ cmd: "toggle" });
  else if ((name === "read-selection" || name === "play-pause") && tabId !== undefined)
    await startRead(tabId, "selection", { fallbackToPage: true });
};
chrome.commands.onCommand.addListener(onCommand);

// ---- context menus ----

const MENU = {
  parent: "speakkit",
  selection: "speakkit-read-selection",
  here: "speakkit-read-from-here",
  queue: "speakkit-add-queue",
} as const;

let menusBuilt: boolean | undefined;
/** Titles of the menu entries currently registered (chrome.contextMenus cannot be read back; tests do). */
const menuLog: string[] = [];
const addMenu = (p: chrome.contextMenus.CreateProperties) => {
  menuLog.push(p.title ?? "");
  chrome.contextMenus.create(p);
};
async function rebuildMenus() {
  menusBuilt = (await loadSettings()).show.contextMenu;
  await chrome.contextMenus.removeAll();
  menuLog.length = 0;
  if (!menusBuilt) return;
  addMenu({ id: MENU.parent, title: "SpeakKit", contexts: ["all"] });
  addMenu({
    id: MENU.selection,
    parentId: MENU.parent,
    title: "Read selection",
    contexts: ["selection"],
  });
  addMenu({
    id: MENU.here,
    parentId: MENU.parent,
    title: "Read from here",
    contexts: ["all"],
  });
  addMenu({
    id: MENU.queue,
    parentId: MENU.parent,
    title: "Add to queue",
    contexts: ["all"],
  });
}

const onMenuClick = async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  if (info.menuItemId === MENU.selection) await startRead(tabId, "selection");
  else if (info.menuItemId === MENU.here) await startRead(tabId, "from-here");
  else if (info.menuItemId === MENU.queue)
    await startRead(tabId, info.selectionText ? "selection" : "page", { queue: true });
};
chrome.contextMenus.onClicked.addListener(onMenuClick);

// The native menu and the keyboard cannot be driven from Playwright, so tests call the same handlers.
if (__TEST__)
  Object.assign(globalThis, {
    __speakkit: {
      command: (name: string, tabId?: number) => onCommand(name, tabId ? ({ id: tabId } as chrome.tabs.Tab) : undefined),
      menus: () => [...menuLog],
      menu: (id: string, tabId: number, selectionText?: string) =>
        onMenuClick({ menuItemId: id, selectionText } as chrome.contextMenus.OnClickData, { id: tabId } as chrome.tabs.Tab),
    },
  });

// ---- lifecycle ----

chrome.runtime.onInstalled.addListener(async () => {
  await migrateStoredSettings();
  await rebuildMenus();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void rebuildMenus();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && TOKEN_KEY in changes) clearHealth();
  if (area !== "sync" || !(SETTINGS_KEY in changes)) return;
  invalidateSettings();
  const after = await loadSettings();
  clearHealth();
  if (menusBuilt !== after.show.contextMenu) void rebuildMenus();
  sendToPages({ t: "settings-changed" });
  for (const t of await chrome.tabs.query({})) sendToTab(t.id, { t: "settings-changed" });
});

// Reading belongs to one page: closing it or navigating away stops playback.
const stopIfPlayingTab = async (tabId: number) => {
  const s = await getState();
  if (s.tabId === tabId && s.status !== "idle") await runPlayerCommand({ cmd: "stop" });
};
chrome.tabs.onRemoved.addListener((tabId) => {
  void stopIfPlayingTab(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" && info.url) void stopIfPlayingTab(tabId);
});
