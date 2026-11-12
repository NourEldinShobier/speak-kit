import { app, ipcMain, nativeImage, shell, type WebContents } from "electron";
import { randomBytes } from "node:crypto";
import * as v from "valibot";
import { CAPSULE_ACTION, CAPSULE_HOVER } from "../../shared/capture/channels";
import { CapsuleActionSchema, type CapsuleAction, type CapturePhase, type CopyWhat } from "../../shared/capture/contract";
import { noticeFor, noticeOfError, type Notice, type NoticeAction } from "../../shared/capture/notices";
import type { CaptureConfig } from "../../shared/capture/settings";
import type { Ctx } from "../context";
import { writeStreamed } from "./bundle";
import { capsuleHandlers } from "./capsule-actions";
import { writeCapture } from "./clipboard-out";
import { CaptureController } from "./controller";
import { NoticeBoard } from "./notice-board";
import type { FakeRecorderOptions } from "./fake";
import type { GestureAction } from "./gesture";
import type { History } from "./history";
import { displayAt, remember } from "./picker";
import { createPickerFlow, type PickerFlow } from "./picker/flow";
import type { CapturePlatform } from "./platform/types";
import { createRecorderHost, type RecorderHost } from "./recorder-host";
import { createSessionPorts, type Narrator } from "./recording";
import { takeScreenshot } from "./screenshot";
import { createSession, type Session, type Target } from "./session";
import { externalFor } from "./notice-target";
import { displayOfTarget, lostDisplay, titleOfTarget } from "./target-display";
import { createLimitTimer, MAX_CAPTURE_MS } from "./time-limit";
import { createWriteGuard, type WriteGuard } from "./write-guard";
import type { CaptureRecord } from "./store";
import { capturePage, hideOwnWindows, openCapsuleWindow, openOverlayWindow, openRecorderWindow } from "./windows";

export interface RuntimeDeps {
  ctx: Ctx;
  history: History;
  platform: CapturePlatform;
  narrator: Narrator;
  distDir: string;
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
  #host: RecorderHost | undefined;
  #picker: PickerFlow | undefined;
  readonly #board: NoticeBoard;
  #title = "Screen";
  #bounds: Electron.Rectangle | undefined;
  #last: CaptureRecord | undefined;
  #off: (() => void)[] = [];
  readonly #writes: WriteGuard;
  readonly #limit = createLimitTimer({
    ms: MAX_CAPTURE_MS,
    onLimit: () => {
      if (this.#session.state.phase !== "recording") return;
      this.notify(noticeFor("time-limit"));
      this.#session.stop();
    },
  });

  constructor(deps: RuntimeDeps) {
    this.#d = deps;
    this.#board = new NoticeBoard({ showInCapsule: (n) => this.controller.after(n && { kind: "failed", notice: n }), publish: () => deps.publish() });
    this.#writes = createWriteGuard({
      notify: (n) => this.notify(n),
      log: (l) => deps.ctx.log.warn(l),
      params: () => ({ os: deps.platform.os }),
      onFirstFailure: () => this.#session.state.phase === "recording" && this.#session.stop(),
    });
    this.#session = this.#makeSession();
    this.controller = this.#makeController();
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
      title: () => this.#title,
      displayBounds: () => this.#bounds ?? platform.displays()[0]?.bounds ?? { x: 0, y: 0, width: 1280, height: 800 },
      settings: () => this.#settings,
      now,
      changed: () => this.#d.publish(),
    });
  }

  #makeSession(): Session {
    const d = this.#d;
    const host = () => (this.#host ??= this.#openHost());
    return createSession(
      createSessionPorts({
        platform: d.platform,
        get host() {
          return host();
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
        delivery: { copy: (text, sheet) => void writeCapture(text, sheet && nativeImage.createFromBuffer(sheet)), saved: (r) => this.#saved(r) },
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

  #openHost(): RecorderHost {
    const page = () => openRecorderWindow(capturePage(this.#d.distDir, "capture-recorder"), () => this.#settings.narration);
    const host = this.#d.recorder ?? createRecorderHost({ ipcMain, open: page, timeoutMs: 10_000 });
    host.onData((data) => {
      const id = this.#session.state.id;
      if (!id || this.#writes.failures > 0) return; // the disk is refusing: do not queue more
      this.#writes.watch(writeStreamed(this.#d.history.bundle, id, data));
    });
    return host;
  }

  /** Tests only: tells the scripted recorder what to do. */
  scriptRecorder(o: FakeRecorderOptions) {
    const fake = this.#d.recorder as { options?: FakeRecorderOptions } | undefined;
    if (fake?.options) Object.assign(fake.options, o);
  }

  /** The folder changed: a new session on the new files. */
  rebind() {
    this.#session.discard();
    this.#session = this.#makeSession();
  }

  act(a: GestureAction) {
    if (a === "start") void this.start();
    else if (a === "stop") this.#session.stop();
    else if (a === "ink-start") this.controller.showInk();
    else if (a === "ink-end" && !this.controller.pen) this.controller.hideInk();
  }

  // Taking a capture ------------------------------------------------------------------------------------------------------------------------

  /** The picker over every display. A choice is remembered per display; Esc and a closed picker are a clean exit. */
  async #pick(signal: AbortSignal): Promise<Target | null> {
    const { platform: p, distDir } = this.#d;
    this.#picker ??= createPickerFlow({
      ipcMain,
      displays: () => p.displays(),
      windows: () => p.windows(),
      open: (display) => openOverlayWindow(capturePage(distDir, "capture-overlay"), display.bounds),
      lastTargets: () => this.#settings.lastTargets,
      windowPicker: p.windowPicker,
    });
    const target = await this.#picker.pick(signal, this.#session.state.phase === "recording");
    if (target) this.#remember(target);
    return target;
  }

  #remember(t: Target) {
    const p = this.#d.platform;
    const id = t.kind === "window" ? displayAt(p.cursor(), p.displays())?.id : t.displayId;
    if (!id) return;
    this.#settings.lastTargets = remember(this.#settings.lastTargets, id, t.kind);
    this.#d.ctx.saveConfig();
  }

  #sessionChanged() {
    const t = this.#session.state.target;
    if (t) {
      this.#title = titleOfTarget(t, this.#d.platform.displays());
      this.#bounds = undefined;
      void this.#placeOnTarget(t);
    }
    this.#limit.sync(this.#session.state.phase === "recording");
    this.controller.update();
    this.#d.publish();
  }

  /** The capsule and the ink layer go to the display that is recorded; for a window that is the display it is on. */
  async #placeOnTarget(t: Target) {
    const windows = t.kind === "window" ? await this.#d.platform.windows().catch(() => []) : [];
    if (this.#session.state.target !== t) return;
    this.#bounds = displayOfTarget(t, this.#d.platform.displays(), windows)?.bounds;
    this.controller.relocate();
  }

  /** A screen that is being recorded was unplugged: the capture so far is saved. */
  #displaysChanged() {
    const { phase, target } = this.#session.state;
    if (phase !== "recording" || !target || !lostDisplay(target, this.#d.platform.displays())) return;
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
    this.controller.reset();
    this.#writes.reset();
    this.#board.clear();
    const d = displayAt(p.cursor(), p.displays()) ?? p.displays()[0];
    await this.#session.start(s.target === "screen" && d ? { kind: "screen", displayId: d.id } : undefined);
  }

  stop() {
    this.#session.stop();
  }

  discard() {
    this.#session.discard();
    this.controller.reset();
    this.controller.update();
  }

  /** The screenshot of the experiment: pick, take one picture, copy it, show the corner card. */
  async shoot(): Promise<void> {
    const { platform: p, history, ctx } = this.#d;
    const s = this.#settings;
    if (!s.enabled || !s.experiments.screenshots || this.#session.state.phase !== "idle") return;
    if (p.screenPermission() === "denied") return this.notify(noticeFor("permission-denied", { os: p.os }));
    try {
      const target = await this.#pick(new AbortController().signal);
      if (!target) return;
      const shot = await takeScreenshot({ platform: p, bundle: history.bundle, store: history.store, title: (t) => titleOfTarget(t, p.displays()), now }, target);
      if (!shot.ok) return this.notify(noticeFor("nothing-recorded"));
      await writeCapture("", shot.image);
      this.#last = shot.record;
      this.#title = shot.record.title;
      this.controller.after({ kind: "shot", what: "Copied picture" }, 6000);
      this.#d.refresh();
    } catch (e) {
      ctx.log.warn(`screenshot failed: ${String(e)}`);
      this.notify(noticeOfError(e, { os: p.os }));
    }
  }

  #saved(record: CaptureRecord) {
    this.#last = record;
    this.controller.after({ kind: "saved", what: record.words?.length ? "Copied picture and text" : "Copied picture" });
    this.#d.refresh();
  }

  // The capsule -----------------------------------------------------------------------------------------------------------------------------

  #capsuleHandlers(): Record<CapsuleAction, () => void> {
    return capsuleHandlers({
      controller: this.controller,
      stop: () => this.#session.stop(),
      discard: () => this.discard(),
      open: () => this.#openLast(),
      retry: () => void this.start(),
      copyLast: (what) => void this.#copyLast(what),
    });
  }

  #fromCapsule(sender: WebContents, action: unknown) {
    const parsed = v.safeParse(CapsuleActionSchema, action);
    if (!parsed.success || !this.controller.owns(sender)) return;
    this.#capsuleHandlers()[parsed.output]();
    this.controller.update();
  }

  #openLast() {
    this.#d.ctx.showWindow();
    this.#d.ctx.sendUi({ type: "nav", page: "capture" });
    this.controller.after(undefined);
  }

  async #copyLast(what: CopyWhat) {
    if (this.#last) await this.#d.history.copy(this.#last.id, what);
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
    const { phase } = this.#session.state;
    if (phase === "recording") this.#session.stop();
    else if (phase !== "finishing") return undefined;
    return Promise.race([this.#session.idle(), new Promise<void>((r) => setTimeout(r, QUIT_WAIT_MS))]);
  }

  dispose() {
    this.#limit.sync(false);
    for (const off of this.#off) off();
    this.#board.dispose();
    this.#session.discard();
    this.#picker?.dispose();
    this.controller.dispose();
    this.#host?.dispose();
  }
}
