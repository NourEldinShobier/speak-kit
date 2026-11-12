import type { IpcRenderer } from "electron";
import {
  CAPSULE_ACTION,
  CAPSULE_DRAG,
  CAPSULE_INTERACTIVE,
  CAPSULE_READY,
  CAPSULE_STATE,
  MEETINGS_EVENT,
  MEETINGS_METHODS,
  meetingsChannel,
  MREC_CHUNK,
  MREC_COMMAND,
  MREC_ENDED,
  MREC_LEVEL,
  MREC_READY,
  MREC_REPLY,
} from "./channels";
import type { CapsuleView, MeetingsBridge, Push, RecCommand } from "./contract";

export function meetingsBridge(ipc: IpcRenderer): MeetingsBridge {
  const methods = Object.fromEntries(MEETINGS_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(meetingsChannel(m), ...args)]));
  const on = <T>(channel: string, cb: (v: T) => void) => {
    const h = (_: unknown, v: T) => cb(v);
    ipc.on(channel, h);
    return () => void ipc.off(channel, h);
  };
  return {
    ...methods,
    onPush: (cb) => on<Push>(MEETINGS_EVENT, cb),
    rec: {
      onCommand: (cb) => on<RecCommand>(MREC_COMMAND, cb),
      reply: (id, r) => ipc.send(MREC_REPLY, id, r),
      chunk: (track, pcm, atSec) => ipc.send(MREC_CHUNK, track, pcm, atSec),
      level: (track, n) => ipc.send(MREC_LEVEL, track, n),
      ended: (track) => ipc.send(MREC_ENDED, track),
      ready: () => ipc.send(MREC_READY),
    },
    capsule: {
      onState: (cb) => on<CapsuleView | null>(CAPSULE_STATE, cb),
      act: (a) => ipc.send(CAPSULE_ACTION, a),
      interactive: (on) => ipc.send(CAPSULE_INTERACTIVE, on),
      drag: (dx, dy, end) => ipc.send(CAPSULE_DRAG, dx, dy, end),
      ready: () => ipc.send(CAPSULE_READY),
    },
  } as MeetingsBridge;
}
