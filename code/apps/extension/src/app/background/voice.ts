import { VOICE_PORT, type VoiceUp } from "@speakkit/protocol";
import { getToken, loadSettings } from "../../features/settings";
import type { FromOffscreen, VoiceCommand } from "../../shared/internal";
import { parseVoiceUp } from "../../shared/schemas";
import { OFFSCREEN_URL, createOffscreen, hasOffscreen, sendOffscreen } from "./offscreen";
import { runPlayerCommand } from "./player";
import { getState, publishState } from "./state";
import { tell, voicePorts, voiceTabs } from "./voice-state";
import { ignore } from "../../shared/ignore";

/**
 * Voice chat in the worker: a relay between the page (a port that lives as long as the page does) and the voice session in the
 * offscreen document, plus what only the worker can do: pause the read-aloud, open the microphone window, close the document.
 * A closed port is the page going away (tab closed, navigation, extension reload): the session ends with it.
 */
/** Counts conversations: the voice document echoes it, so messages of a conversation that is over are ignored. 0 until the first one (also after a worker restart). */
let sid = 0;
const toVoiceDoc = (tabId: number, voice: VoiceCommand, extra: { cfg?: { port: number; token: string }; sid?: number } = {}) =>
  sendOffscreen({ to: "offscreen", voice, tabId, sid: extra.sid ?? sid, ...(extra.cfg ? { cfg: extra.cfg } : {}) });

/** The voice document holds only the microphone and the model's voice; the player has its own, so closing one never takes the other. */
async function closeVoiceDoc() {
  if (!voiceTabs.size && (await hasOffscreen()) && !voiceTabs.size) await chrome.offscreen.closeDocument().catch(ignore); // not if a new conversation began while asking
}

/** Pauses what is being read (the document is about to be replaced; Resume starts it again from the same sentence). */
async function pausePlayer() {
  const s = await getState();
  if (s.status !== "playing" && s.status !== "preparing") return;
  await runPlayerCommand({ cmd: "pause" });
  for (let i = 0; i < 20 && (await getState()).status !== "paused"; i++) await new Promise((r) => setTimeout(r, 25));
  const now = await getState();
  if (now.status !== "paused") publishState({ ...now, status: "paused" });
}

async function begin(tabId: number, up: Extract<VoiceUp, { t: "start" }>) {
  for (const other of voiceTabs) if (other !== tabId) tell(other, { t: "view", view: { phase: "ended", muted: false } }); // one conversation at a time
  voiceTabs.clear();
  voiceTabs.add(tabId);
  sid++;
  try {
    await pausePlayer();
    if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(ignore); // the player's document, or a conversation of another tab
    await createOffscreen({ url: `${OFFSCREEN_URL}?voice`, reasons: ["USER_MEDIA" as chrome.offscreen.Reason], justification: "Listens through the microphone and plays the model's voice" });
    await toVoiceDoc(tabId, up, { cfg: { port: (await loadSettings()).port, token: await getToken() } });
  } catch {
    voiceTabs.delete(tabId);
    tell(tabId, { t: "view", view: { phase: "ended", muted: false, problem: "unavailable" } });
  }
}

export function onVoicePort(port: chrome.runtime.Port) {
  const tabId = port.sender?.tab?.id;
  if (port.name !== VOICE_PORT || tabId === undefined || port.sender?.id !== chrome.runtime.id) return;
  voicePorts.set(tabId, port);
  port.onMessage.addListener((m: unknown) => {
    const up = parseVoiceUp(m);
    if (up?.t === "start") void begin(tabId, up);
    else if (up && voiceTabs.has(tabId)) void toVoiceDoc(tabId, up).catch(ignore);
  });
  port.onDisconnect.addListener(() => {
    if (voicePorts.get(tabId) !== port) return;
    voicePorts.delete(tabId);
    if (!voiceTabs.delete(tabId)) return;
    void toVoiceDoc(tabId, { t: "end" }).catch(ignore);
    void closeVoiceDoc();
  });
}

let micWindow: number | undefined;
// Closing the permission window without answering is an answer: blocked. (The page says so too; whichever arrives first counts.)
chrome.windows.onRemoved.addListener((id) => {
  if (id !== micWindow) return;
  micWindow = undefined;
  void toVoiceDoc(0, { t: "mic", ok: false }).catch(ignore);
});
async function openMicWindow() {
  if (micWindow !== undefined && (await chrome.windows.get(micWindow).catch(ignore))) return void chrome.windows.update(micWindow, { focused: true });
  micWindow = (await chrome.windows.create({ url: "mic.html", type: "popup", width: 460, height: 340, focused: true }))?.id;
}

/** What the voice session reports. A tab without a port is a page that is gone (or a worker that restarted): its session is ended. */
export function onVoiceFromOffscreen({ tabId, sid: from, msg }: Extract<FromOffscreen, { kind: "voice" }>) {
  if (msg.t === "need-mic") return void openMicWindow();
  if (from !== sid) {
    if (sid === 0) void toVoiceDoc(tabId, { t: "end" }, { sid: from }).catch(ignore); // the worker restarted: nobody is listening to that conversation
    return;
  }
  if (msg.t === "closed") {
    voiceTabs.delete(tabId);
    return void closeVoiceDoc();
  }
  if (voicePorts.has(tabId)) tell(tabId, msg);
  else {
    voiceTabs.delete(tabId);
    void toVoiceDoc(tabId, { t: "end" }).catch(ignore);
  }
}
