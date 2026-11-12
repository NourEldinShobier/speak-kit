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
}

/** What each button of the capsule does. */
export function capsuleHandlers(d: CapsuleActionDeps): Record<CapsuleAction, () => void> {
  const c = d.controller;
  const nothing = () => undefined;
  return {
    pen: () => {
      c.pen = !c.pen;
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
    switch: nothing,
  };
}
