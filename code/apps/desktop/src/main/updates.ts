import * as v from "valibot";
import { classifyUpdateError, isNewerVersion, type UpdateState } from "../shared/updates";

/** The part of electron-updater's AppUpdater this module drives. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  setFeedURL?(options: { provider: "generic"; url: string }): void;
  on(event: string, listener: (payload: unknown) => void): unknown;
}

/** auto: electron-updater downloads and installs (Windows installer). manual: only announce a newer release (macOS, unsigned). */
export type UpdateMode = "auto" | "manual" | "unsupported";

/** The published releases; must match `publish` in electron-builder.yml (updates.test.ts checks). */
export const RELEASES = { owner: "NourEldinShobier", repo: "speak-kit" } as const;
export const RELEASES_PAGE = `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/`;

export interface UpdateEnv {
  platform: string;
  /** app.isPackaged */
  packaged: boolean;
  /** The portable exe sets PORTABLE_EXECUTABLE_FILE and cannot replace itself. */
  portable: boolean;
  /** SPEAKKIT_USER_DATA is set: a test or smoke run, which must not phone GitHub. */
  isolated: boolean;
  /** SPEAKKIT_UPDATE_URL, already validated by feedOverride. */
  feedUrl: string | undefined;
  /** A fake updater is injected (tests of a source checkout). */
  fake: boolean;
  /** Test switch: behave like macOS. Only passed on an unpackaged app. */
  forceManual: boolean;
}

/** What this copy of the app does about updates. */
export function updateMode(e: UpdateEnv): UpdateMode {
  if (e.forceManual) return "manual";
  if (e.fake) return "auto";
  if (!e.packaged || e.portable) return "unsupported";
  if (e.platform === "darwin") return "manual";
  if (e.platform !== "win32") return "unsupported";
  return e.isolated && !e.feedUrl ? "unsupported" : "auto";
}

/**
 * SPEAKKIT_UPDATE_URL points electron-updater's generic provider at a folder that holds latest.yml and the installer (the local
 * update test, docs/auto-update.md). Anything but an http(s) address is ignored, so the GitHub feed stays the default.
 */
export function feedOverride(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** A release page is only opened when it lives under this project's releases. */
export const isReleaseUrl = (url: string) => url.startsWith(RELEASES_PAGE);

const latestSchema = v.object({ tag_name: v.string(), html_url: v.string() });

/** The newest published (non-draft, non-prerelease) release, from the public GitHub API: no token, no install. */
export async function githubLatestRelease(fetchImpl: typeof fetch): Promise<{ version: string; url: string }> {
  const res = await fetchImpl(`https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "speakkit" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for the latest release`);
  const body = v.safeParse(latestSchema, await res.json());
  if (!body.success || !isReleaseUrl(body.output.html_url)) throw new Error("GitHub sent an unexpected release answer");
  return { version: body.output.tag_name.replace(/^v/, ""), url: body.output.html_url };
}

interface UpdatesDeps {
  mode: UpdateMode;
  /** Version of this running app. */
  currentVersion: string;
  /** Loads electron-updater (auto mode). */
  load(): Promise<UpdaterLike>;
  /** The newest release (manual mode). */
  latestRelease?(): Promise<{ version: string; url: string }>;
  onState(state: UpdateState): void;
  /** Called once when an update has been downloaded. */
  onReady(version: string): void;
  now(): number;
  /** True while a reading or export is running: Restart now then waits for the user's confirmation. */
  busy(): boolean;
  /** Restart now was asked while busy: bring the confirmation up. */
  onBusy(): void;
  /** Quit the app before the installer runs. */
  beforeInstall(): void;
}

/**
 * Update flow on top of electron-updater (GitHub Releases, configured in electron-builder). A found update downloads in the
 * background but is never installed without the user: "Restart now" installs at once, "Install when I quit" sets the
 * installer to run on exit, and doing nothing leaves the current version running. In manual mode (macOS) it only looks up the
 * latest release and reports it.
 */
export class Updates {
  #d: UpdatesDeps;
  #u: UpdaterLike | undefined;
  #state: UpdateState;
  #version = "";

  constructor(deps: UpdatesDeps) {
    this.#d = deps;
    this.#state = deps.mode === "unsupported" ? { kind: "unsupported" } : { kind: "idle", checkedAtMs: null };
  }

  get state(): UpdateState {
    return this.#state;
  }

  #set(s: UpdateState) {
    this.#state = s;
    this.#d.onState(s);
  }

  #fail(message: string) {
    this.#set({ kind: "error", message, reason: classifyUpdateError(message), phase: this.#state.kind === "downloading" ? "download" : "check" });
  }

  async #updater(): Promise<UpdaterLike | null> {
    if (this.#d.mode !== "auto") return null;
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
    on("error", (e: Error) => this.#fail(e.message));
    return u;
  }

  async check(): Promise<void> {
    const k = this.#state.kind;
    if (k === "checking" || k === "downloading" || k === "ready" || k === "restarting") return;
    if (this.#d.mode === "manual") return this.#checkManual();
    const u = await this.#updater();
    if (!u) return;
    this.#set({ kind: "checking" });
    await u.checkForUpdates().catch(() => {}); // failures arrive through the "error" event
  }

  async #checkManual() {
    this.#set({ kind: "checking" });
    try {
      const r = await this.#d.latestRelease!();
      this.#set(isNewerVersion(r.version, this.#d.currentVersion) ? { kind: "manual", version: r.version, url: r.url } : { kind: "idle", checkedAtMs: this.#d.now() });
    } catch (e) {
      this.#fail(e instanceof Error ? e.message : String(e));
    }
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

  /**
   * Restart now: install the downloaded update and reopen. While a reading or export runs it only asks for the confirmation
   * (onBusy), unless the user already confirmed.
   */
  async installNow(confirmed = false): Promise<void> {
    const u = await this.#updater();
    if (!u || this.#state.kind !== "ready") return;
    if (!confirmed && this.#d.busy()) return this.#d.onBusy();
    this.#set({ kind: "restarting", version: this.#version });
    this.#d.beforeInstall();
    u.quitAndInstall(true, true);
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
