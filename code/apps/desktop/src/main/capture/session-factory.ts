import { nativeImage } from "electron";
import { randomBytes } from "node:crypto";
import type { LiveSession } from "./live-narrator";
import type { TimeRange } from "./page-context";
import type { NoticeParams, Notice } from "../../shared/capture/notices";
import type { CaptureConfig } from "../../shared/capture/settings";
import { writeCapture } from "./clipboard-out";
import type { InputEvent } from "./events";
import type { Fence } from "./fence";
import type { History } from "./history";
import type { CapturePlatform } from "./platform/types";
import type { RecorderHolder } from "./recorder-holder";
import { createSessionPorts, type Narrator } from "./recording";
import { createSession, type Session, type Target } from "./session";
import type { CaptureRecord } from "./store";
import { hideOwnWindows } from "./windows";

const now = () => Date.now();
const newId = () => `c${now().toString(36)}${randomBytes(3).toString("hex")}`;

export interface SessionWiring {
  platform: CapturePlatform;
  history: History;
  narrator: Narrator;
  fence: Fence;
  recorder: RecorderHolder;
  settings(): CaptureConfig;
  context(sourceId: string | undefined, range: TimeRange): Promise<string | undefined>;
  events(): InputEvent[];
  live?: LiveSession;
  /** False once the session this was made for was replaced: what it finishes later is not shown or copied. */
  current(): boolean;
  saved(record: CaptureRecord): void;
  pick(signal: AbortSignal): Promise<Target | null>;
  notify(n: Notice): void;
  changed(): void;
  micMissing(): void;
  noticeParams(): NoticeParams;
  log(line: string): void;
}

/** The session of a capture wired to the recorder window, the files of the capture folder, the speech model and the clipboard. */
export function makeSession(w: SessionWiring): Session {
  const { history, recorder } = w;
  return createSession(
    createSessionPorts({
      platform: w.platform,
      fence: w.fence,
      get host() {
        return recorder.host;
      },
      // Read when used: the folder can change and the history then holds new files.
      get bundle() {
        return history.bundle;
      },
      get store() {
        return history.store;
      },
      get journal() {
        return history.journal;
      },
      narrator: w.narrator,
      settings: w.settings,
      hideOwnWindows,
      delivery: {
        copy: (text, sheet) => w.current() && void writeCapture(text, sheet && nativeImage.createFromBuffer(sheet)),
        saved: (r) => w.current() && w.saved(r),
      },
      now,
      newId,
      log: w.log,
      pick: w.pick,
      notify: w.notify,
      changed: w.changed,
      micMissing: w.micMissing,
      noticeParams: w.noticeParams,
      context: w.context,
      events: w.events,
      ...(w.live && { live: w.live }),
    }),
  );
}
