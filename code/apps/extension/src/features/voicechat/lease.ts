import { VOICE_MIC_BEAT_MS } from "@speakkit/protocol";
import { ignore } from "../../shared/ignore";
import { call, type LocalDeps } from "./mint";

/**
 * Tells the app while a conversation holds the microphone, so the dictation key does not open it a second time. A report every few seconds keeps the
 * claim alive; if this page dies without saying so the app lets the claim lapse. Reports are best effort: a failed one is never a problem for the conversation.
 */
export class MicLease {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly d: () => LocalDeps;
  constructor(d: () => LocalDeps) {
    this.d = d;
  }

  start(): void {
    if (this.timer) return;
    this.report(true);
    this.timer = setInterval(() => this.report(true), VOICE_MIC_BEAT_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.report(false);
  }

  private report(held: boolean): void {
    void call(this.d(), "/v1/voice-chat/mic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ held }) }).catch(ignore);
  }
}
