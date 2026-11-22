/** Native notifications: a Windows toast, a line in the bell, a sound. */
export type NotifyEvent = "reading-finished" | "export-done" | "engine-error" | "update-ready";

/** Which of toast, bell and sound each event uses. Fixed: Settings has no switches for them. */
export const NOTIFY_CHANNELS: Record<NotifyEvent, { toast: boolean; bell: boolean; sound: boolean }> = {
  "reading-finished": { toast: false, bell: false, sound: false },
  "export-done": { toast: true, bell: true, sound: false },
  "engine-error": { toast: true, bell: true, sound: true },
  "update-ready": { toast: true, bell: true, sound: false },
};

/** One toast per task per 10 minutes. */
export const THROTTLE_MS = 10 * 60_000;

interface ToastRequest {
  event: NotifyEvent;
  /** The task the toast is about (an export id, an engine id); repeats with the same key are dropped. */
  taskKey?: string;
  title: string;
  body: string;
  onClick?: (() => void) | undefined;
}

/** shown: a toast appeared. bell-only: recorded in the bell, no toast (the user is looking). throttled and off: nothing happened. */
type ToastOutcome = "shown" | "bell-only" | "throttled" | "off";

interface ToastDeps {
  /** True while the main window is visible and focused; a toast would only repeat what is on screen. */
  looking(): boolean;
  show(t: { title: string; body: string; silent: boolean; onClick?: (() => void) | undefined }): void;
  bell(event: NotifyEvent, title: string, body: string): void;
  now(): number;
}

/** The single path every native notification takes: channel table, throttle. */
export class ToastCenter {
  #last = new Map<string, number>();
  #d: ToastDeps;
  constructor(deps: ToastDeps) {
    this.#d = deps;
  }

  notify(r: ToastRequest): ToastOutcome {
    const ch = NOTIFY_CHANNELS[r.event];
    if (!ch.toast && !ch.bell) return "off";
    const now = this.#d.now();
    for (const [k, t] of this.#last) if (now - t >= THROTTLE_MS) this.#last.delete(k);
    const key = `${r.event}:${r.taskKey ?? ""}`;
    if (this.#last.has(key)) return "throttled";
    this.#last.set(key, now);
    if (ch.bell) this.#d.bell(r.event, r.title, r.body);
    if (!ch.toast || this.#d.looking()) return "bell-only";
    this.#d.show({ title: r.title, body: r.body, silent: !ch.sound, onClick: r.onClick });
    return "shown";
  }
}
