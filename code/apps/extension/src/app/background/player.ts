import type { PlayerCommand, PlayerState } from "@speakkit/protocol";
import { getToken, loadSettings, saveSettings } from "../../features/settings";
import type { FromOffscreen, PlayerConfig } from "../../shared/internal";
import { closeOffscreenIfIdle, createOffscreen, hasOffscreen, sendOffscreen } from "./offscreen";
import { endVoice } from "./voice-state";
import { getState, idle, lastDoc, publishState, rememberDoc, sendToPages, sendToTab, setQueue } from "./state";

const SOUNDS = new Set<PlayerCommand["cmd"]>(["play", "resume", "toggle", "queue-play"]);

async function playerConfig(): Promise<PlayerConfig> {
  const s = await loadSettings();
  return { port: s.port, token: await getToken(), voice: s.voice, speed: s.speed, pause: s.pauseBetweenParagraphs };
}

export async function runPlayerCommand(command: PlayerCommand, senderTabId?: number, cfgOverride?: Partial<PlayerConfig>): Promise<void> {
  if (SOUNDS.has(command.cmd)) await endVoice(); // a read-aloud and a conversation never talk at once
  if ((command.cmd === "play" || command.cmd === "queue-add") && senderTabId !== undefined) command = { ...command, doc: { ...command.doc, tabId: senderTabId } };
  if (command.cmd === "set-speed") await saveSettings({ speed: command.speed });
  if (command.cmd === "set-voice") await saveSettings({ voice: command.voice });

  if (!(await hasOffscreen())) {
    // The offscreen document closes by itself after ~30 s without audio, taking the player with it.
    const last = await getState();
    const doc = await lastDoc();
    if ((command.cmd === "resume" || command.cmd === "toggle") && last.status === "paused" && doc) {
      command = { cmd: "play", doc: { ...doc, startIndex: last.sentenceIndex } };
    } else if (command.cmd !== "play" && command.cmd !== "queue-add") {
      if (command.cmd !== "set-speed" && command.cmd !== "set-voice" && last.status !== "idle") publishState(await idle());
      return;
    }
    await createOffscreen();
  }
  if (command.cmd === "play" || command.cmd === "queue-add") rememberDoc(command.doc);
  await sendOffscreen({ to: "offscreen", command, cfg: { ...(await playerConfig()), ...cfgOverride } });
}

/** What the offscreen player reports: state, the sentence being heard, the queue, or that it has been idle long enough to close. */
export async function handleOffscreen(m: Exclude<FromOffscreen, { kind: "voice" }>): Promise<void> {
  if (m.kind === "state") publishState(m.state);
  else if (m.kind === "sentence-start") {
    sendToPages({ t: "sentence-start", start: m.start });
    sendToTab(m.tabId ?? (await getState()).tabId, { t: "sentence-start", start: m.start });
  } else if (m.kind === "idle") await closeOffscreenIfIdle();
  else {
    setQueue(m.queue);
    sendToPages({ t: "queue", queue: m.queue });
  }
}

/**
 * After the worker was suspended its memory is gone and the mirrored state may be stale (the offscreen document kept playing, or was closed).
 * Ask the player what it is doing and publish that when it differs, so every tab and the badge catch up.
 */
export async function reconcilePlayer(): Promise<void> {
  const last = await getState();
  if (!(await hasOffscreen())) {
    if (last.status !== "idle") publishState(await idle());
    return;
  }
  const now = (await sendOffscreen({ to: "offscreen", query: "state" })) as PlayerState | undefined;
  if (now && (now.status !== last.status || now.docId !== last.docId || now.tabId !== last.tabId)) publishState(now);
}
