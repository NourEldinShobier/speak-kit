import { clipboard, globalShortcut, Notification, type BrowserWindow } from "electron";
import path from "node:path";
import type { Activity, Api } from "../shared/ipc";
import type { ConfigPatch, NotifyEvent } from "../shared/schemas";
import { DEFAULT_SHORTCUTS, type ShortcutId } from "../shared/shortcuts";
import type { TrayAction, TrayContext } from "../shared/tray";
import { IDLE_READER } from "../shared/reader";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { EngineState } from "@speakkit/protocol";
import type { Ctx } from "./context";
import { engineHandlers } from "./engines";
import { createExports } from "./export/service";
import { installExtension } from "./extension";
import { noticeFor } from "./notify-rules";
import { createReading } from "./reader/service";
import { ShortcutRegistry, type ShortcutApi } from "./shortcuts";
import { ClipboardWatcher } from "./system/clipboard-watch";
import { copyIsPrivate } from "./system/clipboard";
import { ToastCenter } from "./toasts";
import { createTray } from "./tray";
import { createUpdates } from "./updates-service";
import { fakeUpdater } from "./updates-fake";

const BELL_KIND: Record<NotifyEvent | "clipboard", Activity["kind"]> = {
  "reading-finished": "reading",
  "export-done": "export",
  "download-done": "download",
  "engine-error": "error",
  "update-ready": "update",
  clipboard: "info",
};

interface DesktopOptions {
  parent: () => BrowserWindow | null;
  /** Directory of the bundled main-process files (mp3-worker.js sits next to index.js). */
  distDir: string;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
  /** The test hook (SPEAKKIT_TEST): shortcuts and toasts are simulated instead of touching the OS. */
  test: boolean;
  /** Version the fake updater announces (tests only; see test-env.ts). */
  fakeUpdate?: string;
}

/**
 * Everything beyond the server and the main window: global shortcuts, reading and the mini player, the clipboard prompt, toasts,
 * exports, updates and the tray. `handlers` are the IPC methods these features add.
 */
export function setupDesktop(ctx: Ctx, o: DesktopOptions) {
  // ---- toasts: the one path every native notification takes ----
  const shownToasts: { title: string; body: string; silent: boolean; onClick?: () => void }[] = [];
  const toasts = new ToastCenter({
    prefs: () => ({ notifications: ctx.config.notifications, doNotDisturb: ctx.config.doNotDisturb }),
    looking: ctx.looking,
    show: (t) => {
      if (o.test) shownToasts.push(t);
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

  // ---- reading, exports, updates ----
  const reading = createReading(ctx, toasts, () => tray.refresh());
  const exports = createExports(ctx, toasts, o.parent, new URL("./mp3-worker.js", `file://${path.resolve(o.distDir)}/`), () => tray.refresh());
  let installedByTest = 0;
  // Restart now: what is running stops first; quitAndInstall then quits the app itself.
  const stopWork = () => {
    reading.controller.command({ type: "stop" });
    exports.dispose();
  };
  const updates = createUpdates(ctx, toasts, () => tray.refresh(), stopWork, __TEST_CODE__ && o.fakeUpdate ? () => fakeUpdater(o.fakeUpdate!, () => void installedByTest++) : undefined);

  // ---- global shortcuts ----
  const actions: Record<ShortcutId, () => void> = {
    "read-selection": () => void reading.readSelection(),
    "play-pause": () => reading.controller.command({ type: "toggle" }),
    stop: () => reading.controller.command({ type: "stop" }),
    "read-clipboard": () => void reading.readClipboard(),
  };
  // Tests simulate the OS: a real registration would clash with an installed SpeakKit and cannot be pressed from Playwright.
  const fakeKeys = new Map<string, () => void>();
  const foreign = new Set<string>();
  const osApi: ShortcutApi = o.test
    ? {
        register: (a, cb) => !foreign.has(a) && !fakeKeys.has(a) && (fakeKeys.set(a, cb), true),
        unregister: (a) => void fakeKeys.delete(a),
      }
    : globalShortcut;
  const registry = new ShortcutRegistry(osApi, (id) => actions[id]());
  const applyShortcuts = () => {
    ctx.state.shortcuts = { bindings: { ...ctx.config.shortcuts }, conflicts: registry.apply(ctx.config.shortcuts) };
  };
  applyShortcuts();

  // ---- clipboard prompt ----
  const watcher = new ClipboardWatcher({
    text: () => clipboard.readText(),
    isPrivate: copyIsPrivate,
    onCopy: (text) =>
      toasts.notify({
        event: "clipboard",
        taskKey: text.slice(0, 40),
        title: "Copied text: read it?",
        body: "Click to read it out loud. Turn this off in Settings.",
        onClick: () => void reading.readText(text, "clipboard"),
      }),
  });
  const syncWatcher = () => (ctx.config.clipboardPrompt ? watcher.start() : watcher.stop());
  syncWatcher();

  // ---- tray ----
  const trayContext = (): TrayContext => ({
    health: ctx.state.health,
    serverError: ctx.state.serverError,
    reader: ctx.state.reader,
    update: ctx.state.update,
    exportsRunning: exports.runningCount(),
    doNotDisturb: ctx.config.doNotDisturb,
    shortcuts: ctx.config.shortcuts,
  });
  const goSettings = (sub: "general" | "about" = "general") => {
    ctx.showWindow();
    ctx.sendUi({ type: "nav", page: "settings", sub });
  };
  const trayActions: Record<TrayAction, () => void> = {
    "read-clipboard": () => void reading.readClipboard(),
    open: ctx.showWindow,
    pause: () => reading.controller.command({ type: "pause" }),
    resume: () => reading.controller.command({ type: "resume" }),
    stop: () => reading.controller.command({ type: "stop" }),
    wake: () => void ctx.server.warm().catch(() => {}),
    "restart-engine": () => void o.retryEngine(),
    dnd: () => {
      ctx.config.doNotDisturb = !ctx.config.doNotDisturb;
      ctx.saveConfig();
      ctx.publish();
    },
    settings: () => goSettings(),
    "check-updates": () => void updates.updates.checkAndDownload(),
    "restart-update": () => void updates.updates.installNow(),
    quit: o.requestQuit,
  };
  const tray = createTray(ctx, trayContext, trayActions);
  ctx.sinks.add(() => tray.refresh());
  ctx.state.reader = IDLE_READER;
  ctx.state.update ??= UPDATE_UNSUPPORTED;

  const handlers = {
    ...engineHandlers(ctx),
    ...exports.handlers,
    ...updates.handlers,
    setShortcut: async (id, accelerator) => {
      const r = registry.set(ctx.config.shortcuts, id, accelerator);
      if (!r.ok) return r.conflict ? { ok: false, error: r.error, conflict: r.conflict } : { ok: false, error: r.error };
      ctx.config.shortcuts = { ...ctx.config.shortcuts, [id]: accelerator };
      ctx.saveConfig();
      applyShortcuts();
      ctx.publish();
      return { ok: true };
    },
    resetShortcuts: async () => {
      ctx.config.shortcuts = { ...DEFAULT_SHORTCUTS };
      ctx.saveConfig();
      applyShortcuts();
      return ctx.publish();
    },
    reader: async (cmd) => reading.command(cmd),
    readClipboard: async () => reading.readClipboard(),
    readerStarted: async (epoch, index) => reading.started(epoch, index),
    readerDone: async (epoch, index) => reading.done(epoch, index),
    installExtension: () => installExtension(!o.test),
  } satisfies Partial<Api>;

  return {
    handlers,
    /** Called by the IPC layer: is this webContents one of our small windows? */
    ownsWindow: (c: Electron.WebContents) => reading.owns(c) || tray.owns(c),
    /** Reacts to a Settings change. */
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.clipboardPrompt !== undefined) syncWatcher();
      if (patch.doNotDisturb !== undefined) ctx.publish();
    },
    /** The engine changed state: tell the user about a finished download or a failure. */
    onEngineState: (prev: EngineState | undefined, next: EngineState, detail: string | undefined) => {
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
    },
    runningWork: () => ({ reading: ctx.state.reader.status === "playing" || ctx.state.reader.status === "preparing", exports: exports.runningCount() }),
    refreshTray: () => tray.refresh(),
    dispose: () => {
      watcher.stop();
      registry.unregisterAll();
      reading.dispose();
      exports.dispose();
      updates.dispose();
      tray.dispose();
    },
    /** SPEAKKIT_TEST hooks: simulate what Playwright cannot do (global key presses, native menus, toasts). */
    testHook: () => ({
      pressShortcut: (accelerator: string) => fakeKeys.get(accelerator)?.(),
      registeredShortcuts: () => [...fakeKeys.keys()].sort(),
      foreignShortcuts: (list: string[]) => {
        foreign.clear();
        list.forEach((a) => foreign.add(a));
        applyShortcuts();
        ctx.publish();
      },
      toasts: () => shownToasts.map(({ title, body, silent }) => ({ title, body, silent })),
      clickToast: (i: number) => shownToasts[i]?.onClick?.(),
      installs: () => installedByTest,
      trayItems: () => tray.items().map((i) => ({ label: i.label, enabled: i.enabled, type: i.type, checked: i.checked })),
      clickTray: (label: string) => {
        const item = tray.items().find((i) => i.label === label);
        if (!item || !item.enabled) throw new Error(`no enabled tray item ${label}`);
        item.click();
      },
      trayState: () => tray.summary(),
      togglePanel: tray.togglePanel,
      readText: (text: string) => reading.readText(text, "text"),
    }),
  };
}
