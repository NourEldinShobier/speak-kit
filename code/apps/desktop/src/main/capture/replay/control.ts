import { nativeImage } from "electron";
import type { Ctx } from "../../context";
import type { Notice } from "../../../shared/capture/notices";
import type { CapturePhase } from "../../../shared/capture/contract";
import type { CaptureController } from "../controller";
import { writeCapture } from "../clipboard-out";
import type { History } from "../history";
import type { CapturePlatform } from "../platform/types";
import type { RecorderHolder } from "../recorder-holder";
import { makeSheet } from "../recording";
import { newId } from "../session-factory";
import type { CaptureRecord } from "../store";
import { hideOwnWindows } from "../windows";
import { createReplay, replayWanted } from ".";

export interface ReplayControl {
  /** Starts or stops the buffer to match the settings and whether a capture is running. */
  sync(): Promise<void>;
  /** The screen it keeps changed or went away: it starts again on the screen there is now. */
  rearm(onlyIfMoved?: boolean): Promise<void>;
  /** A capture starts: the buffer stops and starts again when the capture is saved. */
  pause(): Promise<void>;
  save(): void;
  /** The person turned it off from the capsule. */
  off(): void;
  dispose(): Promise<void>;
}

/** What the replay buffer needs of the runtime that owns it. */
export interface ReplayHost {
  readonly recorder: RecorderHolder;
  readonly controller: CaptureController;
  readonly phase: CapturePhase;
  notify(n: Notice): void;
  /** A replay was saved: show it like any other capture. */
  saved(record: CaptureRecord): void;
}

export interface ReplayControlDeps {
  ctx: Ctx;
  platform: CapturePlatform;
  history: History;
  publish(): void;
}

/** The replay buffer of the runtime: it follows the settings, gives way to a capture, and shows its indicator in the capsule for as long as it runs. */
export function createReplayControl(o: ReplayControlDeps, host: ReplayHost): ReplayControl {
  const settings = () => o.ctx.config.capture;
  const replay = createReplay({
    host: () => host.recorder.host,
    bundle: () => o.history.bundle,
    store: () => o.history.store,
    platform: o.platform,
    hideOwnWindows,
    sheet: (id, files) => makeSheet({ bundle: o.history.bundle, host: host.recorder.host, log: (l) => o.ctx.log.warn(l) }, id, files),
    saved: (record, sheet) => {
      void writeCapture("", sheet && nativeImage.createFromBuffer(sheet));
      host.saved(record);
    },
    notify: (n) => host.notify(n),
    changed: () => {
      host.controller.replay = replay.on ? { saving: replay.saving } : undefined;
      host.controller.update();
    },
    now: Date.now,
    newId,
    log: (l) => o.ctx.log.warn(l),
  });
  let chain: Promise<void> = Promise.resolve();
  const queued = (fn: () => Promise<void>) => (chain = chain.then(fn, fn));
  const turnOff = () => {
    settings().replayBuffer = false;
    o.ctx.saveConfig();
    o.publish();
  };
  const apply = async () => {
    const want = replayWanted(settings(), o.platform.supported) && host.phase === "idle";
    if (want && !replay.on) {
      // a buffer that cannot start is turned off, so it does not try again at every change
      if (!(await replay.arm())) turnOff();
    } else if (!want && replay.on) await replay.disarm();
  };
  return {
    sync: () => queued(apply),
    rearm: (onlyIfMoved) =>
      queued(async () => {
        if (replay.on && !(await replay.rearm(onlyIfMoved))) turnOff();
      }),
    pause: () => queued(() => replay.disarm()),
    save: () => void replay.save(),
    off: () => {
      turnOff();
      void queued(() => replay.disarm());
    },
    dispose: () => queued(() => replay.disarm()),
  };
}
