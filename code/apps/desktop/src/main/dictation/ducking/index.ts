import { createDucker, type DuckMode, type OutputKind } from "@speakkit/dictation";
import { createLineClient, osascript, spawnPowerShellLoop, type LineProcess } from "../caret-reader";
import { macAudio } from "./mac-audio";
import { WINDOWS_AUDIO_LOOP, windowsAudio, type AudioParts } from "./windows-audio";

export interface SystemDucker {
  /** Silences other audio for the recording that starts now, as the setting says. Never rejects. */
  begin(): Promise<void>;
  /** Puts it back. Safe to call without a `begin` and twice. */
  end(): Promise<void>;
  dispose(): void;
}

interface Options {
  mode(): DuckMode;
  /** False: other audio is lowered even when the sound goes to headphones. */
  speakersOnly(): boolean;
  platform?: NodeJS.Platform;
  /** Starts the Windows helper; replaced in tests. */
  start?: () => LineProcess;
  /** Runs one AppleScript; replaced in tests. */
  osa?: (script: string) => Promise<string>;
  now?: () => number;
}

/** How long a reading of the output device is trusted: a device change is noticed at the next recording after this. */
const OUTPUT_TTL_MS = 30_000;
const HELPER_TIMEOUT_MS = 2500;

/**
 * Other audio while dictating, on the real system: Core Audio through a kept-alive PowerShell on Windows, AppleScript on macOS. The helper is only started
 * by the first recording with the setting on, so Do nothing costs no process.
 */
export function createSystemDucker(o: Options): SystemDucker {
  const platform = o.platform ?? process.platform;
  const now = o.now ?? Date.now;
  let close = () => undefined as void;
  let parts: AudioParts | undefined;
  if (platform === "win32") {
    const client = createLineClient(o.start ?? (() => spawnPowerShellLoop(WINDOWS_AUDIO_LOOP)), HELPER_TIMEOUT_MS);
    close = client.close;
    parts = windowsAudio((command) => client.ask(command));
  } else if (platform === "darwin") {
    parts = macAudio(o.osa ?? ((script) => osascript(script, HELPER_TIMEOUT_MS)));
  }
  let seen: { kind: OutputKind; at: number } | undefined;
  const ducker = createDucker({
    media: parts?.media,
    volume: parts?.volume,
    mode: o.mode,
    async output() {
      if (!o.speakersOnly() || !parts) return "speakers";
      if (!seen || now() - seen.at > OUTPUT_TTL_MS) seen = { kind: await parts.output(), at: now() };
      return seen.kind;
    },
  });
  return {
    begin: () => (o.mode() === "nothing" || !parts ? Promise.resolve() : ducker.begin()),
    end: () => ducker.end(),
    dispose: () => close(),
  };
}
