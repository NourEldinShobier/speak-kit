import type { BrowserWindow } from "electron";
import type { SttLanguage } from "@speakkit/engine";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import { registerCaptureIpc } from "./ipc";
import { createElectronCapturePlatform } from "./platform/electron";
import type { Narrator } from "./recording";
import type { CaptureInbox } from "../voice-chat/capture-inbox";
import { CaptureService } from "./service";
import { fakeRecorder } from "./fake";

export { CaptureService } from "./service";

export interface CaptureSetup {
  dataDir: string;
  distDir: string;
  parent(): BrowserWindow | null;
  dictation: DictationService;
  inbox: CaptureInbox;
  /** SPEAKKIT_TEST: a recorder that makes pictures up replaces the real one, so a spec can run a whole capture without a screen. */
  test: boolean;
}

/** The narration of a capture uses the speech model dictation already loads: nothing new is downloaded or kept in memory. */
const narratorOf = (d: DictationService, language: () => string): Narrator => ({
  ready: () => d.stt.status().state === "ready",
  transcribe: async (pcm) => (await d.stt.transcribe(pcm, language() as SttLanguage)).text,
});

async function hotkeySource() {
  if (process.platform === "darwin") return (await (await import("../dictation/macos")).createMacPlatform()).hotkey;
  return (await (await import("../dictation/windows")).createWindowsPlatform()).hotkey;
}

/** Capture in the desktop app: the service and its IPC. The pages of the app window reach it through window.speakkitCapture. */
export function setupCapture(ctx: Ctx, o: CaptureSetup): CaptureService {
  const platform = createElectronCapturePlatform();
  const service = new CaptureService(ctx, {
    dataDir: o.dataDir,
    distDir: o.distDir,
    parent: o.parent,
    platform,
    hotkeySource: platform.supported && !o.test ? hotkeySource : undefined,
    inbox: o.inbox,
    narrator: narratorOf(o.dictation, () => ctx.config.dictation.language),
    dictationHotkey: () => (ctx.config.dictation.enabled ? ctx.config.dictation.hotkey : undefined),
    recorder: o.test ? fakeRecorder() : undefined,
    test: o.test,
  });
  registerCaptureIpc(service, (c) => o.parent()?.webContents === c);
  return service;
}
