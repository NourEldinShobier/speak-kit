import { nativeTheme } from "electron";
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
  /** The notice to show in the menu, if any. */
  notice(): string | undefined;
  requestQuit(): void;
  retryEngine(): Promise<unknown>;
}

/** The downloaded speech models for the tray quick switch; nothing when none is downloaded. */
function speechModelsContext(dictation: DictationService): Pick<TrayContext, "speechModels"> {
  const v = dictation.speech.view();
  const models = v.models.filter((m) => m.installed).map((m) => ({ id: m.id, name: m.name, inUse: m.inUse }));
  if (models.length === 0) return {};
  return { speechModels: { models, recording: v.recording, ...(v.switching && { switching: { name: v.names[v.switching] ?? v.switching } }) } };
}

type TrayStateParts = Pick<TrayParts, "exports" | "dictation" | "transcripts" | "meetings" | "notice">;

/** What the menu is built from: the shared state plus the live counts of the features. */
function trayContext(ctx: Ctx, { exports, dictation, transcripts, meetings, notice }: TrayStateParts): TrayContext {
  const m = ctx.config.meetings;
  const note = notice();
  return {
    ...(note && { notice: note }),
    health: ctx.state.health,
    serverError: ctx.state.serverError,
    reader: ctx.state.reader,
    update: ctx.state.update,
    exportsRunning: exports.runningCount(),
    doNotDisturb: ctx.config.doNotDisturb,
    shortcuts: ctx.config.shortcuts,
    platform: process.platform,
    darkTaskbar: nativeTheme.shouldUseDarkColorsForSystemIntegratedUI,
    recorder: { phase: transcripts.phase() },
    ...(m.enabled && meetings() && { meetings: { phase: meetings()!.phase(), ...(m.shortcut && { shortcut: m.shortcut }) } }),
    ...(dictation.status().supported && {
      dictation: { enabled: ctx.config.dictation.enabled, hotkey: ctx.config.dictation.hotkey, paused: dictation.controls.paused, recent: dictation.history.recent() },
    }),
    ...speechModelsContext(dictation),
  };
}

/** The tray icon and its menu: what the menu shows comes from the shared state, what its items do from the features. */
export function setupTray(ctx: Ctx, { reading, exports, updates, dictation, transcripts, meetings, notice, requestQuit, retryEngine }: TrayParts) {
  const context = () => trayContext(ctx, { exports, dictation, transcripts, meetings, notice });
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
    "cancel-switch": () => void dictation.speech.cancelSwitch(),
    "get-models": () => {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "engines" });
    },
    "check-updates": () => void updates.updates.checkAndDownload(),
    "restart-update": () => void updates.updates.installNow(),
    quit: requestQuit,
  };
  const tray = createTray(context, actions, (id) => void dictation.speech.use(id));
  tray.setVisible(showTrayIcon(ctx.config));
  ctx.sinks.add(() => tray.refresh());
  nativeTheme.on("updated", tray.refresh); // the taskbar theme changed
  return tray;
}
