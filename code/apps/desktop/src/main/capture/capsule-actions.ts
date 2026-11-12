import type { CapsuleAction, CopyWhat } from "../../shared/capture/contract";
import type { CaptureController } from "./controller";

export interface CapsuleActionDeps {
  controller: CaptureController;
  stop(): void;
  discard(): void;
  open(): void;
  retry(): void;
  copyLast(what: CopyWhat): void;
  /** The send of the capture to the voice chat that is running, if any. */
  send: { hold(): void; sendNow(): void; undo(): void };
  /** Sends the capture that was just saved, at once. */
  sendLast(): void;
  /** Picks another target and moves the recording to it. */
  switchTarget(): void;
  /** Notes that the pen was switched on or off. */
  note(kind: "pen-on" | "pen-off"): void;
  /** The replay buffer: save the last 15 seconds, or turn it off. */
  replay: { save(): void; off(): void };
}

/** What each button of the capsule does. */
export function capsuleHandlers(d: CapsuleActionDeps): Record<CapsuleAction, () => void> {
  const c = d.controller;
  return {
    pen: () => {
      c.pen = !c.pen;
      d.note(c.pen ? "pen-on" : "pen-off");
      if (c.pen) c.showInk();
      else c.hideInk();
    },
    stop: d.stop,
    discard: () => (c.confirmDiscard = true),
    "discard-keep": () => (c.confirmDiscard = false),
    "discard-confirm": d.discard,
    open: d.open,
    retry: d.retry,
    dismiss: () => c.after(undefined),
    "copy-again": () => d.copyLast("picture"),
    "copy-path": () => d.copyLast("path"),
    send: d.sendLast,
    hold: () => d.send.hold(),
    undo: () => d.send.undo(),
    "send-now": () => d.send.sendNow(),
    switch: d.switchTarget,
    "replay-save": d.replay.save,
    "replay-off": d.replay.off,
  };
}
