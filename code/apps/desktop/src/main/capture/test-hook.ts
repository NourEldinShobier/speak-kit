import type { CapsuleAction } from "../../shared/capture/contract";
import type { CaptureService } from "./service";
import { hideOwnWindows } from "./windows";
import type { FakeRecorderOptions } from "./fake";

/** SPEAKKIT_TEST hooks for capture: run a whole capture with the scripted recorder and read what the session, the capsule and the files hold. */
export const captureTestHook = (c: CaptureService) => ({
  start: () => c.start(),
  stop: () => c.stop(),
  discard: () => c.discard(),
  /** A change in Settings, as the page sends it. */
  settings: (patch: Parameters<CaptureService["patchSettings"]>[0]) => c.patchSettings(patch),
  /** What the app does at quit while a capture runs; resolves when it is saved. */
  quit: async () => void (await c.finishForQuit()),
  state: () => c.testState(),
  status: () => c.statusNow(),
  /** What the scripted recorder does on the next recordings: how many frames it makes, whether the microphone is missing. */
  script: (o: FakeRecorderOptions) => c.runtime.recorder.script(o),
  /** Same as pressing the capture key: "down" then "up" starts, a quick "down" "up" while recording stops. */
  /** What the app does to its own windows while recording: out of any screen capture (true) or back in (false). */
  hideOwnWindows: (on: boolean) => hideOwnWindows(on),
  /** Same as pressing the screen recording key. */
  record: () => c.runtime.toggleScreenRecording(),
  /** Whether narration was asked for in each recording started so far. */
  narrationFlags: () => c.runtime.recorder.starts(),
  /** The commands the scripted recorder got, in order. */
  commands: () => c.runtime.recorder.commands(),
  /** Same as pressing a button of the capsule. */
  capsule: (action: CapsuleAction) => c.runtime.pressCapsule(action),
  /** The voice chat reads the capture that waits for it (what the look call does); the inbox is empty afterwards. */
  readSent: () => c.testInbox().take(),
  key: (kind: "down" | "up" | "escape") => c.keys.press({ kind }),
});
