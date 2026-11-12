import type { IpcRenderer } from "electron";
import type { CapsuleState } from "./capsule";
import { CAPSULE_ACTION, CAPSULE_EVENT, CAPTURE_METHODS, CAPTURE_STATUS_EVENT, captureChannel, OVERLAY_EVENT, OVERLAY_RESULT, REC_COMMAND, REC_DATA, REC_READY, REC_REPLY } from "./channels";
import type { CapsuleAction, CaptureBridge, OverlayResult, OverlayView, RecorderCommand, RecorderData, RecorderResult } from "./contract";

/** What the capsule, picker and recorder pages (each its own window) get on top of the app pages' bridge. */
export interface CaptureWindowsBridge {
  capsule: { onState(cb: (s: CapsuleState | null) => void): () => void; action(a: CapsuleAction): void };
  overlay: { onShow(cb: (v: OverlayView) => void): () => void; result(r: OverlayResult): void };
  recorder: { onCommand(cb: (c: RecorderCommand) => void): () => void; reply(id: number, r: RecorderResult): void; data(d: RecorderData): void; ready(): void };
}

const on = <T>(ipc: IpcRenderer, channel: string, cb: (v: T) => void) => {
  const h = (_: unknown, v: T) => cb(v);
  ipc.on(channel, h);
  return () => void ipc.off(channel, h);
};

export function captureBridge(ipc: IpcRenderer): CaptureBridge & CaptureWindowsBridge {
  const methods = Object.fromEntries(CAPTURE_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(captureChannel(m), ...args)]));
  return {
    ...methods,
    onStatus: (cb) => on(ipc, CAPTURE_STATUS_EVENT, cb),
    capsule: { onState: (cb) => on(ipc, CAPSULE_EVENT, cb), action: (a) => ipc.send(CAPSULE_ACTION, a) },
    overlay: { onShow: (cb) => on(ipc, OVERLAY_EVENT, cb), result: (r) => ipc.send(OVERLAY_RESULT, r) },
    recorder: {
      onCommand: (cb) => on(ipc, REC_COMMAND, cb),
      reply: (id, r) => ipc.send(REC_REPLY, id, r),
      data: (d) => ipc.send(REC_DATA, d),
      ready: () => ipc.send(REC_READY),
    },
  } as CaptureBridge & CaptureWindowsBridge;
}
