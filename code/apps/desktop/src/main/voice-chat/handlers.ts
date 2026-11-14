import type { Api } from "../../shared/ipc";
import type { VoiceChat } from "./service";

/** The IPC methods for the voice chat key. None returns the key; the renderer learns only whether one is saved. */
export function voiceChatHandlers(vc: VoiceChat) {
  return {
    voiceChatStatus: () => vc.status(),
    voiceChatSetKey: (key) => vc.setKey(key),
    voiceChatRemoveKey: () => vc.removeKey(),
    voiceChatTestKey: () => vc.testKey(),
  } satisfies Partial<Api>;
}
