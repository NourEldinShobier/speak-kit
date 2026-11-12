import type { DictationState } from "@speakkit/dictation";
import type { DictationConfig } from "../../shared/dictation/settings";
import { createSystemDucker } from "./ducking";
import type { SwitchableHotkeys } from "./hotkey-source";
import { cancelGrab, sleepBlock } from "./service-extras";
import type { Spool } from "./spool";

const live = (s: DictationState) => s.status === "recording" || s.status === "locked";

/** What dictation does to the outside while it runs: the computer stays awake, other audio goes quiet for a recording, the cancel key is taken while text is typed, and the audio kept for a crash is bounded. */
export function createOutputSide(h: { cfg(): DictationConfig; hotkeys(): SwitchableHotkeys | undefined; state(): DictationState; warn(title: string, detail: string): void }) {
  const { cfg, hotkeys, state } = h;
  const sleep = sleepBlock(
    () => cfg().blockSleep,
    (why) => h.warn("dictation sleep block", why),
  );
  const ducker = createSystemDucker({ mode: () => cfg().duckAudio, speakersOnly: () => cfg().duckSpeakersOnly });
  let spool: Spool | undefined;
  let typing = false;
  return {
    typing: () => typing,
    /** Typing started or ended: Escape is grabbed only while it can stop something. */
    onTyping(on: boolean): void {
      typing = on;
      hotkeys()?.setCancelGrab(cancelGrab(state(), on));
    },
    /** At launch: with History off no audio is kept at all, otherwise audio older than a day goes. */
    attach(s: Spool): void {
      spool = s;
      void (cfg().retention === "off" ? s.clear() : s.sweep());
    },
    /** The history was cleared: audio kept for a crash goes too. */
    cleared: (): void => void spool?.clear(),
    onState(prev: DictationState, next: DictationState): void {
      sleep(live(next));
      if (live(next) && !live(prev)) void ducker.begin();
      else if (!live(next) && live(prev)) void ducker.end();
    },
    dispose: () => (sleep(false), ducker.end().finally(ducker.dispose)),
  };
}
