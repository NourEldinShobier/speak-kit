import { monitorEventLoopDelay } from "node:perf_hooks";
import { scriptedSettingsFile } from "./settings-deps";
import type { ShownToast } from "./desktop-toasts";
import type { setupShortcuts } from "./desktop-shortcuts";
import type { setupTray } from "./desktop-tray";
import type { createReading } from "./reader/service";
import { dictationTestHook } from "./dictation/test-hook";
import type { DictationService } from "./dictation/service";
import type { CaptureService } from "./capture";
import { captureTestHook } from "./capture/test-hook";
import type { TranscriptsFeature } from "./transcripts";
import type { MeetingsFeature } from "./meetings";

interface HookParts {
  shortcuts: ReturnType<typeof setupShortcuts>;
  shownToasts: ShownToast[];
  tray: ReturnType<typeof setupTray>;
  reading: ReturnType<typeof createReading>;
  dictation: DictationService;
  capture: CaptureService;
  transcripts: TranscriptsFeature;
  meetings(): MeetingsFeature | undefined;
  installs(): number;
}

/** SPEAKKIT_TEST hooks: simulate what Playwright cannot do (global key presses, native menus, toasts). */
export const desktopTestHook = ({ shortcuts, shownToasts, tray, reading, dictation, capture, transcripts, meetings, installs }: HookParts) => {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  return {
    ...shortcuts.testHook,
    toasts: () => shownToasts.map(({ title, body, silent }) => ({ title, body, silent })),
    /** The file the settings import dialog returns; null cancels. */
    settingsFile: (f: string | null) => void (scriptedSettingsFile.open = f),
    /** The answer to "also turn on settings that reach beyond the app?" during an import. */
    settingsConfirm: (on: boolean) => void (scriptedSettingsFile.confirm = on),
    clickToast: (i: number) => shownToasts[i]?.onClick?.(),
    installs,
    trayItems: () => tray.items().map((i) => ({ label: i.label, enabled: i.enabled, type: i.type, checked: i.checked })),
    clickTray: (label: string) => {
      const item = tray.items().find((i) => i.label === label);
      if (!item || !item.enabled) throw new Error(`no enabled tray item ${label}`);
      item.click();
    },
    trayState: () => tray.summary(),
    readText: (text: string) => reading.readText(text, "text"),
    dictation: dictationTestHook(dictation),
    capture: captureTestHook(capture),
    transcripts: { ...transcripts.testHook, phase: () => transcripts.phase() },
    meetings: {
      denyMic: (on: boolean) => meetings()?.testHook.denyMic(on),
      /** Replaces what the system says about calls (who uses the microphone, which windows exist). */
      probe: (p: { micUsers: { pid: number; exe: string }[]; windows: { pid: number; exe: string; title: string }[] } | null) =>
        meetings()?.testHook.platform(
          p && {
            capabilities: () => ({ platform: "win32", systemAudio: "available", callDetection: "available", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" }),
            probe: async () => p,
            callAppMic: async () => null,
          },
        ),
      poll: () => meetings()?.pollNow(),
      tick: () => meetings()?.tickNow(),
      capsule: () => meetings()?.capsuleView() ?? null,
      act: (a: Parameters<MeetingsFeature["act"]>[0]) => meetings()?.act(a),
      phase: () => meetings()?.phase(),
    },
    /** Main-process event-loop delay since the app started, in ms (nanoseconds from the histogram). */
    loopDelay: () => ({ p50Ms: loop.percentile(50) / 1e6, p99Ms: loop.percentile(99) / 1e6, maxMs: loop.max / 1e6 }),
  };
};
