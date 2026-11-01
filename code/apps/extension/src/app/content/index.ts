/// <reference types="chrome" />
import { SETTINGS_KEY, type BgToContent } from "@speakkit/protocol";
import { siteRule, withDefaults, type Settings } from "../../features/settings";

/**
 * Tiny bootstrap injected on every page at document_idle. It registers the message listener and decides when to load the
 * rest (./app: extraction, highlight, Shadow DOM UI). Nothing touches the DOM here.
 */
let app: ReturnType<(typeof import("./controller"))["boot"]> | null = null;
const load = () => (app ??= import("./controller").then((m) => m.boot()));
let started = false;
const start = () => {
  if (!started) {
    started = true;
    document.removeEventListener("pointermove", start);
    document.removeEventListener("selectionchange", start);
    document.removeEventListener("focusin", start);
    void load();
  }
};

chrome.runtime.onMessage.addListener((msg: BgToContent, _sender, send) => {
  if (!msg || typeof msg.t !== "string") return;
  if (msg.t === "extract") {
    const mode = msg.mode;
    void load().then(
      (c) => send(c.extractReply(mode)),
      () => send({ error: "page-unreadable" }),
    );
    return true; // async reply
  }
  void load().then((c) => c.onMessage(msg));
  return;
});

// Show the launcher soon after load when it is enabled; otherwise wait for the first interaction.
void chrome.storage.sync.get(SETTINGS_KEY).then(
  (r) => {
    const s = withDefaults(r[SETTINGS_KEY] as Partial<Settings> | undefined);
    const rule = siteRule(s, location.href);
    const launcher = s.launcher.enabled && rule !== "hide-controls" && rule !== "never-read";
    if (launcher || rule === "always-dock") {
      const go = () => start();
      if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 });
      else setTimeout(go, 200);
    } else if (rule !== "never-read") {
      document.addEventListener("pointermove", start, { passive: true, once: true });
      document.addEventListener("selectionchange", start, { once: true });
      document.addEventListener("focusin", start, { once: true }); // keyboard users never move a pointer
    }
  },
  () => {},
);
