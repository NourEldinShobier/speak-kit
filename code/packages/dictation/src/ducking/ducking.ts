export type DuckMode = "nothing" | "mute" | "lower" | "pause";
export type OutputKind = "speakers" | "headphones" | "unknown";

const HEADPHONES = /headphone|headset|earphone|earbuds|airpods|buds|bluetooth|hands-free/i;
const SPEAKERS = /speaker|monitor|display|hdmi|built-in|internal/i;

/** Guesses the output from its name. Unknown counts as speakers, because a microphone next to a loudspeaker is the case that needs ducking. */
export function classifyOutput(label: string | undefined): OutputKind {
  if (!label) return "unknown";
  if (HEADPHONES.test(label)) return "headphones";
  return SPEAKERS.test(label) ? "speakers" : "unknown";
}

/** Headphones leave other audio alone: the microphone cannot hear them. */
export const shouldDuck = (mode: DuckMode, output: OutputKind): boolean => mode !== "nothing" && output !== "headphones";

export const LOWER_LEVEL = 0.2;
export const RAMP_DOWN_MS = 120;
export const RAMP_UP_MS = 1000;

export interface MediaSession {
  /** True when the system media session reports something playing. */
  playing(): Promise<boolean>;
  pause(): Promise<void>;
  play(): Promise<void>;
}

export interface SystemVolume {
  /** 0 to 1. */
  get(): Promise<number>;
  /** Moves the volume to `to` over `ms`. */
  ramp(to: number, ms: number): Promise<void>;
  muted(): Promise<boolean>;
  setMuted(on: boolean): Promise<void>;
}

export interface DuckerDeps {
  /** Undefined where the platform has no media session: "pause" then does nothing. */
  media: MediaSession | undefined;
  /** Undefined where the platform has no volume control: "lower" and "mute" then do nothing. */
  volume: SystemVolume | undefined;
  mode(): DuckMode;
  output(): Promise<OutputKind>;
}

/**
 * Silences other audio for the length of one recording and puts it back. It only undoes what it did: playback resumes only when it was playing and this
 * paused it, the volume returns to what it was, a mute is undone only when it was not already muted. Every step may fail; a failure never stops the
 * recording, and `end` is safe to call twice.
 */
export function createDucker(deps: DuckerDeps): { begin(): Promise<void>; end(): Promise<void> } {
  let undo: (() => Promise<void>) | undefined;
  const apply = async (mode: DuckMode): Promise<void> => {
    const { media, volume } = deps;
    if (mode === "pause" && media) {
      if (!(await media.playing())) return;
      await media.pause();
      undo = () => media.play();
    } else if (mode === "lower" && volume) {
      const before = await volume.get();
      await volume.ramp(Math.min(before, LOWER_LEVEL), RAMP_DOWN_MS);
      undo = () => volume.ramp(before, RAMP_UP_MS);
    } else if (mode === "mute" && volume) {
      if (await volume.muted()) return;
      await volume.setMuted(true);
      undo = () => volume.setMuted(false);
    }
  };
  return {
    async begin() {
      if (undo) return;
      const mode = deps.mode();
      let output: OutputKind = "unknown";
      try {
        output = await deps.output();
      } catch {
        // Unknown output counts as speakers.
      }
      if (!shouldDuck(mode, output)) return;
      try {
        await apply(mode);
      } catch {
        // The system refused: recording goes on, other audio stays as it is.
      }
    },
    async end() {
      const fn = undo;
      undo = undefined;
      try {
        await fn?.();
      } catch {
        // Nothing more can be done for audio the system will not give back.
      }
    },
  };
}
