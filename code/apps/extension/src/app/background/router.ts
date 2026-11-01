import { toInfo } from "../../features/voices";
import { inboundSchema, type Inbound } from "../../shared/schemas";
import { engine, getHealthResult, health, startApp } from "./connection";
import { runPlayerCommand } from "./player";
import { activeTabId, startRead, toggleReader } from "./reading";
import { sendOffscreenIfOpen } from "./offscreen";
import { getAutoPlay, getQueue, getState, lastDoc, setAutoPlay } from "./state";

const PREVIEW_TEXT = "Hello, this is how I sound when I read to you.";

/** Message types this worker answers: a known type with a bad payload gets { ok: false }, any other message is for another listener. */
export const KNOWN_TYPES: ReadonlySet<string> = new Set(inboundSchema.options.map((o) => o.entries.t.literal));

/** Queue and outline for the side panel. The outline is the playing document grouped by paragraph. */
async function queueSnapshot() {
  const doc = (await getState()).status === "idle" ? undefined : await lastDoc();
  const outline: { index: number; text: string }[] = [];
  doc?.sentences.forEach((s, i) => {
    if (i === 0 || s.block !== doc.sentences[i - 1]?.block) outline.push({ index: i, text: s.text });
  });
  return { items: await getQueue(), outline, autoPlay: await getAutoPlay() };
}

const OK = { ok: true } as const;
const tabOf = async (explicit: number | undefined, sender: chrome.runtime.MessageSender) => explicit ?? sender.tab?.id ?? (await activeTabId());

type Sender = chrome.runtime.MessageSender;
type Handler<T extends Inbound["t"]> = (msg: Extract<Inbound, { t: T }>, sender: Sender) => unknown;

async function preview(msg: Extract<Inbound, { t: "preview" | "preview-voice" }>, sender: Sender) {
  const speed = msg.t === "preview" ? msg.speed : undefined;
  const text = msg.t === "preview" && msg.text ? msg.text : PREVIEW_TEXT;
  const doc = {
    docId: `preview-${msg.voice}-${Date.now()}`,
    tabId: sender.tab?.id ?? -1,
    url: "",
    title: "Voice preview",
    sentences: [{ text, block: 0 }],
    startIndex: 0,
    source: "selection" as const,
  };
  await runPlayerCommand({ cmd: "play", doc }, undefined, { voice: msg.voice, ...(speed ? { speed } : {}) });
  return OK;
}

const readIn = async (tabId: number | undefined, mode: "page" | "selection" | "from-here", queue: boolean | undefined) => ({
  ok: tabId !== undefined && (await startRead(tabId, mode, queue === undefined ? {} : { queue })),
});

const handlers: { [T in Inbound["t"]]: Handler<T> } = {
  player: async (msg, sender) => {
    await runPlayerCommand(msg.command, sender.tab?.id);
    return OK;
  },
  "get-state": () => getState(),
  "open-options": async () => {
    await chrome.runtime.openOptionsPage();
    return OK;
  },
  "get-health": (msg) => getHealthResult(msg.force),
  "auth-check": (msg) => health.authCheck(msg.port, msg.token),
  "get-voices": async () => {
    // The content script reads { voices }, extension pages read ConnResult.
    const r = await health.voices();
    return r.ok ? { ...r, voices: r.value.voices.map(toInfo) } : r;
  },
  "get-queue": () => queueSnapshot(),
  "read-tab": async (msg) => readIn(msg.tabId ?? (await activeTabId()), msg.mode, msg.queue),
  read: async (msg, sender) => readIn(await tabOf(msg.tabId, sender), msg.mode, msg.queue),
  "set-auto-play": async (msg) => {
    setAutoPlay(msg.on);
    await sendOffscreenIfOpen({ to: "offscreen", autoPlay: msg.on });
    return OK;
  },
  preview,
  "preview-voice": preview,
  "open-app": () => startApp(),
  "launch-app": () => startApp(),
  warm: () => {
    void engine.warm();
    return OK;
  },
  reader: async (msg, sender) => {
    const tabId = await tabOf(msg.tabId, sender);
    return { ok: tabId !== undefined && (await toggleReader(tabId, msg.open)) };
  },
  "open-sidepanel": async (msg, sender) => {
    const windowId = msg.windowId ?? sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
    return OK;
  },
};

export async function route(msg: Inbound, sender: Sender): Promise<unknown> {
  return (handlers[msg.t] as Handler<typeof msg.t>)(msg, sender);
}
