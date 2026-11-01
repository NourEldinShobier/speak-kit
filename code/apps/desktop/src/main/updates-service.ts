import { app } from "electron";
import type { Ctx } from "./context";
import type { Api } from "../shared/ipc";
import type { UpdateState } from "../shared/updates";
import type { ToastCenter } from "./toasts";
import { Updates, type UpdaterLike } from "./updates";

/** First check this long after startup, then once a day while the app runs. */
const FIRST_CHECK_MS = 30_000;
const DAILY_MS = 24 * 60 * 60_000;

type UpdateHandlers = Pick<Api, "updateAction">;

/**
 * electron-updater against GitHub Releases (the publish target is in electron-builder.yml). Only an installed build updates; a
 * portable build or a source checkout reports "unsupported". Nothing is installed without the user.
 */
export function createUpdates(ctx: Ctx, toasts: ToastCenter, onChange: () => void, beforeInstall: () => void, fake?: () => UpdaterLike) {
  // The portable build sets PORTABLE_EXECUTABLE_FILE and cannot replace itself.
  const supported = !!fake || (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && !process.env.SPEAKKIT_USER_DATA);
  const updates = new Updates({
    supported,
    load: async () => {
      if (fake) return fake();
      const mod = (await import("electron-updater")) as unknown as { autoUpdater?: UpdaterLike; default?: { autoUpdater: UpdaterLike } };
      return (mod.autoUpdater ?? mod.default!.autoUpdater) as UpdaterLike;
    },
    onState: (s) => setState(s),
    onReady: (version) => {
      ctx.addActivity("update", "Update ready", `Speak Kit ${version} is downloaded. Restart when it suits you.`);
      toasts.notify({
        event: "update-ready",
        taskKey: version,
        title: "Update ready",
        body: `Speak Kit ${version} is ready to install. Click to choose when.`,
        onClick: () => {
          ctx.showWindow();
          ctx.sendUi({ type: "nav", page: "settings", sub: "about" });
        },
      });
    },
    now: Date.now,
    beforeInstall,
  });

  function setState(s: UpdateState) {
    ctx.state.update = s;
    onChange();
    ctx.publish();
  }
  ctx.state.update = updates.state;

  const timers: NodeJS.Timeout[] = [];
  if (supported && ctx.config.autoUpdate) {
    const first = setTimeout(() => {
      void updates.checkAndDownload();
      timers.push(setInterval(() => ctx.config.autoUpdate && void updates.checkAndDownload(), DAILY_MS).unref());
    }, FIRST_CHECK_MS);
    first.unref();
    timers.push(first);
  }

  const handlers: UpdateHandlers = {
    updateAction: async (action) => {
      switch (action) {
        case "check":
          await updates.checkAndDownload();
          break;
        case "download":
          await updates.download();
          break;
        case "install-now":
          await updates.installNow();
          break;
        case "install-on-quit":
          await updates.installOnQuit();
          break;
        case "remind-later":
          ctx.config.updateRemindAtMs = Date.now() + DAILY_MS;
          ctx.saveConfig();
          break;
      }
      return ctx.publish();
    },
  };

  return { updates, handlers, dispose: () => timers.forEach((t) => clearTimeout(t)) };
}
