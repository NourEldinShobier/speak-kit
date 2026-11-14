import type { CapsuleAction, CapturePhase } from "../../shared/capture/contract";
import { noticeFor, type Notice, type NoticeAction } from "../../shared/capture/notices";
import type { CaptureConfig } from "../../shared/capture/settings";
import type { Ctx } from "../context";
import { createEventLog } from "./events";
import { createRecordingExtras } from "./recording-extras";
import { createReplayControl, type ReplayControl } from "./replay/control";
import { Placement } from "./placement";
import { RecorderHolder } from "./recorder-holder";
import type { CapsuleActionDeps } from "./capsule-actions";
import { CapsuleInput } from "./capsule-input";
import { CaptureController } from "./controller";
import { createFence, type Fence } from "./fence";
import type { CaptureInbox } from "../voice-chat/capture-inbox";
import { AfterCapture } from "./after-capture";
import { NoticeBoard } from "./notice-board";
import type { GestureAction } from "./gesture";
import type { ShiftAction } from "./gesture/shift-ink";
import type { History } from "./history";
import { displayAt } from "./picker";
import { TargetPicker } from "./target-picker";
import type { CapturePlatform } from "./platform/types";
import type { RecorderHost } from "./recorder-host";
import type { Narrator } from "./recording";
import { makeSession } from "./session-factory";
import { shootFlow } from "./screenshot";
import { finishForQuit } from "./session/quit";
import { createSwitchFlow, type SwitchFlow } from "./switch-flow";
import type { Session, Target } from "./session";
import type { CaptureRecord } from "./store";
import { runNoticeAction } from "./notice-action";
import { createRecordingGuards } from "./recording-guards";
import { capturePage, openCapsuleWindow, openOverlayWindow } from "./windows";

export interface RuntimeDeps {
  ctx: Ctx;
  history: History;
  platform: CapturePlatform;
  narrator: Narrator;
  distDir: string;
  /** Where a capture sent to the voice chat waits to be read. */
  inbox: CaptureInbox;
  /** Tests only: a recorder that makes pictures up. */
  recorder?: RecorderHost | undefined;
  /** Left clicks while a recording runs (for suggested zooms); missing where the mouse cannot be hooked. */
  clicks?: ((onClick: () => void) => () => void) | undefined;
  /** Sends the status to the app window. */
  publish(): void;
  /** Re-reads the number of captures, then publishes. */
  refresh(): void;
}

const now = () => Date.now();
const QUIT_WAIT_MS = 30_000;

/** What happens while a capture is on: the session and its recorder window, the picker, the capsule and ink layer, notices and the screenshot. */
export class CaptureRuntime {
  readonly controller: CaptureController;
  readonly #d: RuntimeDeps;
  #session: Session;
  /** The recorder window; tests script it. */
  readonly recorder: RecorderHolder;
  readonly #place: Placement;
  readonly #extras: ReturnType<typeof createRecordingExtras>;
  readonly #events = createEventLog({ now, startedAt: () => this.#session.state.startedAt, mode: () => this.#settings.inputLog });
  readonly #targets: TargetPicker;
  readonly #board: NoticeBoard;
  #after!: AfterCapture;
  /** The replay buffer (experiment). */
  readonly replay: ReplayControl;
  readonly #capsule = new CapsuleInput(() => this.#capsuleDeps());
  #switch!: SwitchFlow;
  readonly #fence: Fence = createFence();
  /** Bumped when the session is replaced, so what the old one finishes later is not shown. */
  #epoch = 0;
  /** The recording on now (or about to start) was started with the screen recording key: no narration. */
  #screenOnly = false;
  #off: (() => void)[] = [];
  readonly #guards: ReturnType<typeof createRecordingGuards>;

  constructor(deps: RuntimeDeps) {
    this.#d = deps;
    this.#board = new NoticeBoard({ showInCapsule: (n) => this.controller.after(n && { kind: "failed", notice: n }), publish: () => deps.publish() });
    this.#guards = createRecordingGuards({ notify: (n) => this.notify(n), log: (l) => deps.ctx.log.warn(l), params: () => ({ os: deps.platform.os }), session: () => this.#session });
    this.#extras = createRecordingExtras(deps);
    this.recorder = new RecorderHolder({
      recorder: deps.recorder,
      distDir: deps.distDir,
      narration: () => this.#settings.narration,
      fence: this.#fence,
      writes: this.#guards.writes,
      bundle: () => deps.history.bundle,
      id: () => this.#session.state.id,
      log: (l) => deps.ctx.log.warn(l),
      live: this.#extras.live,
      lost: () => void this.replay.rearm(),
    });
    this.#place = new Placement({ platform: deps.platform, state: () => this.#session.state, relocate: () => this.controller.relocate() });
    this.#targets = new TargetPicker({ platform: deps.platform, distDir: deps.distDir, settings: () => this.#settings, saveConfig: () => deps.ctx.saveConfig() });
    this.#session = this.#makeSession();
    this.controller = this.#makeController();
    this.#switch = createSwitchFlow({
      session: () => this.#session,
      pick: (signal) => this.#targets.pick(signal, true),
      setSwitching: (on) => {
        this.controller.switching = on;
        this.controller.update();
      },
    });
    this.#after = new AfterCapture({
      controller: this.controller,
      history: deps.history,
      inbox: deps.inbox,
      ctx: deps.ctx,
      settings: () => this.#settings,
      notify: (n) => this.notify(n),
      refresh: () => deps.refresh(),
    });
    this.replay = createReplayControl(deps, this);
    this.#off.push(
      deps.platform.onDisplaysChanged(() => this.#displaysChanged()),
      this.#capsule.listen(),
    );
  }

  get #settings(): CaptureConfig {
    return this.#d.ctx.config.capture;
  }

  get phase(): CapturePhase {
    return this.#session.state.phase;
  }

  get notice(): Notice | undefined {
    return this.#board.current;
  }

  get state() {
    return this.#session.state;
  }

  #makeController(): CaptureController {
    const { distDir, platform } = this.#d;
    return new CaptureController({
      openCapsule: (b) => openCapsuleWindow(capturePage(distDir, "capture-capsule"), b),
      openInk: (b) => openOverlayWindow(capturePage(distDir, "capture-overlay"), b, true),
      session: () => this.#session.state,
      title: () => this.#place.title,
      displayBounds: () => this.#place.bounds ?? platform.displays()[0]?.bounds ?? { x: 0, y: 0, width: 1280, height: 800 },
      settings: () => this.#settings,
      now,
      changed: () => this.#d.publish(),
    });
  }

  #makeSession(): Session {
    const d = this.#d;
    const epoch = this.#epoch;
    return makeSession({
      platform: d.platform,
      history: d.history,
      narrator: d.narrator,
      fence: this.#fence,
      recorder: this.recorder,
      settings: () => (this.#screenOnly ? { ...this.#settings, narration: false } : this.#settings),
      context: this.#extras.context,
      events: () => this.#events.take(),
      live: this.#extras.live,
      pointer: this.#extras.pointer,
      current: () => epoch === this.#epoch,
      saved: (r) => this.#after.saved(r),
      pick: (signal) => this.#pick(signal),
      notify: (n) => this.notify(n),
      changed: () => this.#sessionChanged(),
      micMissing: () => {
        this.controller.micMissing = true;
      },
      noticeParams: () => ({ os: d.platform.os, days: this.#settings.retentionDays }),
      log: (line) => d.ctx.log.warn(line),
    });
  }

  /** The folder changed: a new session on the new files. */
  rebind() {
    this.#epoch++;
    this.#session.discard();
    this.#session = this.#makeSession();
  }

  act(a: GestureAction | ShiftAction) {
    if (a === "start") void this.start();
    else if (a === "stop") this.#session.stop();
    else if (a === "ink-start" || a === "ink-end") this.#ink(a);
  }

  /** Drawing with the capture key or Shift: the ink layer shows while the key is held, unless the pen keeps it. */
  #ink(a: "ink-start" | "ink-end") {
    this.#events.add(a);
    if (a === "ink-start") this.controller.showInk();
    else if (!this.controller.pen) this.controller.hideInk();
  }

  // Taking a capture ------------------------------------------------------------------------------------------------------------------------

  #pick(signal: AbortSignal): Promise<Target | null> {
    return this.#targets.pick(signal, this.#session.state.phase === "recording");
  }

  #sessionChanged() {
    if (this.#session.state.phase === "idle") this.#screenOnly = false;
    this.#place.sessionChanged();
    this.#guards.limit.sync(this.#session.state.phase === "recording");
    void this.replay.sync();
    this.controller.update();
    this.#d.publish();
  }

  /** A screen that is being recorded was unplugged: the capture so far is saved. */
  #displaysChanged() {
    void this.replay.rearm(true);
    if (!this.#place.recordedDisplayLost()) return;
    this.notify(noticeFor("display-lost"));
    this.#session.stop();
  }

  async start(): Promise<void> {
    const { ctx, platform: p } = this.#d;
    const s = this.#settings;
    if (!s.enabled || !p.supported || this.#session.state.phase !== "idle") return;
    if (!s.consented) {
      ctx.showWindow();
      ctx.sendUi({ type: "nav", page: "capture" });
      return this.#d.publish();
    }
    if (p.screenPermission() === "denied") return this.notify(noticeFor("permission-denied", { os: p.os }));
    await this.replay.pause();
    this.#after.send.cancel();
    this.#events.reset();
    this.controller.reset();
    this.#guards.writes.reset();
    this.#board.clear();
    const d = displayAt(p.cursor(), p.displays()) ?? p.displays()[0];
    await this.#session.start(s.target === "screen" && d ? { kind: "screen", displayId: d.id } : undefined);
  }

  /** The screen recording key: starts a recording of the screen without narration, and the next press stops it. */
  async toggleScreenRecording(): Promise<void> {
    const { phase } = this.#session.state;
    if (phase === "recording") return this.stop();
    if (phase !== "idle" || !this.#settings.experiments.recording) return;
    this.#screenOnly = true;
    await this.start();
    if (this.#session.state.phase === "idle") this.#screenOnly = false;
  }

  /** The capture of a saved replay is shown like any other. */
  saved(record: CaptureRecord) {
    this.#after.saved(record);
  }

  stop() {
    this.#switch.cancel();
    this.#session.stop();
  }

  discard() {
    this.#switch.cancel();
    this.#session.discard();
    this.controller.reset();
    this.controller.update();
  }

  /** The screenshot of the experiment: pick, take one picture, copy it, show the corner card. */
  async shoot(): Promise<void> {
    const { platform: p, history } = this.#d;
    const s = this.#settings;
    if (!s.enabled || !s.experiments.screenshots || this.#session.state.phase !== "idle") return;
    const epoch = this.#epoch;
    await shootFlow({
      platform: p,
      history,
      pick: () => this.#pick(new AbortController().signal),
      current: () => epoch === this.#epoch,
      notify: (n) => this.notify(n),
      log: (l) => this.#d.ctx.log.warn(l),
      shown: (record) => {
        this.#place.title = record.title;
        this.#after.shot(record);
      },
    });
  }

  // The capsule -----------------------------------------------------------------------------------------------------------------------------

  #capsuleDeps(): CapsuleActionDeps {
    return {
      controller: this.controller,
      stop: () => this.#session.stop(),
      discard: () => this.discard(),
      open: () => this.#after.open(),
      retry: () => this.#retry(),
      send: this.#after.send,
      sendLast: () => this.#after.sendLast(),
      switchTarget: () => void this.#switch.run().then((r) => r === "switched" && this.#events.add("target-switch")),
      note: (kind) => this.#events.add(kind),
      replay: this.replay,
      copyLast: (what) => void this.#after.copyLast(what),
    };
  }

  /** Tests only: presses a button of the capsule. */
  pressCapsule(action: CapsuleAction) {
    this.#capsule.press(action);
  }

  /** Try again sends the same capture again after a failed hand-over, and starts a new capture after any other failure. */
  #retry() {
    if (!this.#after.retrySend(this.notice)) void this.start();
  }

  // Notices ---------------------------------------------------------------------------------------------------------------------------------

  notify(n: Notice) {
    this.#board.notify(n);
  }

  dismissNotice() {
    this.#board.dismiss();
  }

  async noticeAction(action: NoticeAction): Promise<"folder" | "done"> {
    const done = await runNoticeAction(action, { platform: this.#d.platform, retry: () => void this.start() });
    if (done === "done") this.dismissNotice();
    return done;
  }

  /** At quit: a recording is stopped and saved, and the returned promise resolves when it is (or after 30 s). Undefined when nothing is running. */
  finishForQuit(): Promise<void> | undefined {
    return finishForQuit(this.#session, QUIT_WAIT_MS);
  }

  dispose() {
    this.#guards.limit.sync(false);
    void this.replay.dispose();
    for (const off of this.#off) off();
    this.#board.dispose();
    this.#session.discard();
    this.#targets.dispose();
    this.controller.dispose();
    this.recorder.dispose();
  }
}
