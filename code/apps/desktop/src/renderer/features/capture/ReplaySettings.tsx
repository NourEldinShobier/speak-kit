import { useState } from "react";
import { Button, Modal, SettingRow, Toggle } from "@speakkit/ui";
import type { CaptureStatus } from "../../../shared/capture/contract";
import { REPLAY_HOTKEY } from "../../../shared/capture/settings";
import { HotkeyRecorder } from "../dictation";
import { capture } from "./api";

function ConsentDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const accept = async () => {
    await capture.patchSettings({ replayConsented: true, replayBuffer: true });
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keep the last 15 seconds of your screen?"
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" data-autofocus onClick={() => void accept()}>
            Turn on replay
          </Button>
        </>
      }
    >
      While the replay buffer is on, Speak Kit keeps the last 15 seconds of your first screen in memory all the time, not only when you start a capture. A pill on the screen shows that it is on.
      Whatever is on that screen is kept, including passwords and private windows. Nothing is saved or sent anywhere until you press the replay key or Save in the pill, and turning it off drops what
      was kept. Speak Kit's own windows are left out.
    </Modal>
  );
}

/** The replay buffer (experiment): the switch, the key that saves the last 15 seconds, and the notice that has to be accepted before the first time. */
export function ReplaySettings({ s, onRecording }: { s: CaptureStatus; onRecording(on: boolean): void }) {
  const [asking, setAsking] = useState(false);
  const c = s.settings;
  const toggle = (on: boolean) => (on && !c.replayConsented ? setAsking(true) : void capture.patchSettings({ replayBuffer: on }));
  return (
    <>
      <SettingRow
        label="Replay buffer"
        description="Keeps the last 15 seconds of the first screen in memory, so a key can save what just happened. Nothing is written to disk until you save it. A pill shows while it is on."
        control={<Toggle aria-label="Replay buffer" checked={c.replayBuffer} onChange={toggle} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Replay key"
        description="Saves the last 15 seconds as a capture. It works while the replay buffer is on."
        control={
          <HotkeyRecorder
            label="Replay hotkey"
            value={c.replayHotkey}
            restore={REPLAY_HOTKEY}
            onRecording={onRecording}
            save={async (replayHotkey) => void (await capture.patchSettings({ replayHotkey }))}
          />
        }
      />
      <ConsentDialog open={asking} onClose={() => setAsking(false)} />
    </>
  );
}
