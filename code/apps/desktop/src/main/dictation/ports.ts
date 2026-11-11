import type { Clip, Inserter, Recorder } from "@speakkit/dictation";
import type { DictationOs, InsertResult } from "./index";

/** The `Inserter` port over the OS layer. `onResult` sees how each insert really ended (the OS layer can fall back to copying where the plan said paste). */
export function createInserterPort(os: DictationOs, onResult: (r: InsertResult) => void): Inserter {
  return {
    async target() {
      const fg = os.foreground();
      return fg ? { id: fg.hwnd, exe: fg.exe ?? "", elevated: fg.elevated, passwordField: os.passwordFocused() } : undefined;
    },
    async insert({ text, plan }) {
      const result = await os.insert(text, { mode: plan.method });
      onResult(result);
      if (result.status === "failed") return { ok: false, code: "failed" };
      return result.status === "refused" ? { ok: false, code: "rejected" } : { ok: true };
    },
  };
}

/**
 * The recorder port with one trick: `replay(clip)` makes the next recording the given audio instead of the microphone. That is how "Try again"
 * runs a failed recording through the whole pipeline (rules, paste, history) without a second code path.
 */
export class ReplayRecorder implements Recorder {
  readonly #mic: Recorder;
  #clip: Clip | undefined;

  constructor(mic: Recorder) {
    this.#mic = mic;
  }

  replay(clip: Clip): void {
    this.#clip = clip;
  }

  async start(req: { prerollMs: number }) {
    return this.#clip ? ({ ok: true } as const) : this.#mic.start(req);
  }

  async stop(): Promise<Clip> {
    const clip = this.#clip;
    this.#clip = undefined;
    return clip ?? this.#mic.stop();
  }

  async discard(): Promise<void> {
    if (this.#clip) this.#clip = undefined;
    else await this.#mic.discard();
  }
}
