import type { Transcripts } from "@speakkit/transcripts";
import type { Push, RecordingView } from "../../shared/transcripts/contract";

/**
 * What the window and the tray need to know right now: the recorder, a notice about a recording that ended by itself, a counter that moves with every
 * change, and whether a transcript is being made. Level updates arrive many times a second; the window gets about ten.
 */
export class Live {
  tick = 0;
  recording: RecordingView | null = null;
  notice: string | undefined;
  busy = false;
  facade: Transcripts | undefined;
  #lastSend = 0;
  readonly #push: (p: Push) => void;
  readonly #changed: () => void;

  constructor(push: (p: Push) => void, changed: () => void) {
    this.#push = push;
    this.#changed = changed;
  }

  snapshot(): Push {
    return { recording: this.recording, tick: this.tick, ...(this.notice && { notice: this.notice }) };
  }

  send(): void {
    this.#lastSend = Date.now();
    this.#push(this.snapshot());
    this.#changed();
  }

  /** The transcripts changed: refresh `busy` and tell the window. */
  changed(): void {
    this.tick++;
    this.busy = !!this.facade && this.facade.list().some((r) => r.status === "queued" || r.status === "transcribing");
    this.send();
  }

  /** The recorder's view changed. A level-only update is held back unless the last send was a tenth of a second ago. */
  setRecording(v: RecordingView | null): void {
    this.recording = v;
    if (!v || v.phase !== "recording" || Date.now() - this.#lastSend > 100) this.send();
  }
}
