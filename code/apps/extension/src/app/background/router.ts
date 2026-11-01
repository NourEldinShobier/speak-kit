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

const tabOf = async (explicit: number | undefined, sender: chrome.runtime.MessageSender) => explicit ?? sender.tab?.id ?? (await activeTabId());

export async function route(msg: Inbound, sender: chrome.runtime.MessageSender): Promise<unknown> {
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
      return { ok: tabId !== undefined && (await startRead(tabId, msg.mode, { queue: msg.queue })) };
    }
    case "set-auto-play":
      setAutoPlay(msg.on);
      await sendOffscreenIfOpen({ to: "offscreen", autoPlay: msg.on });
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
      const tabId = await tabOf(msg.tabId, sender);
      return { ok: tabId !== undefined && (await toggleReader(tabId, msg.open)) };
    }
    case "read": {
      const tabId = await tabOf(msg.tabId, sender);
      return { ok: tabId !== undefined && (await startRead(tabId, msg.mode, { queue: msg.queue })) };
    }
    case "open-sidepanel": {
      const windowId = msg.windowId ?? sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
      if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
      return { ok: true };
    }
  }
}
