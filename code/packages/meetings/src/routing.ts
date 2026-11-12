/** One place sound can go: a headset, speakers, a virtual mixer. */
export interface Output {
  id: string;
  name: string;
  isDefault: boolean;
  /** A virtual device that mixes sources (a mixer, a cable). */
  virtual: boolean;
  /** The call app has an audio session on this output right now. */
  callAppPlaying: boolean;
  /** The person's own microphone is fed into this output (a virtual mixer that would put their voice on the call track). */
  carriesMic: boolean;
}

/**
 * The outputs the person can choose, best first: outputs where the call app is playing, then the default output, then the rest.
 * A virtual mixer that carries the person's microphone is never offered, because it would put their own voice on the other side's track.
 */
export function rankOutputs(outputs: readonly Output[]): Output[] {
  const usable = outputs.filter((o) => !(o.virtual && o.carriesMic));
  const tier = (o: Output) => (o.callAppPlaying ? 0 : o.isDefault ? 1 : 2);
  return usable
    .map((o, i) => ({ o, i }))
    .sort((a, b) => tier(a.o) - tier(b.o) || a.i - b.i)
    .map((x) => x.o);
}

export type OutputChoice = { output: Output; why: "call-app" | "default" | "chosen" } | { output: undefined; why: "none" };

/** The output to record: the one the person chose while it exists, otherwise where the call app plays, otherwise the default output. */
export function chooseOutput(setting: string, outputs: readonly Output[]): OutputChoice {
  const ranked = rankOutputs(outputs);
  const chosen = setting !== "automatic" ? ranked.find((o) => o.id === setting) : undefined;
  if (chosen) return { output: chosen, why: "chosen" };
  const first = ranked[0];
  if (!first) return { output: undefined, why: "none" };
  return { output: first, why: first.callAppPlaying ? "call-app" : "default" };
}

export const ROUTE_CHECK_MS = 2_000;

/** Watches the route during a recording: asked every `ROUTE_CHECK_MS`, it says so only when the output to record changed (the call moved to another headset). */
export class RouteWatcher {
  readonly #setting: () => string;
  #current: string | undefined;

  constructor(setting: () => string) {
    this.#setting = setting;
  }

  get current(): string | undefined {
    return this.#current;
  }

  /** The new choice when it differs from the last one (the first call always reports). */
  check(outputs: readonly Output[]): OutputChoice | undefined {
    const c = chooseOutput(this.#setting(), outputs);
    const id = c.output?.id;
    if (this.#current !== undefined && id === this.#current) return undefined;
    if (this.#current === undefined && id === undefined) return undefined;
    this.#current = id;
    return c;
  }
}

/** Where the person's voice comes from: the microphone dictation uses, a chosen one, or the one the call app has open. */
export type MicSetting = "dictation" | "call-app" | (string & {});

export interface MicInputs {
  /** The microphone chosen for dictation (empty is the OS default). */
  dictationDevice: string;
  /** The microphone the call app uses, when the OS can say (null when it cannot name one). */
  callAppDevice(): Promise<string | null>;
}

export type MicChoice = { device: string; why: "saved" | "call-app" | "fallback"; retryInMs?: number };

export const MIC_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

/**
 * Chooses the microphone. "Same as dictation" and a named device are used as saved. "Follows the call app" asks the OS which microphone the call app has
 * open; when it cannot say, the saved (dictation) microphone is used and the question is asked again after a growing wait, never faster than the last, never slower than 30 s.
 */
export class MicPicker {
  readonly #in: MicInputs;
  #fails = 0;

  constructor(inputs: MicInputs) {
    this.#in = inputs;
  }

  async choose(setting: MicSetting): Promise<MicChoice> {
    if (setting === "dictation") return { device: this.#in.dictationDevice, why: "saved" };
    if (setting !== "call-app") return { device: setting, why: "saved" };
    let found: string | null = null;
    try {
      found = await this.#in.callAppDevice();
    } catch {
      found = null;
    }
    if (found) {
      this.#fails = 0;
      return { device: found, why: "call-app" };
    }
    const retryInMs = MIC_BACKOFF_MS[Math.min(this.#fails, MIC_BACKOFF_MS.length - 1)]!;
    this.#fails++;
    return { device: this.#in.dictationDevice, why: "fallback", retryInMs };
  }
}
