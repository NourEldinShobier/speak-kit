import type { AudioOutput } from "./output";
import type { Scheduler } from "./scheduler";

/** Read-only view of the audio side of a player, for the e2e hook in the offscreen document. */
export class PlayerProbe {
  constructor(
    private output: AudioOutput,
    private sched: Scheduler,
  ) {}

  get framesReceived() {
    return this.sched.framesReceived;
  }
  get scheduledMs() {
    return this.sched.scheduledMs;
  }
  /** playbackRate of the most recently scheduled buffer */
  get lastRate() {
    return this.sched.lastRate;
  }
  /** Longest wait (ms) between sentences beyond the paragraph pause: 0 means gapless. */
  get maxLateMs() {
    return this.sched.maxLateMs;
  }
  audioClock() {
    return this.output.clock();
  }
  rms() {
    return this.output.rms();
  }
  waveform() {
    return Array.from(this.output.waveform());
  }
  /** Bytes of decoded audio still held by scheduled sentences. */
  retainedBytes() {
    return this.sched.retainedBytes();
  }
}
