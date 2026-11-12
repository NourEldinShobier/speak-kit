import type { TrayAction, TrayContext } from "../shared/tray";
import type { Ctx } from "./context";
import type { createExports } from "./export/service";
import type { createReading } from "./reader/service";
import { createTray } from "./tray";
import { showTrayIcon } from "../shared/settings/behaviour";
import type { createUpdates } from "./updates-service";
import type { DictationService } from "./dictation/service";
import type { TranscriptsFeature } from "./transcripts";
import type { MeetingsFeature } from "./meetings";

interface TrayParts {
  reading: ReturnType<typeof createReading>;
  exports: ReturnType<typeof createExports>;
  updates: ReturnType<typeof createUpdates>;
  dictation: DictationService;
  transcripts: TranscriptsFeature;
  /** Built after the tray (it reaches the tray only through a callback), so it is read when the menu is built. */
  meetings(): MeetingsFeature | undefined;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
}

type TrayStateParts = Pick<TrayParts, "exports" | "dictation" | "transcripts" | "meetings">;

/** What the menu is built from: the shared state plus the live counts of the features. */
function trayContext(ctx: Ctx, { exports, dictation, transcripts, meetings }: TrayStateParts): TrayContext {
  const m = ctx.config.meetings;
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
    ...(m.enabled && meetings() && { meetings: { phase: meetings()!.phase(), ...(m.shortcut && { shortcut: m.shortcut }) } }),
    ...(dictation.status().supported && { dictation: { enabled: ctx.config.dictation.enabled, hotkey: ctx.config.dictation.hotkey, paused: dictation.controls.paused } }),
  };
}

/** The tray icon and its menu: what the menu shows comes from the shared state, what its items do from the features. */
export function setupTray(ctx: Ctx, { reading, exports, updates, dictation, transcripts, meetings, requestQuit, retryEngine }: TrayParts) {
  const context = () => trayContext(ctx, { exports, dictation, transcripts, meetings });
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
    "meeting-start": () => void meetings()?.start(),
    "meeting-stop": () => void meetings()?.stop(),
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
  tray.setVisible(showTrayIcon(ctx.config));
  ctx.sinks.add(() => tray.refresh());
  return tray;
}
