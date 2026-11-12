import { classifyOutput, type MediaSession, type OutputKind, type SystemVolume } from "@speakkit/dictation";
import type { AudioParts } from "./windows-audio";

const PLAYERS = ["Spotify", "Music"] as const;
const STEP_MS = 40;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const playingScript = `set r to "none"
${PLAYERS.map(
  (p) => `if application "${p}" is running then
  tell application "${p}" to if player state is playing then set r to "${p}"
end if`,
).join("\n")}
return r`;

/** The name and the connection of the default output in `system_profiler SPAudioDataType -json`, as one label for `classifyOutput`; undefined when no output is marked as default. */
export function parseMacOutput(json: string): string | undefined {
  try {
    const root = JSON.parse(json) as { SPAudioDataType?: { _items?: Record<string, unknown>[] }[] };
    for (const group of root.SPAudioDataType ?? [])
      for (const item of group._items ?? [])
        if (item["coreaudio_default_audio_output_device"] === "spaudio_yes") {
          const transport = String(item["coreaudio_device_transport"] ?? "").replace(/^coreaudio_device_type_/, "");
          return `${String(item["_name"] ?? "")} ${transport}`.trim();
        }
  } catch {
    // an unreadable report is an unknown output
  }
  return undefined;
}

/** The macOS side of ducking over AppleScript: the system volume, and Spotify and Music for pause (other players are left alone). */
export function macAudio(run: (script: string) => Promise<string>, sleep: (ms: number) => Promise<void> = wait): AudioParts {
  const settings = async (what: "output volume" | "output muted") => (await run(`${what} of (get volume settings)`)).trim();
  const level = async (): Promise<number> => {
    const n = Number(await settings("output volume"));
    if (!Number.isFinite(n)) throw new Error("the system volume cannot be read");
    return n / 100;
  };
  const volume: SystemVolume = {
    get: level,
    async ramp(to, ms) {
      const from = await level();
      const steps = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 1; i <= steps; i++) {
        await run(`set volume output volume ${Math.round((from + ((to - from) * i) / steps) * 100)}`);
        if (i < steps) await sleep(ms / steps);
      }
    },
    muted: async () => (await settings("output muted")) === "true",
    setMuted: async (on) => void (await run(`set volume output muted ${on}`)),
  };
  let paused: string | undefined;
  const media: MediaSession = {
    async playing() {
      const who = (await run(playingScript)).trim();
      paused = (PLAYERS as readonly string[]).includes(who) ? who : undefined;
      return paused !== undefined;
    },
    async pause() {
      if (paused) await run(`tell application "${paused}" to pause`);
    },
    async play() {
      if (paused) await run(`tell application "${paused}" to play`);
    },
  };
  return {
    media,
    volume,
    output: async (): Promise<OutputKind> => classifyOutput(parseMacOutput(await run(`do shell script "system_profiler SPAudioDataType -json"`))),
  };
}
