import { app, screen, type BrowserWindow } from "electron";
import { createSecureWindow } from "../secure-window";
import type { ConsentCard } from "./look";
import { keepProtected } from "./platform";

/** The card goes away by itself: a question nobody answers is a no. */
const ANSWER_MS = 60_000;
const WIDTH = 460;
const HEIGHT = 330;

const POINTS = [
  "When you ask, Speak Kit takes a picture of your window, or of the whole screen when you say so, and reads the text in it.",
  "The picture and the text go to your provider, OpenAI, to answer you. OpenAI bills them to your account.",
  "Nothing is saved. Speak Kit's own windows are not in the picture, and a notice shows while it looks.",
  "This lasts until the conversation ends.",
];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Logical properties only (check-css); the page is outside the app's stylesheet, so colours are literal.
const PAGE = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Speak Kit</title>
<style>
html{background:rgb(255 255 255);color:rgb(24 24 27);font:14px/1.45 system-ui,sans-serif}
body{margin:0;padding:24px;box-sizing:border-box;block-size:100vh;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:17px;font-weight:600}
ul{margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px}
.row{margin-block-start:auto;display:flex;justify-content:flex-end;gap:8px}
button{block-size:36px;padding-inline:16px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;border:1px solid rgb(212 212 216);background:rgb(255 255 255);color:inherit}
button.primary{background:rgb(24 24 27);border-color:rgb(24 24 27);color:rgb(255 255 255)}
button:focus-visible{outline:2px solid rgb(59 130 246);outline-offset:2px}
</style>
<h1>Let the voice chat look at your screen?</h1>
<ul>${POINTS.map((p) => `<li>${escape(p)}</li>`).join("")}</ul>
<div class="row"><button type="button" data-choice="no">Not now</button><button type="button" class="primary" data-choice="yes" autofocus>Allow for this conversation</button></div>`;

const PAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;

/** The page reports the button through its title: no bridge and no script of its own (its policy allows none). */
const WIRE = `document.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { document.title = "choice:" + b.dataset.choice; }));`;

/** Opens the card window in front of everything, centred in the upper part of the display the cursor is on, kept out of captures like the indicator. */
function openCard(): BrowserWindow {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const w = createSecureWindow(
    {
      width: WIDTH,
      height: HEIGHT,
      x: Math.round(area.x + (area.width - WIDTH) / 2),
      y: Math.round(area.y + (area.height - HEIGHT) / 3),
      show: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      title: "Speak Kit",
      webPreferences: { preload: "" },
    },
    (win) => {
      win.webContents.executeJavaScript(WIRE).catch(() => win.close()); // without its buttons the card cannot be answered: that is a no
      win.show();
      app.focus({ steal: true }); // the user is in another program: without this the card shows but the keyboard stays there
      win.focus();
    },
  );
  keepProtected.add(w);
  w.setContentProtection(true);
  w.loadURL(PAGE_URL).catch(() => w.close());
  return w;
}

/** The consent card: asks once and closes. A button, Escape, closing the window, the timeout and an abort each end it; only "Allow" says yes. */
export function createConsentCard(): ConsentCard {
  return {
    ask: (signal) =>
      new Promise<boolean>((resolve) => {
        if (signal.aborted) return resolve(false);
        const w = openCard();
        let answered = false;
        const onAbort = () => done(false);
        const timer = setTimeout(() => done(false), ANSWER_MS);
        const done = (yes: boolean) => {
          if (answered) return;
          answered = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolve(yes);
          if (!w.isDestroyed()) w.destroy();
        };
        signal.addEventListener("abort", onAbort);
        w.webContents.on("page-title-updated", (e, title) => {
          e.preventDefault();
          if (title.startsWith("choice:")) done(title === "choice:yes");
        });
        w.webContents.on("before-input-event", (e, input) => {
          if (input.type !== "keyDown" || input.key !== "Escape") return;
          e.preventDefault();
          done(false);
        });
        w.on("closed", () => done(false));
      }),
  };
}
