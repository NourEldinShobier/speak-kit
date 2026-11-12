import type { IpcRenderer } from "electron";
import { DICTATION_METHODS, dictationChannel, HUD_ACTION, HUD_EVENT, MIC_LEVEL_EVENT, REC_COMMAND, REC_EVENT, REC_LEVEL, REC_READY, REC_REPLY, STATUS_EVENT } from "./channels";
import type { DictationBridge, HudView, RecorderCommand } from "./contract";

export function dictationBridge(ipc: IpcRenderer): DictationBridge {
  const methods = Object.fromEntries(DICTATION_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(dictationChannel(m), ...args)]));
  const on = <T>(channel: string, cb: (v: T) => void) => {
    const h = (_: unknown, v: T) => cb(v);
    ipc.on(channel, h);
    return () => void ipc.off(channel, h);
  };
  return {
    ...methods,
    onStatus: (cb) => on(STATUS_EVENT, cb),
    onHud: (cb) => on<HudView>(HUD_EVENT, cb),
    onMicLevel: (cb) => on<number>(MIC_LEVEL_EVENT, cb),
    hudAction: (a) => ipc.send(HUD_ACTION, a),
    recorder: {
      onCommand: (cb) => on<RecorderCommand>(REC_COMMAND, cb),
      reply: (id, result) => ipc.send(REC_REPLY, id, result),
      level: (n) => ipc.send(REC_LEVEL, n),
      ready: () => ipc.send(REC_READY),
      event: (e) => ipc.send(REC_EVENT, e),
    },
  } as DictationBridge;
}
