import type { CaptureService } from "./service";
import type { FakeRecorderOptions } from "./fake";

/** SPEAKKIT_TEST hooks for capture: run a whole capture with the scripted recorder and read what the session, the capsule and the files hold. */
export const captureTestHook = (c: CaptureService) => ({
  start: () => c.start(),
  stop: () => c.stop(),
  discard: () => c.discard(),
  state: () => c.testState(),
  status: () => c.statusNow(),
  /** What the scripted recorder does on the next recordings: how many frames it makes, whether the microphone is missing. */
  script: (o: FakeRecorderOptions) => c.runtime.scriptRecorder(o),
  /** Same as pressing the capture key: "down" then "up" starts, a quick "down" "up" while recording stops. */
  key: (kind: "down" | "up" | "escape") => c.keys.press({ kind }),
});
