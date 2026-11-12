import type { TrayAction, TrayContext } from "../shared/tray";
import type { Ctx } from "./context";
import type { createExports } from "./export/service";
import type { createReading } from "./reader/service";
import { createTray } from "./tray";
import { showTrayIcon } from "../shared/settings/behaviour";
import type { createUpdates } from "./updates-service";
import type { DictationService } from "./dictation/service";
import type { TranscriptsFeature } from "./transcripts";

interface TrayParts {
  reading: ReturnType<typeof createReading>;
  exports: ReturnType<typeof createExports>;
  updates: ReturnType<typeof createUpdates>;
  dictation: DictationService;
  transcripts: TranscriptsFeature;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
}

/** What the menu is built from: the shared state plus the live counts of the features. */
function trayContext(ctx: Ctx, { exports, dictation, transcripts }: Pick<TrayParts, "exports" | "dictation" | "transcripts">): TrayContext {
  return {
    health: ctx.state.health,
    serverError: ctx.state.serverError,
    reader: ctx.state.reader,
    update: ctx.state.update,
    exportsRunning: exports.runningCount(),
    doNotDisturb: ctx.config.doNotDisturb,
    shortcuts: ctx.config.shortcuts,
    platform: process.platform,
    recorder: { phase: transcripts.phase() },
    ...(dictation.status().supported && {
      dictation: { enabled: ctx.config.dictation.enabled, hotkey: ctx.config.dictation.hotkey, paused: dictation.controls.paused, recent: dictation.history.recent() },
    }),
  };
}

/** The tray icon and its menu: what the menu shows comes from the shared state, what its items do from the features. */
export function setupTray(ctx: Ctx, { reading, exports, updates, dictation, transcripts, requestQuit, retryEngine }: TrayParts) {
  const context = () => trayContext(ctx, { exports, dictation, transcripts });
  const openDictation = (page: "dictation" | "history") => () => {
    ctx.showWindow();
    ctx.sendUi({ type: "nav", page });
  };
  const actions: Record<TrayAction, () => void> = {
    dictation: dictation.toggle,
    "paste-last": () => void dictation.controls.pasteLast(),
    "pause-shortcuts": () => dictation.controls.setPaused(!dictation.controls.paused),
    "record-start": () => void transcripts.startRecording().then(() => ctx.showWindow()),
    "record-stop": () => void transcripts.stopRecording(),
    "dictation-history": openDictation("history"),
    "dictation-settings": openDictation("dictation"),
    "dictation-copy-0": () => dictation.history.copyRecent(0),
    "dictation-copy-1": () => dictation.history.copyRecent(1),
    "dictation-copy-2": () => dictation.history.copyRecent(2),
    "dictation-copy-3": () => dictation.history.copyRecent(3),
    "dictation-copy-4": () => dictation.history.copyRecent(4),
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
  tray.setVisible(showTrayIcon(ctx.config));
  ctx.sinks.add(() => tray.refresh());
  return tray;
}
