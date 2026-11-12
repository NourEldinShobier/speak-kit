import type { TrayAction, TrayContext } from "../shared/tray";
import type { Ctx } from "./context";
import type { createExports } from "./export/service";
import type { createReading } from "./reader/service";
import { createTray } from "./tray";
import type { createUpdates } from "./updates-service";
import type { DictationService } from "./dictation/service";

interface TrayParts {
  reading: ReturnType<typeof createReading>;
  exports: ReturnType<typeof createExports>;
  updates: ReturnType<typeof createUpdates>;
  dictation: DictationService;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
}

/** The tray icon and its menu: what the menu shows comes from the shared state, what its items do from the features. */
export function setupTray(ctx: Ctx, { reading, exports, updates, dictation, requestQuit, retryEngine }: TrayParts) {
  const context = (): TrayContext => ({
    health: ctx.state.health,
    serverError: ctx.state.serverError,
    reader: ctx.state.reader,
    update: ctx.state.update,
    exportsRunning: exports.runningCount(),
    doNotDisturb: ctx.config.doNotDisturb,
    shortcuts: ctx.config.shortcuts,
    ...(dictation.status().supported && { dictation: { enabled: ctx.config.dictation.enabled, hotkey: ctx.config.dictation.hotkey, paused: dictation.controls.paused } }),
  });
  const openDictation = (page: "dictation" | "history") => () => {
    ctx.showWindow();
    ctx.sendUi({ type: "nav", page });
  };
  const actions: Record<TrayAction, () => void> = {
    dictation: dictation.toggle,
    "paste-last": () => void dictation.controls.pasteLast(),
    "pause-shortcuts": () => dictation.controls.setPaused(!dictation.controls.paused),
    "dictation-history": openDictation("history"),
    "dictation-settings": openDictation("dictation"),
    open: ctx.showWindow,
    pause: () => reading.controller.command({ type: "pause" }),
    resume: () => reading.controller.command({ type: "resume" }),
    stop: () => reading.controller.command({ type: "stop" }),
    wake: () => void ctx.server.warm().catch(() => {}), // a failed warm-up shows as the engine state
    "restart-engine": () => void retryEngine(),
    dnd: () => {
      ctx.config.doNotDisturb = !ctx.config.doNotDisturb;
      ctx.saveConfig();
      ctx.publish();
    },
    settings: () => {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "settings", sub: "general" });
    },
    "check-updates": () => void updates.updates.checkAndDownload(),
    "restart-update": () => void updates.updates.installNow(),
    quit: requestQuit,
  };
  const tray = createTray(context, actions);
  ctx.sinks.add(() => tray.refresh());
  return tray;
}
