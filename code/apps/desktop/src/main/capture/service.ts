import { BrowserWindow, dialog, powerMonitor, type WebContents } from "electron";
import { rm } from "node:fs/promises";
import path from "node:path";
import { CAPTURE_STATUS_EVENT } from "../../shared/capture/channels";
import type { CaptureDetail, CaptureItem, CaptureStatus, CopyWhat } from "../../shared/capture/contract";
import { noticeFor, type NoticeAction } from "../../shared/capture/notices";
import type { CaptureConfig, CapturePatch } from "../../shared/capture/settings";
import { checkPickedFolder } from "../../shared/control/settings-registry";
import type { Ctx } from "../context";
import type { HotkeySource } from "../dictation/types";
import { resyncOnPower } from "../dictation/power-resync";
import { History } from "./history";
import { recorderEditing } from "./zoom/host";
import { lazyClicks } from "./pointer/clicks";
import { CaptureKeys } from "./keys";
import type { CapturePlatform } from "./platform/types";
import type { RecorderHost } from "./recorder-host";
import { makeSheet, type Narrator } from "./recording";
import type { CaptureInbox } from "../voice-chat/capture-inbox";
import { CaptureRuntime } from "./runtime";
import { createMicClaim } from "./mic-claim";
import { applyPatch } from "./settings-patch";

export interface CaptureServiceOptions {
  /** Claims the microphone while a capture records, so the dictation key says who has it instead of opening it twice. */
  micClaim?: ((name: string) => () => void) | undefined;
  dataDir: string;
  distDir: string;
  parent(): BrowserWindow | null;
  platform: CapturePlatform;
  hotkeySource?: (() => Promise<HotkeySource>) | undefined;
  narrator: Narrator;
  inbox: CaptureInbox;
  /** The chord dictation uses, so capture never takes it. */
  dictationHotkey(): string | undefined;
  /** Tests only: a recorder that makes pictures up. */
  recorder?: RecorderHost | undefined;
  test: boolean;
}

const SWEEP_EVERY_MS = 6 * 3_600_000;

/**
 * Screen capture of the desktop app: the settings, the key hooks, the list of captures and the status the pages read. What happens during a capture
 * is in the runtime. Nothing runs (no key hook, no recorder window) until the person turns capture on.
 */
export class CaptureService {
  readonly #ctx: Ctx;
  readonly #o: CaptureServiceOptions;
  readonly history: History;
  readonly keys: CaptureKeys;
  readonly runtime: CaptureRuntime;
  readonly ready: Promise<void>;
  #sweep: ReturnType<typeof setInterval> | undefined;
  #hotkeyFailed = false;
  #hotkeyNote: string | undefined;
  #recovery: CaptureStatus["recovery"];
  readonly #stopPower: () => void;

  constructor(ctx: Ctx, o: CaptureServiceOptions) {
    this.#ctx = ctx;
    this.#o = o;
    this.history = new History({
      folder: () => this.folder,
      log: (l) => ctx.log.info(l),
      now: () => Date.now(),
      sheet: (id, files) => makeSheet({ bundle: this.history.bundle, host: this.runtime.recorder.host, log: (l) => ctx.log.warn(l) }, id, files),
      ...recorderEditing(() => this.runtime.recorder.host),
      trash: o.test ? (dir) => rm(dir, { recursive: true, force: true }) : undefined,
    });
    this.runtime = new CaptureRuntime({
      ctx,
      history: this.history,
      platform: o.platform,
      narrator: o.narrator,
      inbox: o.inbox,
      distDir: o.distDir,
      recorder: o.recorder,
      clicks: o.hotkeySource && lazyClicks(o.hotkeySource, (l) => ctx.log.warn(l)),
      publish: () => void this.#publish(),
      refresh: () => void this.#refresh(),
    });
    this.keys = new CaptureKeys({
      open: o.hotkeySource,
      recording: () => this.runtime.phase === "recording",
      onAction: (a) => this.runtime.act(a),
      onShot: () => void this.runtime.shoot(),
      onRecord: () => void this.runtime.toggleScreenRecording(),
      onReplay: () => this.runtime.replay.save(),
      log: (l) => ctx.log.warn(l),
    });
    this.#stopPower = resyncOnPower(powerMonitor, () => {
      this.keys.resync();
      void this.runtime.replay.rearm();
    });
    this.ready = this.#init();
  }

  get #settings(): CaptureConfig {
    return this.#ctx.config.capture;
  }

  /** Where captures are kept: the folder in settings, else a folder in the app data. */
  get folder(): string {
    return this.#settings.folder || path.join(this.#o.dataDir, "captures");
  }

  async #init() {
    this.#recovery = await this.history.recover();
    await this.#runSweep();
    await this.history.refreshCount();
    this.#sweep = setInterval(() => void this.#runSweep(), SWEEP_EVERY_MS);
    await this.#applyEnabled();
    this.#publish();
  }

  async #runSweep() {
    const days = this.#settings.retentionDays;
    const r = await this.history.sweep(days);
    if (r.removed > 0) this.runtime.notify(noticeFor("cleaned-up", { count: r.removed, days, os: this.#o.platform.os }));
  }

  async #applyEnabled() {
    const s = this.#settings;
    const on = s.enabled && this.#o.platform.supported;
    const ok = await this.keys.apply(on, {
      capture: s.hotkey,
      screenshot: s.experiments.screenshots ? s.screenshotHotkey : undefined,
      recording: s.experiments.recording ? s.recordingHotkey : undefined,
      replay: s.experiments.replay && s.replayBuffer ? s.replayHotkey : undefined,
      shiftInk: s.shiftInk,
    });
    this.#hotkeyFailed = !ok;
    if (!on) {
      this.runtime.discard();
      this.runtime.controller.after(undefined);
    } else if (!ok) this.runtime.notify(noticeFor("hotkey-failed"));
    await this.runtime.replay.sync();
    this.#publish();
  }

  // Status ----------------------------------------------------------------------------------------------------------------------------------

  status(): CaptureStatus {
    const p = this.#o.platform;
    const { runtime } = this;
    return {
      supported: p.supported,
      platform: p.os,
      enabled: this.#settings.enabled,
      hotkeyReady: this.keys.active,
      ...(this.#hotkeyFailed && { hotkeyFailed: true }),
      ...(this.#hotkeyNote && { hotkeyNote: this.#hotkeyNote }),
      ...(this.#settings.enabled && !this.#settings.consented && { consentRequired: true }),
      phase: runtime.phase,
      permission: p.screenPermission(),
      settings: this.#settings,
      folder: this.folder,
      count: this.history.count,
      ...(runtime.notice && { notice: runtime.notice }),
      ...(this.#recovery && { recovery: this.#recovery }),
      narrationReady: this.#o.narrator.ready(),
      ...(runtime.controller.state && { capsule: runtime.controller.state }),
    };
  }

  readonly #mic = createMicClaim((name) => this.#o.micClaim?.(name) ?? (() => undefined));

  #publish(): CaptureStatus {
    const status = this.status();
    this.#mic.sync(this.runtime.phase === "recording", this.#settings.narration);
    const w = this.#o.parent();
    if (w && !w.isDestroyed()) w.webContents.send(CAPTURE_STATUS_EVENT, status);
    return status;
  }

  /** The status with the number of captures read from the list now. */
  async #refresh(): Promise<CaptureStatus> {
    await this.history.refreshCount();
    return this.#publish();
  }

  async statusNow(): Promise<CaptureStatus> {
    await this.ready;
    return this.#refresh();
  }

  // The pages API ---------------------------------------------------------------------------------------------------------------------------

  async setEnabled(on: boolean): Promise<CaptureStatus> {
    this.#settings.enabled = on;
    this.#ctx.saveConfig();
    await this.#applyEnabled();
    return this.#refresh();
  }

  async patchSettings(patch: CapturePatch): Promise<CaptureStatus> {
    const result = applyPatch(this.#settings, patch, { dictationHotkey: this.#o.dictationHotkey(), os: this.#o.platform.os });
    this.#hotkeyNote = result.note;
    this.#ctx.saveConfig();
    if (this.history.changedFolder) {
      this.history.open();
      this.runtime.rebind();
      this.#recovery = await this.history.recover();
    }
    if (result.keysChanged) {
      this.keys.stop();
      await this.#applyEnabled();
    }
    return this.#refresh();
  }

  async chooseFolder(): Promise<CaptureStatus> {
    const parent = this.#o.parent();
    const options: Electron.OpenDialogOptions = { title: "Folder for captures", defaultPath: this.folder, properties: ["openDirectory", "createDirectory"] };
    const r = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    const picked = r.canceled ? undefined : r.filePaths[0];
    if (!picked) return this.#refresh();
    const checked = checkPickedFolder("capture", picked);
    if (!checked.ok) throw new Error(checked.message);
    return this.patchSettings(checked.patch as CapturePatch);
  }

  async start(): Promise<CaptureStatus> {
    await this.runtime.start();
    return this.status();
  }

  stop(): CaptureStatus {
    this.runtime.stop();
    return this.status();
  }

  discard(): CaptureStatus {
    this.runtime.discard();
    return this.status();
  }

  dismissNotice(): CaptureStatus {
    this.runtime.dismissNotice();
    return this.status();
  }

  dismissRecovery(): CaptureStatus {
    this.#recovery = undefined;
    return this.#publish();
  }

  async noticeAction(action: NoticeAction): Promise<CaptureStatus> {
    return (await this.runtime.noticeAction(action)) === "folder" ? this.chooseFolder() : this.status();
  }

  async list(search: string): Promise<{ items: CaptureItem[]; total: number }> {
    await this.ready;
    return this.history.list(search);
  }

  detail(id: string): Promise<CaptureDetail | null> {
    return this.history.detail(id);
  }

  copy(id: string, what: CopyWhat): Promise<boolean> {
    return this.history.copy(id, what);
  }

  reveal(id: string): Promise<void> {
    return this.history.reveal(id);
  }

  source(id: string, file: string) {
    return this.history.source(id, file);
  }

  async saveEdit(id: string, file: string, png: Uint8Array): Promise<boolean> {
    const ok = await this.history.saveEdit(id, file, png);
    if (ok) void this.#refresh();
    return ok;
  }

  async trim(id: string, startMs: number, endMs: number): Promise<boolean> {
    const ok = await this.history.trim(id, startMs, endMs);
    if (ok) void this.#refresh();
    return ok;
  }

  async zoom(id: string, regions: Parameters<History["zoom"]>[1]): Promise<boolean> {
    const ok = await this.history.zoom(id, regions);
    if (ok) void this.#refresh();
    return ok;
  }

  suggestZoom(id: string) {
    return this.history.suggestZoom(id);
  }

  async remove(id: string): Promise<void> {
    await this.history.remove(id);
    void this.#refresh();
  }

  /** Tests only: the inbox of captures sent to the voice chat. */
  testInbox() {
    return this.#o.inbox;
  }

  /** Whether this webContents is the capsule page. */
  owns(contents: WebContents): boolean {
    return this.runtime.controller.owns(contents);
  }

  /** Tests only: what the capsule and the files hold. */
  async testState() {
    return { session: this.runtime.state, capsule: this.runtime.controller.state, items: await this.history.store.list(), notice: this.runtime.notice };
  }

  /** See the runtime: saves what is recording at quit. */
  finishForQuit(): Promise<void> | undefined {
    return this.runtime.finishForQuit();
  }

  dispose() {
    this.#stopPower();
    if (this.#sweep) clearInterval(this.#sweep);
    this.keys.stop();
    this.#mic.release();
    this.runtime.dispose();
  }
}
