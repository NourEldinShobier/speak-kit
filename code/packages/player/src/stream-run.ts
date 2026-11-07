import type { StreamJob } from "./stream";
import { runStream } from "./stream";

/** What a run needs from its owner; the run adds the abort signal, the staleness check and the replace flag. */
type RunJob = Omit<StreamJob, "signal" | "current" | "replace">;

/** The one stream request chain of a player: starting a run supersedes the previous one, and anything a superseded run reports is dropped. */
export class StreamRun {
  #gen = 0;
  #abort: AbortController | undefined;
  #done = false;
  #replaceNext = false;

  /** Every sentence from the start point was requested. */
  get done(): boolean {
    return this.#done;
  }

  /** Aborts the current run, if any, and requests `job.from` on; `onDone` fires when everything was requested, `onFail` for a failure of this run. */
  start(job: RunJob, onDone: () => void, onFail: (e: unknown) => void): void {
    const gen = ++this.#gen;
    const replace = this.#replaceNext;
    this.#replaceNext = false;
    this.#abort = new AbortController();
    this.#done = false;
    runStream({ ...job, signal: this.#abort.signal, current: () => gen === this.#gen, replace })
      .then((finished) => {
        if (!finished) return;
        this.#done = true;
        onDone();
      })
      .catch((e) => {
        if (gen !== this.#gen) return;
        this.#gen++;
        this.#abort?.abort();
        onFail(e);
      });
  }

  /** Aborts the network request; the next run tells the server it replaces this one while it was still streaming. */
  halt(): void {
    this.#gen++;
    this.#replaceNext = !!this.#abort && !this.#done;
    this.#abort?.abort();
    this.#abort = undefined;
    this.#done = false;
  }
}
