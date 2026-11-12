import type { CapsuleAction, CopyWhat } from "../../shared/capture/contract";
import type { CaptureController } from "./controller";

export interface CapsuleActionDeps {
  controller: CaptureController;
  stop(): void;
  discard(): void;
  open(): void;
  retry(): void;
  copyLast(what: CopyWhat): void;
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
    // Sending to the voice chat is not part of capture yet.
    send: nothing,
    hold: nothing,
    undo: nothing,
    "send-now": nothing,
    switch: nothing,
  };
}
