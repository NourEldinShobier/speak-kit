import type { IpcRenderer } from "electron";
import { SPEECH_MODEL_METHODS, SPEECH_MODELS_EVENT, speechModelChannel } from "./channels";
import type { SpeechModelsBridge, SpeechModelsView } from "./contract";

export function speechModelsBridge(ipc: IpcRenderer): SpeechModelsBridge {
  const methods = Object.fromEntries(SPEECH_MODEL_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(speechModelChannel(m), ...args)]));
  return {
    ...methods,
    onView: (cb: (v: SpeechModelsView) => void) => {
      const h = (_: unknown, v: SpeechModelsView) => cb(v);
      ipc.on(SPEECH_MODELS_EVENT, h);
      return () => void ipc.off(SPEECH_MODELS_EVENT, h);
    },
  } as SpeechModelsBridge;
}
