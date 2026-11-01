import type { UpdateState } from "../shared/updates";

/** The part of electron-updater's AppUpdater this module drives. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (payload: unknown) => void): unknown;
}

interface UpdatesDeps {
  /** False on builds that cannot update (development, portable): the state stays "unsupported". */
  supported: boolean;
  /** Loads electron-updater. */
  load(): Promise<UpdaterLike>;
  onState(state: UpdateState): void;
  /** Called once when an update has been downloaded. */
  onReady(version: string): void;
  now(): number;
  /** Quit the app before the installer runs. */
  beforeInstall(): void;
}

/**
 * Update flow on top of electron-updater (GitHub Releases, configured in electron-builder). A found update downloads in the
 * background but is never installed without the user: "Restart now" installs at once, "Install when I quit" sets the
 * installer to run on exit, and doing nothing leaves the current version running.
 */
export class Updates {
  #d: UpdatesDeps;
  #u: UpdaterLike | undefined;
  #state: UpdateState;
  #version = "";

  constructor(deps: UpdatesDeps) {
    this.#d = deps;
    this.#state = deps.supported ? { kind: "idle", checkedAtMs: null } : { kind: "unsupported" };
  }

  get state(): UpdateState {
    return this.#state;
  }

  #set(s: UpdateState) {
    this.#state = s;
    this.#d.onState(s);
  }

  async #updater(): Promise<UpdaterLike | null> {
    if (!this.#d.supported) return null;
    if (this.#u) return this.#u;
    const u = (this.#u = await this.#d.load());
    u.autoDownload = false;
    u.autoInstallOnAppQuit = false;
    const on = u.on.bind(u) as (e: string, l: (x: never) => void) => void;
    on("update-available", (info: { version: string }) => {
      this.#version = info.version;
      this.#set({ kind: "available", version: info.version });
    });
    on("update-not-available", () => this.#set({ kind: "idle", checkedAtMs: this.#d.now() }));
    on("download-progress", (p: { percent: number }) => this.#set({ kind: "downloading", version: this.#version, percent: Math.round(p.percent) }));
    on("update-downloaded", (info: { version: string }) => {
      this.#version = info.version;
      this.#set({ kind: "ready", version: info.version, onQuit: false });
      this.#d.onReady(info.version);
    });
    on("error", (e: Error) => this.#set({ kind: "error", message: e.message }));
    return u;
  }

  async check(): Promise<void> {
    if (this.#state.kind === "checking" || this.#state.kind === "downloading" || this.#state.kind === "ready") return;
    const u = await this.#updater();
    if (!u) return;
    this.#set({ kind: "checking" });
    await u.checkForUpdates().catch(() => {}); // failures arrive through the "error" event
  }

  /** Check, and fetch the update in the background when there is one. */
  async checkAndDownload(): Promise<void> {
    await this.check();
    if (this.#state.kind === "available") await this.download();
  }

  async download(): Promise<void> {
    const u = await this.#updater();
    if (!u || this.#state.kind !== "available") return;
    this.#set({ kind: "downloading", version: this.#version, percent: 0 });
    await u.downloadUpdate().catch(() => {});
  }

  /** Restart now: install the downloaded update and reopen. */
  async installNow(): Promise<void> {
    const u = await this.#updater();
    if (!u || this.#state.kind !== "ready") return;
    this.#set({ kind: "restarting", version: this.#version });
    this.#d.beforeInstall();
    u.quitAndInstall(false, true);
  }

  /** The installer runs when the user quits; nothing else changes. */
  async installOnQuit(): Promise<void> {
    const u = await this.#updater();
    if (u && this.#state.kind === "ready") {
      u.autoInstallOnAppQuit = true;
      this.#set({ ...this.#state, onQuit: true });
    }
  }
}
