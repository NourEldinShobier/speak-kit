import type { ToOffscreen } from "../../shared/internal";
import { getQueue, getState } from "./state";
import { voiceTabs } from "./voice-state";

export const OFFSCREEN_URL = "offscreen.html";

let creating: Promise<void> | undefined;

export async function hasOffscreen(): Promise<boolean> {
  return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType] })).length > 0;
}

/** The player's document by default; the voice conversation asks for its own url and reasons. */
export async function createOffscreen(doc: { url?: string; reasons?: chrome.offscreen.Reason[]; justification?: string } = {}): Promise<void> {
  creating ??= chrome.offscreen
    .createDocument({ url: doc.url ?? OFFSCREEN_URL, reasons: doc.reasons ?? ["AUDIO_PLAYBACK" as chrome.offscreen.Reason], justification: doc.justification ?? "Plays synthesized speech" })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

export async function sendOffscreen(msg: ToOffscreen): Promise<unknown> {
  // The document may not have registered its listener yet right after creation.
  for (let i = 0; ; i++) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (i >= 40) throw e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

export async function sendOffscreenIfOpen(msg: ToOffscreen): Promise<void> {
  if (await hasOffscreen()) await sendOffscreen(msg);
}

/** The player document is closed 60 s after playback stopped (it holds an AudioContext and decoded audio); the next play creates it again. */
export async function closeOffscreenIfIdle(): Promise<void> {
  if (voiceTabs.size) return; // a conversation is open in it
  const s = await getState();
  if (s.status !== "idle" && s.status !== "finished" && s.status !== "error") return;
  if ((await getQueue()).length) return;
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {}); // already closed by someone else
}
