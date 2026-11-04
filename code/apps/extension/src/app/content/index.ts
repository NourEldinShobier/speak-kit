/// <reference types="chrome" />
import { SETTINGS_KEY, type BgToContent } from "@speakkit/protocol";
import { siteRule, withDefaults, type Settings } from "../../features/settings";
import type { TabUiMessage } from "../../shared/internal";

/**
 * Tiny bootstrap injected on every page at document_idle. It registers the message listener and decides when to load the
 * rest (./app: extraction, highlight, Shadow DOM UI). Nothing touches the DOM here.
 * One copy per document: the background injects this file again when a page does not answer, and the extension can be
 * reloaded under an open page. A live copy blocks a second one; an orphaned copy removes itself and makes room.
 */
declare global {
  interface Window {
    __speakkitContent?: { alive(): boolean; stop(): void } | undefined;
  }
}

let app: ReturnType<(typeof import("./controller"))["boot"]> | null = null;
const load = () =>
  (app ??= import("./controller")
    .then((m) => m.boot(stop))
    .catch((e) => {
      app = null; // chunk fetch failed (offline, page CSP): the next message tries again
      throw e;
    }));

/** load() already cleared its cache on failure, so the next message retries; nothing else to do here. */
const retryLater = () => undefined;
const start = () => {
  removeStart();
  void load().then(undefined, retryLater);
};
function removeStart() {
  document.removeEventListener("pointermove", start);
  document.removeEventListener("selectionchange", start);
  document.removeEventListener("focusin", start);
}

const onMessage = (msg: BgToContent | TabUiMessage, _sender: chrome.runtime.MessageSender, send: (r: unknown) => void) => {
  if (!msg || typeof msg.t !== "string") return;
  if (msg.t === "extract") {
    const mode = msg.mode;
    void load().then(
      (c) => send(c.extractReply(mode)),
      () => send({ error: "page-unreadable" }),
    );
    return true; // async reply
  }
  if (msg.t === "tab-ui") {
    // the popup asks; a page that never loaded the UI has nothing dismissed
    if (!app && msg.action === "get") send({ dismissed: false });
    else
      void load().then(
        (c) => send(c.tabUiReply(msg.action)),
        () => send({ dismissed: false }),
      );
    return true;
  }
  void load().then((c) => c.onMessage(msg), retryLater);
  return;
};

/** Removes this copy's listeners (the controller removes its own through its signal). */
function stop() {
  removeStart();
  chrome.runtime.onMessage.removeListener(onMessage);
  if (window.__speakkitContent === slot) window.__speakkitContent = undefined;
}
const slot = {
  alive: () => !!chrome.runtime?.id,
  stop: () => {
    void app?.then((c) => c.dispose());
    stop();
  },
};

/** Show the launcher soon after load when it is enabled; otherwise wait for the first interaction. */
function schedule(s: Settings) {
  const rule = siteRule(s, location.href);
  const launcher = s.launcher.enabled && rule !== "hide-controls" && rule !== "never-read";
  if (launcher || rule === "always-dock") {
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  } else if (rule !== "never-read") {
    document.addEventListener("pointermove", start, { passive: true, once: true });
    document.addEventListener("selectionchange", start, { once: true });
    document.addEventListener("focusin", start, { once: true }); // keyboard users never move a pointer
  }
}

const old = window.__speakkitContent;
if (!old?.alive()) {
  old?.stop();
  window.__speakkitContent = slot;
  chrome.runtime.onMessage.addListener(onMessage);
  void chrome.storage.sync.get(SETTINGS_KEY).then((r) => schedule(withDefaults(r[SETTINGS_KEY] as Partial<Settings> | undefined)), retryLater);
}
