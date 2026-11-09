import type { VoiceDown } from "@speakkit/protocol";
import { ignore } from "../../shared/ignore";

/** Which tabs have a conversation and the ports their pages hold. Kept apart from voice.ts so the player and the offscreen helpers can ask without importing it. */
export const voicePorts = new Map<number, chrome.runtime.Port>();
/** Tabs whose session is open; the offscreen document stays while any is. */
export const voiceTabs = new Set<number>();

export const tell = (tabId: number, m: VoiceDown) => voicePorts.get(tabId)?.postMessage(m);

/** A conversation exists only for its page: the pill shows "Conversation ended" and the document (microphone and peer connection) is closed. */
export async function endVoice() {
  if (!voiceTabs.size) return;
  for (const tabId of voiceTabs) tell(tabId, { t: "view", view: { phase: "ended", muted: false } });
  voiceTabs.clear();
  await chrome.offscreen.closeDocument().catch(ignore);
}
