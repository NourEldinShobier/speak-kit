import { Notification } from "electron";
import type { Activity } from "../shared/ipc";
import type { NotifyEvent } from "../shared/schemas";
import type { Ctx } from "./context";
import type { EngineState } from "@speakkit/protocol";
import { noticeFor } from "./notify-rules";
import { ToastCenter } from "./toasts";

const BELL_KIND: Record<NotifyEvent | "clipboard", Activity["kind"]> = {
  "reading-finished": "reading",
  "export-done": "export",
  "engine-error": "error",
  "update-ready": "update",
  clipboard: "info",
};

export interface ShownToast {
  title: string;
  body: string;
  silent: boolean;
  onClick?: (() => void) | undefined;
}

/** The one path every native notification takes. With the test hook the toasts are recorded in `shown` as well, and SPEAKKIT_QUIET_NOTIFY keeps them off screen. */
export function createDesktopToasts(ctx: Ctx, test: boolean) {
  const shown: ShownToast[] = [];
  const toasts = new ToastCenter({
    prefs: () => ({ notifications: ctx.config.notifications, doNotDisturb: ctx.config.doNotDisturb }),
    looking: ctx.looking,
    show: (t) => {
      if (test) shown.push(t);
      if (process.env.SPEAKKIT_QUIET_NOTIFY || !Notification.isSupported()) return;
      const n = new Notification({ title: t.title, body: t.body, silent: t.silent });
      if (t.onClick) n.on("click", t.onClick);
      n.show();
    },
    bell: (event, title, body) => {
      ctx.addActivity(BELL_KIND[event], title, body);
      ctx.publish();
    },
    now: Date.now,
  });
  return { toasts, shown };
}

/** The engine changed state: tell the user about a failure. */
export const engineAnnouncer = (ctx: Ctx, toasts: ToastCenter) => (prev: EngineState | undefined, next: EngineState, detail: string | undefined) => {
  const n = noticeFor(prev, next, detail);
  if (!n) return;
  toasts.notify({
    event: n.event,
    taskKey: n.taskKey,
    title: n.title,
    body: n.body,
    onClick: () => {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "engines" });
    },
  });
};
