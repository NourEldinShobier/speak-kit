import { app, clipboard, dialog, globalShortcut, ipcMain, screen, shell, type BrowserWindow } from "electron";
import { execFile } from "node:child_process";
import type { Device } from "../../shared/meetings/contract";
import { meetingsChannel, MEETINGS_EVENT, MEETINGS_METHODS, type MeetingsMethod } from "../../shared/meetings/channels";
import { MEETINGS_ARGS } from "../../shared/meetings/contract";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import { registerValidatedIpc } from "../ipc-register";
import { createCapsuleWindow, createRecorderHost, displaysNow } from "./hosts";
import { macosPlatform, loadCoreAudio } from "./platform/macos";
import type { Exec, MeetingsPlatform } from "./platform/types";
import { windowsPlatform } from "./platform/windows";
import { createMeetingsService, type MeetingsService } from "./service";
import type { VoiceChat } from "../voice-chat/service";
import { NOTES_MODEL } from "../voice-chat/service";

export interface MeetingsOptions {
  distDir: string;
  parent(): BrowserWindow | null;
  /** The speech engine and model are dictation's: meetings borrow them. */
  dictation: DictationService;
  /** The OpenAI key lives with the voice chat; notes borrow it. */
  voiceChat: Pick<VoiceChat, "complete" | "status">;
  /** The test hook is on: the microphone can be refused and the system is not looked at. */
  test: boolean;
  /** Called when the recording or a job changes state (the tray follows). */
  onChange(): void;
}

export interface MeetingsFeature extends MeetingsService {
  /** Tests only: a platform answer that replaces the real probe, and whether the microphone is refused. */
  testHook: { denyMic(on: boolean): void; platform(p: MeetingsPlatform | null): void; shortcuts(): string[] };
}

const run: Exec = (file, args, timeoutMs = 5000) =>
  new Promise((resolve, reject) => execFile(file, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout))));

function realPlatform(): MeetingsPlatform {
  if (process.platform === "win32") return windowsPlatform(run);
  if (process.platform === "darwin") return macosPlatform({ exec: run, audio: async () => loadCoreAudio((await import("koffi")).default) });
  return {
    capabilities: () => ({ platform: "other", systemAudio: "unavailable", callDetection: "unavailable", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" }),
    probe: async () => ({ micUsers: [], windows: [] }),
    callAppMic: async () => null,
  };
}

const NONE: MeetingsPlatform = {
  capabilities: () => ({ platform: "other", systemAudio: "unavailable", callDetection: "unavailable", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" }),
  probe: async () => ({ micUsers: [], windows: [] }),
  callAppMic: async () => null,
};

/** Meetings in the desktop app: the store, the hidden recording page, the capsule window, the call watch, and the IPC the History and Settings pages call. */
export function setupMeetings(ctx: Ctx, o: MeetingsOptions): MeetingsFeature {
  let micDenied = false;
  let override: MeetingsPlatform | null = null;
  const real = o.test ? NONE : realPlatform();
  // The platform can be swapped by a test; the service always asks the current one.
  const platform: MeetingsPlatform = { capabilities: () => (override ?? real).capabilities(), probe: () => (override ?? real).probe(), callAppMic: (a) => (override ?? real).callAppMic(a) };
  const recorder = createRecorderHost({ ipcMain, distDir: o.distDir, micAllowed: () => !micDenied });
  let service: MeetingsService | undefined;
  const open = createCapsuleWindow({
    ipcMain,
    distDir: o.distDir,
    events: {
      action: (a) => void service?.act(a),
      interactive: (on) => service?.capsule.interactive(on),
      drag: (dx, dy, end) => service?.capsule.drag(dx, dy, end),
    },
  });
  service = createMeetingsService(ctx, {
    dataDir: app.getPath("userData"),
    documentsDir: app.getPath("documents"),
    stt: o.dictation.stt,
    model: () => ctx.config.dictation.model,
    dictationBusy: () => o.dictation.state.status !== "idle" && o.dictation.state.status !== "error",
    platform,
    recorder,
    capsule: { open, displays: displaysNow, cursor: () => screen.getCursorScreenPoint() },
    complete: async (system, user, signal) => o.voiceChat.complete(system, user, signal),
    keySaved: async () => (await o.voiceChat.status()).hasKey,
    writerName: `OpenAI ${NOTES_MODEL}`,
    vocabulary: () => ctx.config.dictation.replacements.map((r) => ({ from: r.from, to: r.to })),
    clipboard: { writeText: (t) => clipboard.writeText(t) },
    shell: { reveal: (f) => shell.showItemInFolder(f), openFolder: async (d) => void (await shell.openPath(d)) },
    dialog: {
      pickFolder: async () => {
        const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
        return r.canceled ? null : (r.filePaths[0] ?? null);
      },
    },
    shortcut: { register: (a, f) => (o.test ? true : globalShortcut.register(a, f)), unregister: (a) => !o.test && globalShortcut.unregister(a) },
    devices: async (): Promise<{ inputs: Device[]; outputs: Device[] }> => {
      const r = await recorder.devices();
      return r.ok && r.devices ? r.devices : { inputs: [], outputs: [] };
    },
    push: (p) => {
      const c = o.parent()?.webContents;
      if (c && !c.isDestroyed()) c.send(MEETINGS_EVENT, p);
    },
    changed: o.onChange,
    openSettings: () => {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "settings", sub: "meetings" });
    },
    openMeeting: (id) => {
      ctx.showWindow();
      ctx.sendUi({ type: "open-meeting", id });
    },
  });
  const svc = service;
  registerValidatedIpc<MeetingsMethod>(ipcMain, {
    methods: MEETINGS_METHODS,
    channel: meetingsChannel,
    args: MEETINGS_ARGS,
    handler: (m) => (svc.handlers as unknown as Record<string, unknown>)[m] as (...a: unknown[]) => unknown,
    trusted: (e) => o.parent()?.webContents === e.sender,
  });
  const onDisplays = () => svc.capsule.displaysChanged();
  screen.on("display-added", onDisplays);
  screen.on("display-removed", onDisplays);
  screen.on("display-metrics-changed", onDisplays);
  return {
    ...svc,
    async dispose() {
      screen.off("display-added", onDisplays);
      screen.off("display-removed", onDisplays);
      screen.off("display-metrics-changed", onDisplays);
      await svc.dispose();
    },
    testHook: { denyMic: (on) => void (micDenied = on), platform: (p) => void (override = p), shortcuts: () => [] },
  };
}
