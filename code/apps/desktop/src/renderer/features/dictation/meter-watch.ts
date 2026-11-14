/** How often the page renews the meter; shorter than the lease main gives it. */
export const RENEW_MS = 5000;

interface Meter {
  micMeter(on: boolean): Promise<void>;
}
interface Doc {
  visibilityState: string;
  hasFocus(): boolean;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}
interface Win {
  addEventListener(type: "focus" | "blur", fn: () => void): void;
  removeEventListener(type: "focus" | "blur", fn: () => void): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

/** A meter call that fails means the main process is gone or the window is closing: there is nothing left to switch. */
function ignore(): void {}

/**
 * Keeps the level meter (and so the microphone) on only while the window is visible and focused: on when it is, renewed every few seconds, off the moment
 * it is hidden to the tray, loses focus or the page goes away. Returns the cleanup.
 */
export function watchMeter(api: Meter, doc: Doc, win: Win): () => void {
  let on = false;
  const sync = () => {
    const want = doc.visibilityState === "visible" && doc.hasFocus();
    if (want === on && !want) return;
    on = want;
    void api.micMeter(want).catch(ignore);
  };
  doc.addEventListener("visibilitychange", sync);
  win.addEventListener("focus", sync);
  win.addEventListener("blur", sync);
  const timer = win.setInterval(() => on && void api.micMeter(true).catch(ignore), RENEW_MS);
  sync();
  return () => {
    doc.removeEventListener("visibilitychange", sync);
    win.removeEventListener("focus", sync);
    win.removeEventListener("blur", sync);
    win.clearInterval(timer);
    if (on) void api.micMeter(false).catch(ignore);
  };
}
