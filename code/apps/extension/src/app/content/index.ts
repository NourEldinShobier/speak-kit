/// <reference types="chrome" />
import { SETTINGS_KEY, type BgToContent } from "@speakkit/protocol";

/**
 * Tiny bootstrap injected on every page at document_idle. It registers the message listener and decides when to load the
 * rest (./app: extraction, highlight, Shadow DOM UI). Nothing touches the DOM here.
 */
type Msg = BgToContent | { t: "toast"; [k: string]: unknown } | { t: "reader"; open: boolean };

let app: Promise<import("./controller").Controller> | null = null;
const load = () => (app ??= import("./controller").then((m) => m.boot()));
let started = false;
const start = () => { if (!started) { started = true; document.removeEventListener("pointermove", start); document.removeEventListener("selectionchange", start); void load(); } };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, send) => {
  if (!msg || typeof msg.t !== "string") return;
  if (msg.t === "extract") {
    const mode = msg.mode;
    void load().then((c) => send(c.extractReply(mode)), () => send({ error: "page-unreadable" }));
    return true; // async reply
  }
  if (msg.t === "state" || msg.t === "sentence-start" || msg.t === "settings-changed" || msg.t === "toast" || msg.t === "reader") void load().then((c) => c.onMessage(msg as BgToContent));
  return;
});

// Show the launcher soon after load when it is enabled; otherwise wait for the first interaction.
void chrome.storage.sync.get(SETTINGS_KEY).then((r) => {
  const s = r[SETTINGS_KEY] as { launcher?: { enabled?: boolean }; sites?: Record<string, string> } | undefined;
  const rule = s?.sites?.[location.hostname.replace(/^www\./, "")] ?? s?.sites?.[location.hostname];
  const launcher = (s?.launcher?.enabled ?? true) && rule !== "hide-controls" && rule !== "never-read";
  if (launcher || rule === "always-dock") {
    const go = () => start();
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
  } else if (rule !== "never-read") {
    document.addEventListener("pointermove", start, { passive: true, once: true });
    document.addEventListener("selectionchange", start, { once: true });
  }
}, () => {});
