import { app, ipcMain, nativeImage, shell, type WebContents } from "electron";
import { randomBytes } from "node:crypto";
import * as v from "valibot";
import { CAPSULE_ACTION, CAPSULE_HOVER } from "../../shared/capture/channels";
import { CapsuleActionSchema, type CapsuleAction, type CapturePhase } from "../../shared/capture/contract";
import { noticeFor, type Notice, type NoticeAction } from "../../shared/capture/notices";
import type { CaptureConfig } from "../../shared/capture/settings";
import type { Ctx } from "../context";
import { Placement } from "./placement";
import { RecorderHolder } from "./recorder-holder";
import { capsuleHandlers } from "./capsule-actions";
import { writeCapture } from "./clipboard-out";
import { CaptureController } from "./controller";
import { createFence, type Fence } from "./fence";
import type { CaptureInbox } from "../voice-chat/capture-inbox";
import { AfterCapture } from "./after-capture";
import { NoticeBoard } from "./notice-board";
import type { FakeRecorderOptions } from "./fake";
import type { GestureAction } from "./gesture";
import type { ShiftAction } from "./gesture/shift-ink";
import type { History } from "./history";
import { displayAt } from "./picker";
import { TargetPicker } from "./target-picker";
import type { CapturePlatform } from "./platform/types";
import type { RecorderHost } from "./recorder-host";
import { createSessionPorts, type Narrator } from "./recording";
import { shootFlow } from "./screenshot";
import { finishForQuit } from "./session/quit";
import { createSwitchFlow, type SwitchFlow } from "./switch-flow";
import { createSession, type Session, type Target } from "./session";
import { externalFor } from "./notice-target";
import { createRecordingGuards } from "./recording-guards";
import { capturePage, hideOwnWindows, openCapsuleWindow, openOverlayWindow } from "./windows";

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
  /** Sends the status to the app window. */
  publish(): void;
  /** Re-reads the number of captures, then publishes. */
  refresh(): void;
}

const now = () => Date.now();
const newId = () => `c${now().toString(36)}${randomBytes(3).toString("hex")}`;
const QUIT_WAIT_MS = 30_000;

/** What happens while a capture is on: the session and its recorder window, the picker, the capsule and ink layer, notices and the screenshot. */
export class CaptureRuntime {
  readonly controller: CaptureController;
  readonly #d: RuntimeDeps;
  #session: Session;
  readonly #holder: RecorderHolder;
  readonly #place: Placement;
  readonly #targets: TargetPicker;
  readonly #board: NoticeBoard;
  #after!: AfterCapture;
  #switch!: SwitchFlow;
  readonly #fence: Fence = createFence();
  /** Bumped when the session is replaced, so what the old one finishes later is not shown. */
  #epoch = 0;
  #off: (() => void)[] = [];
  readonly #guards: ReturnType<typeof createRecordingGuards>;

  constructor(deps: RuntimeDeps) {
    this.#d = deps;
    this.#board = new NoticeBoard({ showInCapsule: (n) => this.controller.after(n && { kind: "failed", notice: n }), publish: () => deps.publish() });
    this.#guards = createRecordingGuards({ notify: (n) => this.notify(n), log: (l) => deps.ctx.log.warn(l), params: () => ({ os: deps.platform.os }), session: () => this.#session });
    this.#holder = new RecorderHolder({
      recorder: deps.recorder,
      distDir: deps.distDir,
      narration: () => this.#settings.narration,
      fence: this.#fence,
      writes: this.#guards.writes,
      bundle: () => deps.history.bundle,
      id: () => this.#session.state.id,
      log: (l) => deps.ctx.log.warn(l),
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
    const onAction = (e: Electron.IpcMainEvent, a: unknown) => this.#fromCapsule(e.sender, a);
    const onHover = (e: Electron.IpcMainEvent, over: unknown) => typeof over === "boolean" && this.controller.owns(e.sender) && this.controller.hover(over);
    ipcMain.on(CAPSULE_ACTION, onAction);
    ipcMain.on(CAPSULE_HOVER, onHover);
    this.#off.push(
      deps.platform.onDisplaysChanged(() => this.#displaysChanged()),
      () => ipcMain.off(CAPSULE_ACTION, onAction),
      () => ipcMain.off(CAPSULE_HOVER, onHover),
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
    const holder = this.#holder;
    const epoch = this.#epoch;
    return createSession(
      createSessionPorts({
        platform: d.platform,
        fence: this.#fence,
        get host() {
          return holder.host;
        },
        // Read when used: the folder can change and the history then holds new files.
        get bundle() {
          return d.history.bundle;
        },
        get store() {
          return d.history.store;
        },
        get journal() {
          return d.history.journal;
        },
        narrator: d.narrator,
        settings: () => this.#settings,
        hideOwnWindows: hideOwnWindows,
        delivery: {
          copy: (text, sheet) => epoch === this.#epoch && void writeCapture(text, sheet && nativeImage.createFromBuffer(sheet)),
          saved: (r) => epoch === this.#epoch && this.#after.saved(r),
        },
        now,
        newId,
        log: (line) => d.ctx.log.warn(line),
        pick: (signal) => this.#pick(signal),
        notify: (n) => this.notify(n),
        changed: () => this.#sessionChanged(),
        micMissing: () => {
          this.controller.micMissing = true;
        },
        noticeParams: () => ({ os: d.platform.os, days: this.#settings.retentionDays }),
      }),
    );
  }

  /** Tests only: tells the scripted recorder what to do. */
  scriptRecorder(o: FakeRecorderOptions) {
    this.#holder.script(o);
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
    else if (a === "ink-start") this.controller.showInk();
    else if (a === "ink-end" && !this.controller.pen) this.controller.hideInk();
  }

  // Taking a capture ------------------------------------------------------------------------------------------------------------------------

  #pick(signal: AbortSignal): Promise<Target | null> {
    return this.#targets.pick(signal, this.#session.state.phase === "recording");
  }

  #sessionChanged() {
    this.#place.sessionChanged();
    this.#guards.limit.sync(this.#session.state.phase === "recording");
    this.controller.update();
    this.#d.publish();
  }

  /** A screen that is being recorded was unplugged: the capture so far is saved. */
  #displaysChanged() {
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
    this.#after.send.cancel();
    this.controller.reset();
    this.#guards.writes.reset();
    this.#board.clear();
    const d = displayAt(p.cursor(), p.displays()) ?? p.displays()[0];
    await this.#session.start(s.target === "screen" && d ? { kind: "screen", displayId: d.id } : undefined);
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

  #capsuleHandlers(): Record<CapsuleAction, () => void> {
    return capsuleHandlers({
      controller: this.controller,
      stop: () => this.#session.stop(),
      discard: () => this.discard(),
      open: () => this.#after.open(),
      retry: () => this.#retry(),
      send: this.#after.send,
      sendLast: () => this.#after.sendLast(),
      switchTarget: () => void this.#switch.run(),
      copyLast: (what) => void this.#after.copyLast(what),
    });
  }

  /** Tests only: presses a button of the capsule. */
  pressCapsule(action: CapsuleAction) {
    this.#capsuleHandlers()[action]();
    this.controller.update();
  }

  #fromCapsule(sender: WebContents, action: unknown) {
    const parsed = v.safeParse(CapsuleActionSchema, action);
    if (!parsed.success || !this.controller.owns(sender)) return;
    this.#capsuleHandlers()[parsed.output]();
    this.controller.update();
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
    const external = externalFor(action, this.#d.platform.os, app.getPath("home"));
    if (external) await (external.kind === "url" ? shell.openExternal(external.value) : shell.openPath(external.value));
    else if (action === "open-permissions") await this.#d.platform.openScreenSettings();
    else if (action === "choose-folder") return "folder";
    else if (action === "retry") void this.start();
    this.dismissNotice();
    return "done";
  }

  /** At quit: a recording is stopped and saved, and the returned promise resolves when it is (or after 30 s). Undefined when nothing is running. */
  finishForQuit(): Promise<void> | undefined {
    return finishForQuit(this.#session, QUIT_WAIT_MS);
  }

  dispose() {
    this.#guards.limit.sync(false);
    for (const off of this.#off) off();
    this.#board.dispose();
    this.#session.discard();
    this.#targets.dispose();
    this.controller.dispose();
    this.#holder.dispose();
  }
}
