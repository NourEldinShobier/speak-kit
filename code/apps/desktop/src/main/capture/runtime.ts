import { BrowserWindow, ipcMain, nativeImage, shell, type WebContents } from "electron";
import { randomBytes } from "node:crypto";
import * as v from "valibot";
import { CAPSULE_ACTION, CAPSULE_HOVER } from "../../shared/capture/channels";
import { CapsuleActionSchema, type CapsuleAction, type CapturePhase, type CopyWhat } from "../../shared/capture/contract";
import { noticeFor, noticeOfError, type Notice, type NoticeAction } from "../../shared/capture/notices";
import type { CaptureConfig } from "../../shared/capture/settings";
import type { Ctx } from "../context";
import { writeCapture } from "./clipboard-out";
import { CaptureController } from "./controller";
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
import type { CaptureRecord } from "./store";
import { capturePage, isProtected, openCapsuleWindow, openOverlayWindow, openRecorderWindow } from "./windows";

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
const NOTICE_MS = 8000;

/** What happens while a capture is on: the session and its recorder window, the picker, the capsule and ink layer, notices and the screenshot. */
export class CaptureRuntime {
  readonly controller: CaptureController;
  readonly #d: RuntimeDeps;
  #session: Session;
  #host: RecorderHost | undefined;
  #picker: PickerFlow | undefined;
  #notice: Notice | undefined;
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  #title = "Screen";
  #bounds: Electron.Rectangle | undefined;
  #last: CaptureRecord | undefined;
  #off: (() => void)[] = [];

  constructor(deps: RuntimeDeps) {
    this.#d = deps;
    this.#session = this.#makeSession();
    this.controller = this.#makeController();
    const onAction = (e: Electron.IpcMainEvent, a: unknown) => this.#fromCapsule(e.sender, a);
    const onHover = (e: Electron.IpcMainEvent, over: unknown) => typeof over === "boolean" && this.controller.owns(e.sender) && this.controller.hover(over);
    ipcMain.on(CAPSULE_ACTION, onAction);
    ipcMain.on(CAPSULE_HOVER, onHover);
    this.#off.push(
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
    return this.#notice;
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
        bundle: d.history.bundle,
        store: d.history.store,
        journal: d.history.journal,
        narrator: d.narrator,
        settings: () => this.#settings,
        hideOwnWindows: (on) => this.#hideOwn(on),
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
      if (!id) return;
      const b = this.#d.history.bundle;
      if (data.kind === "frame") void b.frame(id, data.atMs, data.jpeg);
      else if (data.kind === "video") void b.video(id, data.segment, data.chunk);
      else void b.audio(id, data.chunk);
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

  #titleOf(t: Target): string {
    if (t.kind === "window") return t.title;
    const d = this.#d.platform.displays().find((x) => x.id === t.displayId);
    return t.kind === "area" ? `${d?.name ?? "Screen"} · Area` : (d?.name ?? "Screen");
  }

  #sessionChanged() {
    const t = this.#session.state.target;
    if (t) {
      this.#title = this.#titleOf(t);
      this.#bounds = t.kind === "window" ? undefined : this.#d.platform.displays().find((d) => d.id === t.displayId)?.bounds;
    }
    this.controller.update();
    this.#d.publish();
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
    this.#notice = undefined;
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
      const shot = await takeScreenshot({ platform: p, bundle: history.bundle, store: history.store, title: (t) => this.#titleOf(t), now }, target);
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

  #hideOwn(on: boolean) {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.setContentProtection(on || isProtected(w));
  }

  // The capsule -----------------------------------------------------------------------------------------------------------------------------

  #capsuleHandlers(): Record<CapsuleAction, () => void> {
    const c = this.controller;
    const nothing = () => undefined;
    return {
      pen: () => {
        c.pen = !c.pen;
        if (c.pen) c.showInk();
        else c.hideInk();
      },
      stop: () => this.#session.stop(),
      discard: () => (c.confirmDiscard = true),
      "discard-keep": () => (c.confirmDiscard = false),
      "discard-confirm": () => this.discard(),
      open: () => this.#openLast(),
      retry: () => void this.start(),
      dismiss: () => c.after(undefined),
      "copy-again": () => void this.#copyLast("picture"),
      "copy-path": () => void this.#copyLast("path"),
      // Sending to the voice chat is not part of capture yet.
      send: nothing,
      hold: nothing,
      undo: nothing,
      "send-now": nothing,
      switch: nothing,
    };
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

  /** A failure or a note: it goes to the capsule (errors and warnings) and to the Capture page, where it stays until dismissed or replaced. */
  notify(n: Notice) {
    clearTimeout(this.#noticeTimer);
    this.#notice = n;
    if (n.tone !== "info") this.controller.after({ kind: "failed", notice: n });
    else this.#noticeTimer = setTimeout(() => this.dismissNotice(), NOTICE_MS);
    this.#d.publish();
  }

  dismissNotice() {
    this.#notice = undefined;
    this.controller.after(undefined);
    this.#d.publish();
  }

  async noticeAction(action: NoticeAction): Promise<"folder" | "done"> {
    const mac = this.#d.platform.os === "darwin";
    if (action === "open-audio") await shell.openExternal(mac ? "x-apple.systempreferences:com.apple.preference.sound" : "ms-settings:sound");
    else if (action === "open-permissions") await this.#d.platform.openScreenSettings();
    else if (action === "open-trash") await (mac ? shell.openPath("~/.Trash") : shell.openExternal("shell:RecycleBinFolder"));
    else if (action === "choose-folder") return "folder";
    else if (action === "retry") void this.start();
    this.dismissNotice();
    return "done";
  }

  dispose() {
    for (const off of this.#off) off();
    clearTimeout(this.#noticeTimer);
    this.#session.discard();
    this.#picker?.dispose();
    this.controller.dispose();
    this.#host?.dispose();
  }
}
