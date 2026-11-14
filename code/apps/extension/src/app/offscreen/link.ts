import { VOICE_DOC_PORT } from "../../shared/internal";

/**
 * Holds a port to the service worker. Chrome stops an idle worker after 30 s, and with it the page's port, so a message every `everyMs`
 * keeps it awake for the whole conversation; if the worker goes away anyway the port closes and `lost` runs, so the microphone is released
 * at once instead of streaming to nobody. Returns the function that lets go (it does not call `lost`).
 */
export function holdWorker(everyMs: number, lost: () => void, beat: () => void): () => void {
  const port = chrome.runtime.connect({ name: VOICE_DOC_PORT });
  let held = true;
  const stop = () => {
    held = false;
    clearInterval(timer);
    port.disconnect();
  };
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // read, so Chrome does not report it
    if (!held) return;
    held = false;
    clearInterval(timer);
    lost();
  });
  const timer = setInterval(() => {
    try {
      port.postMessage({ t: "beat" });
      beat();
    } catch {
      if (held) {
        stop();
        lost();
      }
    }
  }, everyMs);
  return stop;
}
