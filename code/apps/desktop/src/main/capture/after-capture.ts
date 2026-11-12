import { noticeFor, type Notice } from "../../shared/capture/notices";
import { autoSendSeconds, type CaptureConfig } from "../../shared/capture/settings";
import type { CopyWhat } from "../../shared/capture/contract";
import type { Ctx } from "../context";
import type { CaptureInbox } from "../voice-chat/capture-inbox";
import type { CaptureController } from "./controller";
import type { History } from "./history";
import { SendController } from "./send/controller";
import { pictureReader } from "./send/picture";
import type { CaptureRecord } from "./store";

export interface AfterCaptureDeps {
  controller: CaptureController;
  history: History;
  inbox: CaptureInbox;
  ctx: Pick<Ctx, "showWindow" | "sendUi">;
  settings(): CaptureConfig;
  notify(n: Notice): void;
  /** The list of captures changed. */
  refresh(): void;
}

/** What follows a finished capture: the last one, what the capsule offers on it (copy, open, send to the voice chat) and the send itself. */
export class AfterCapture {
  readonly #d: AfterCaptureDeps;
  readonly send: SendController;
  last: CaptureRecord | undefined;

  constructor(deps: AfterCaptureDeps) {
    this.#d = deps;
    this.send = new SendController({
      inbox: deps.inbox,
      picture: pictureReader(() => deps.history.bundle),
      markSent: (id) => void deps.history.markSent(id),
      show: (v) => v && deps.controller.after(v, v.kind === "countdown" ? 0 : 15_000),
      failed: () => deps.notify(noticeFor("send-failed")),
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    });
  }

  /** A recording was saved: it goes to the voice chat after the countdown when that is on, else the capsule says it was copied. */
  saved(record: CaptureRecord) {
    this.last = record;
    const wait = autoSendSeconds(this.#d.settings().autoSend);
    if (wait > 0) this.send.begin(record, wait);
    else this.#d.controller.after({ kind: "saved", what: record.words?.length ? "Copied picture and text" : "Copied picture" });
    this.#d.refresh();
  }

  /** A screenshot was taken: the corner card shows it. */
  shot(record: CaptureRecord) {
    this.last = record;
    this.#d.controller.after({ kind: "shot", what: "Copied picture" }, 6000);
    this.#d.refresh();
  }

  sendLast() {
    if (this.last) this.send.begin(this.last, 0);
  }

  /** Try again after a failed hand-over sends the same capture again. False when the failure was another one. */
  retrySend(failed: Notice | undefined): boolean {
    if (failed?.code !== "send-failed" || !this.last) return false;
    this.send.begin(this.last, 0);
    return true;
  }

  async copyLast(what: CopyWhat) {
    if (this.last) await this.#d.history.copy(this.last.id, what);
  }

  open() {
    this.#d.ctx.showWindow();
    this.#d.ctx.sendUi({ type: "nav", page: "capture" });
    this.#d.controller.after(undefined);
  }
}
