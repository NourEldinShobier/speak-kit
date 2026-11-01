import type { NotifyEvent, Notifications } from "../shared/schemas";

/** Lumen NO1: one toast per task per 10 minutes. */
export const THROTTLE_MS = 10 * 60_000;

/** The clipboard prompt has its own switch in Settings > General, so it is not in the notifications table. */
const CLIPBOARD_PROMPT = { toast: true, bell: false, sound: false };

interface ToastRequest {
  event: NotifyEvent | "clipboard";
  /** The task the toast is about (an export id, an engine id); repeats with the same key are dropped. */
  taskKey?: string;
  title: string;
  body: string;
  onClick?: () => void;
}

/** shown: a toast appeared. bell-only: recorded in the bell, no toast (muted, Do Not Disturb or the user is looking). throttled and off: nothing happened. */
type ToastOutcome = "shown" | "bell-only" | "throttled" | "off";

interface ToastDeps {
  prefs(): { notifications: Notifications; doNotDisturb: boolean };
  /** True while the main window is visible and focused; a toast would only repeat what is on screen. */
  looking(): boolean;
  show(t: { title: string; body: string; silent: boolean; onClick?: () => void }): void;
  bell(event: NotifyEvent | "clipboard", title: string, body: string): void;
  now(): number;
}

/** The single path every native notification takes: settings table, Do Not Disturb, throttle. */
export class ToastCenter {
  #last = new Map<string, number>();
  #d: ToastDeps;
  constructor(deps: ToastDeps) {
    this.#d = deps;
  }

  notify(r: ToastRequest): ToastOutcome {
    const { notifications, doNotDisturb } = this.#d.prefs();
    const ch = r.event === "clipboard" ? CLIPBOARD_PROMPT : notifications[r.event];
    if (!ch.toast && !ch.bell) return "off";
    const now = this.#d.now();
    for (const [k, t] of this.#last) if (now - t >= THROTTLE_MS) this.#last.delete(k);
    const key = `${r.event}:${r.taskKey ?? ""}`;
    if (this.#last.has(key)) return "throttled";
    this.#last.set(key, now);
    if (ch.bell) this.#d.bell(r.event, r.title, r.body);
    if (!ch.toast || doNotDisturb || this.#d.looking()) return "bell-only";
    this.#d.show({ title: r.title, body: r.body, silent: !ch.sound, onClick: r.onClick });
    return "shown";
  }
}
