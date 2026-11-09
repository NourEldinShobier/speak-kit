import type { Api, AppState } from "../../shared/ipc";
import type { VoiceChat } from "./service";

/** The IPC methods for the voice chat key and voice. None returns the key; the renderer learns only whether one is saved. */
export function voiceChatHandlers(vc: VoiceChat, publish: () => AppState) {
  return {
    voiceChatStatus: () => vc.status(),
    voiceChatSetKey: (key) => vc.setKey(key),
    voiceChatRemoveKey: () => vc.removeKey(),
    voiceChatTestKey: () => vc.testKey(),
    voiceChatSetVoice: async (voice) => {
      vc.setVoice(voice);
      return publish();
    },
  } satisfies Partial<Api>;
}
