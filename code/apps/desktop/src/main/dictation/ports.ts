import type { Clip, Inserter, Recorder } from "@speakkit/dictation";
import { friendlyAppName } from "./app-name";
import type { DictationOs, InsertResult } from "./index";

/** The `Inserter` port over the OS layer. `onResult` sees how each insert really ended (the OS layer can fall back to copying where the plan said paste). */
export function createInserterPort(os: DictationOs, onResult: (r: InsertResult) => void): Inserter {
  return {
    async target(opts) {
      const fg = os.foreground();
      const name = friendlyAppName(fg?.exe);
      const url = opts?.address ? await os.address?.read(fg) : undefined;
      return fg ? { id: fg.hwnd, exe: fg.exe ?? "", ...(name && { name }), ...(url && { url }), elevated: fg.elevated, passwordField: os.passwordFocused() } : undefined;
    },
    focus: (t) => os.focus(t.id),
    cancel: () => os.cancelTyping(),
    ...(os.caret && { caret: () => os.caret!.read() }),
    async insert({ text, plan }) {
      const result = await os.insert(text, { mode: plan.method === "paste" && plan.keep ? "keep" : plan.method });
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

  async stop(opts?: { cancelled?: boolean }): Promise<Clip> {
    const clip = this.#clip;
    this.#clip = undefined;
    return clip ?? this.#mic.stop(opts);
  }

  speaking(): boolean {
    return !this.#clip && !!this.#mic.speaking?.();
  }

  async discard(): Promise<void> {
    if (this.#clip) this.#clip = undefined;
    else await this.#mic.discard();
  }
}
