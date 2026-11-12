import { app, shell } from "electron";
import type { Ctx } from "./context";
import type { Api } from "../shared/ipc";
import { workRunning, type UpdateState } from "../shared/updates";
import type { ToastCenter } from "./toasts";
import { feedOverride, githubLatestRelease, isReleaseUrl, updateMode, Updates, type UpdaterLike } from "./updates";
import { fakeRelease } from "./updates-fake";
import { testEnv } from "./test-env";

/** First check this long after startup, then once a day while the app runs. */
const FIRST_CHECK_MS = 30_000;
const DAILY_MS = 24 * 60 * 60_000;

type UpdateHandlers = Pick<Api, "updateAction">;

/**
 * electron-updater against GitHub Releases (the publish target is in electron-builder.yml). Only an installed Windows build
 * updates itself; macOS only announces a newer release; a portable build or a source checkout reports "unsupported". Nothing is
 * installed without the user. SPEAKKIT_UPDATE_URL swaps the feed for a generic one (used by the local update test).
 */
export function createUpdates(ctx: Ctx, toasts: ToastCenter, onChange: () => void, beforeInstall: () => void, fake?: () => UpdaterLike) {
  const env = process.env;
  const requested = testEnv().updateUrl;
  const feedUrl = feedOverride(requested);
  if (requested && !feedUrl) ctx.log.warn("SPEAKKIT_UPDATE_URL is not an http(s) address; using the GitHub feed");
  const manualFake = __TEST_CODE__ && !app.isPackaged ? env.SPEAKKIT_UPDATE_MANUAL || undefined : undefined;
  const mode = updateMode({
    platform: process.platform,
    packaged: app.isPackaged,
    portable: !!env.PORTABLE_EXECUTABLE_FILE,
    isolated: !!env.SPEAKKIT_USER_DATA,
    feedUrl,
    fake: !!fake,
    forceManual: !!manualFake,
  });
  const updates = new Updates({
    mode,
    currentVersion: app.getVersion(),
    load: async () => {
      if (fake) return fake();
      const mod = (await import("electron-updater")) as unknown as { autoUpdater?: UpdaterLike; default?: { autoUpdater: UpdaterLike } };
      const u = (mod.autoUpdater ?? mod.default!.autoUpdater) as UpdaterLike;
      if (feedUrl) u.setFeedURL?.({ provider: "generic", url: feedUrl });
      return u;
    },
    latestRelease: manualFake ? fakeRelease(manualFake) : (early) => githubLatestRelease(fetch, early),
    early: () => ctx.config.updateChannel === "early",
    onState: (s) => setState(s),
    onReady: (version, notes) => {
      if (notes.length > 0) {
        ctx.config.whatsNew = { version, notes };
        ctx.saveConfig();
      }
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
    busy: () => workRunning(ctx.state),
    onBusy: () => {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "settings", sub: "about" });
    },
    beforeInstall,
  });

  function setState(s: UpdateState) {
    ctx.state.update = s;
    onChange();
    ctx.publish();
  }
  ctx.state.update = updates.state;

  const timers: NodeJS.Timeout[] = [];
  if (mode !== "unsupported" && ctx.config.autoUpdate) {
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
        case "install-now-anyway":
          await updates.installNow(true);
          break;
        case "install-on-quit":
          await updates.installOnQuit();
          break;
        case "open-release": {
          const s = updates.state;
          if (s.kind === "manual" && isReleaseUrl(s.url)) void shell.openExternal(s.url);
          break;
        }
      }
      return ctx.publish();
    },
  };

  return { updates, handlers, dispose: () => timers.forEach((t) => clearTimeout(t)) };
}
