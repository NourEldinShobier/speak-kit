import "@speakkit/ui/styles.css";
import "./mic.css";
import type { ToOffscreen } from "../../shared/internal";
import { ignore } from "../../shared/ignore";

/**
 * The microphone permission of an extension origin is asked in a visible page. The voice session lives in the offscreen document,
 * which has no window for Chrome's prompt: this small window asks once, tells the session the answer and closes.
 */
const root = document.getElementById("root")!;
let answered = false;
/** The conversation that asked, from the address the worker opened this window with: an answer to an older one is ignored. */
const sid = Number(new URLSearchParams(location.search).get("sid"));

function say(title: string, text: string, close = false) {
  root.replaceChildren();
  const h = document.createElement("h1");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  root.append(h, p);
  if (close) {
    const b = document.createElement("button");
    b.className = "lm-btn lm-btn--secondary";
    b.textContent = "Close";
    b.addEventListener("click", () => window.close());
    root.append(b);
  }
}

function answer(ok: boolean) {
  if (answered) return;
  answered = true;
  chrome.runtime.sendMessage({ to: "offscreen", voice: { t: "mic", ok }, tabId: 0, sid } satisfies ToOffscreen).catch(ignore); // no session is waiting any more
}

async function ask() {
  try {
    // Tests simulate a blocked microphone; the value is in this extension origin's own storage, out of reach of pages.
    const test = __TEST__ ? localStorage.getItem("speakkit.voice.mic") : null; // denied: refuse; hang: leave the prompt open; prompt: allow
    if (test === "hang") return await new Promise<void>(() => {});
    if (test === "denied") throw new DOMException("denied", "NotAllowedError");
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    if (test) localStorage.removeItem("speakkit.voice.mic");
    answer(true);
    window.close();
  } catch {
    answer(false);
    say("Microphone blocked", "Speak Kit cannot hear you. In Chrome, open the site settings of this extension and set Microphone to Allow, then talk to the page again.", true);
  }
}

say("Allow the microphone", "Needed to hear your questions. Speak Kit listens only while a conversation is open, and nothing is recorded.");
addEventListener("pagehide", () => answer(false)); // the window was closed without an answer
void ask();
