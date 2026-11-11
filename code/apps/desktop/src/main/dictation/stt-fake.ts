import { EngineNotReadyError, type SttLanguage, type Transcript } from "@speakkit/engine";
import type { Stt, SttStatus } from "./stt";

interface Script {
  text: string;
  fail: boolean;
}

const ALL = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"];

/**
 * A scripted speech engine for the end-to-end run (SPEAKKIT_TEST): the same states and failures as the real one, with the text and the failures
 * chosen by the test. Models are "installed" until the test says otherwise; a model that is not installed downloads until the test finishes it.
 */
export class FakeStt implements Stt {
  #state = "unloaded";
  #loaded = "";
  #progress: number | undefined;
  readonly #have = new Set<string>(ALL);
  readonly #listeners = new Set<(s: SttStatus) => void>();
  readonly #script: Script = { text: "hello from the fake speech engine", fail: false };
  readonly #calls: { language: string; samples: number; peak: number }[] = [];
  #release: (() => void) | undefined;
  #abort: ((e: Error) => void) | undefined;

  #set(state: string, progress?: number): void {
    this.#state = state;
    this.#progress = progress;
    for (const l of this.#listeners) l(this.status());
  }

  status(): SttStatus {
    return { state: this.#state, ...(this.#progress !== undefined && { progress: this.#progress }) };
  }

  onStatus(cb: (s: SttStatus) => void): () => void {
    this.#listeners.add(cb);
    return () => void this.#listeners.delete(cb);
  }

  async downloaded(id: string): Promise<boolean> {
    return this.#have.has(id);
  }

  async load(id: string, onProgress?: (fraction: number) => void): Promise<void> {
    if (this.#state === "ready" && this.#loaded === id) return;
    if (this.#state === "ready") await this.unload();
    if (!this.#have.has(id)) {
      this.#set("downloading", 0);
      onProgress?.(0.4);
      await new Promise<void>((resolve, reject) => {
        this.#release = resolve;
        this.#abort = reject;
      }).catch((e) => {
        this.#set("unloaded");
        throw e;
      });
      this.#have.add(id);
      onProgress?.(1);
    }
    this.#set("loading");
    this.#loaded = id;
    this.#set("ready");
  }

  async warm(id: string): Promise<void> {
    await this.load(id).then(
      () => undefined,
      () => undefined,
    );
  }

  async transcribe(pcm: Int16Array, language: SttLanguage): Promise<Transcript> {
    if (this.#state !== "ready") throw new EngineNotReadyError(this.#state as never);
    this.#calls.push({ language, samples: pcm.length, peak: pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0) });
    if (this.#script.fail) throw new Error("scripted failure");
    return { text: this.#script.text, speech: this.#script.text !== "" };
  }

  async unload(): Promise<void> {
    this.#abort?.(new Error("unloaded"));
    this.#abort = this.#release = undefined;
    this.#loaded = "";
    this.#set("unloaded");
  }

  // ---- what the test controls ----

  say(s: Partial<Script>): void {
    Object.assign(this.#script, s);
  }

  async setInstalled(id: string, on: boolean): Promise<void> {
    if (on) this.#have.add(id);
    else {
      this.#have.delete(id);
      if (this.#loaded === id || this.#state === "downloading") await this.unload();
    }
  }

  finishDownload(): void {
    this.#release?.();
  }

  calls(): { language: string; samples: number; peak: number }[] {
    return [...this.#calls];
  }
}

export const fakeStt = (): FakeStt => new FakeStt();
