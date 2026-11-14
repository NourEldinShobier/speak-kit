import { createAutoSend, type AutoSend, type SendView, type Sender } from "./auto-send";
import type { CaptureInbox } from "../../voice-chat/capture-inbox";
import { lookOfCapture, type Picture } from "./look";
import type { CaptureRecord } from "../store";

export interface SendControllerDeps {
  inbox: CaptureInbox;
  /** The picture that stands for the capture, small enough for the voice chat; undefined when it cannot be read. */
  picture(record: CaptureRecord): Promise<Picture | undefined>;
  /** The capture was handed over: the list shows it. */
  markSent(id: string): void;
  /** The capture was taken back from the voice chat: the list no longer shows it as sent. */
  unmarkSent(id: string): void;
  show(view: SendView | undefined): void;
  failed(): void;
  schedule(fn: () => void, ms: number): () => void;
}

export const DESTINATION = "Voice chat";

/** Sends finished captures to the voice chat: the capture waits in the inbox until the voice chat reads it, and can be taken back until then. One send at a time. */
export class SendController {
  readonly #d: SendControllerDeps;
  #auto: AutoSend | undefined;

  constructor(deps: SendControllerDeps) {
    this.#d = deps;
  }

  #senderOf(record: CaptureRecord): Sender {
    const { inbox } = this.#d;
    return {
      destination: DESTINATION,
      send: async () => {
        const pic = await this.#d.picture(record);
        if (!pic) return false;
        inbox.offer(record.id, lookOfCapture(record, pic));
        this.#d.markSent(record.id);
        return true;
      },
      canUndo: () => inbox.waiting(record.id),
      undo: () => {
        const taken = inbox.retract(record.id);
        if (taken) this.#d.unmarkSent(record.id);
        return taken;
      },
      onChange: (cb) => inbox.onChange(cb),
    };
  }

  /** Starts the send of this capture; a send that was running for an earlier capture is left as it is. `seconds` is the countdown, 0 for at once. */
  begin(record: CaptureRecord, seconds: number): void {
    this.cancel();
    this.#auto = createAutoSend({ sender: this.#senderOf(record), schedule: this.#d.schedule, show: this.#d.show, failed: this.#d.failed });
    this.#auto.start(seconds);
  }

  hold(): void {
    this.#auto?.hold();
  }

  sendNow(): void {
    void this.#auto?.sendNow();
  }

  undo(): void {
    this.#auto?.undo();
  }

  /** A new capture began or the capsule was closed: a countdown that is still running stops. */
  cancel(): void {
    this.#auto?.dispose();
    this.#auto = undefined;
  }
}
