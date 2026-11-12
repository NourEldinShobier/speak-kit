import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { nodeBuild } from "../../apps/desktop/node-build";
import { VK } from "../../apps/desktop/src/main/dictation/types";
import { createForeground } from "../../apps/desktop/src/main/dictation/windows/foreground";
import { loadWin32, type KeyInput, type Win32 } from "../../apps/desktop/src/main/dictation/windows/native";
import type { DictationBridge, DictationMethod, DictationStatus, HudView } from "../../apps/desktop/src/shared/dictation/contract";
import { _electron, appDir, electronPath, launch, removeDir, type Launched } from "../../apps/desktop/tests/harness";

/**
 * Dictation against real Windows. This process plays the person: it presses the dictation key with SendInput and watches which window is in front.
 * Three programs take part: Speak Kit (real key hook, real microphone window fed from a wav file, scripted speech engine), a second Electron app that
 * stands in for the program being dictated into, and this test.
 */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(f: () => Promise<T> | T, what: string, ms = 10_000): Promise<NonNullable<T>> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const v = await f();
    if (v) return v as NonNullable<T>;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const KEYUP = 0x2;
const SCANCODE = 0x8;
const EXTENDED = 0x1;

/** A 440 Hz tone, 16 kHz mono, long enough to outlast any recording the tests make. Chromium loops it as the microphone. */
export function writeToneWav(file: string, seconds = 20): void {
  const rate = 16_000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), 44 + i * 2);
  writeFileSync(file, buf);
}

export interface Hook {
  hotkeyActive(): boolean;
  /** Whether the level meter is holding the microphone open. */
  meterOn(): boolean;
  hud(): HudView | null;
  state(): { status: string };
  status(): DictationStatus;
  say(text: string): void;
  failTranscription(on: boolean): void;
  setInstalled(id: string, on: boolean): Promise<void>;
  finishDownload(): void;
  denyMic(on: boolean): void;
  showHud(view: HudView): void;
  calls(): { language: string; samples: number; peak: number }[];
}

export class DictationRig {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly launched: Launched;
  readonly target: ElectronApplication;
  readonly targetPage: Page;
  readonly targetPid: number;
  readonly w: Win32;
  readonly dirs: string[];

  constructor(init: { launched: Launched; target: ElectronApplication; targetPage: Page; targetPid: number; w: Win32; dirs: string[] }) {
    this.launched = init.launched;
    this.app = init.launched.app;
    this.page = init.launched.page;
    this.target = init.target;
    this.targetPage = init.targetPage;
    this.targetPid = init.targetPid;
    this.w = init.w;
    this.dirs = init.dirs;
  }

  // ---- keys ----
  key(vk: number, up: boolean, extended = false): KeyInput {
    const scan = extended ? 0 : this.w.mapVirtualKey(vk, this.w.keyboardLayout(0));
    return { type: 1, u: { ki: { wVk: vk, wScan: scan, dwFlags: (up ? KEYUP : 0) | (extended ? EXTENDED : 0) | (scan ? SCANCODE : 0), time: 0, dwExtraInfo: 0 } } };
  }
  /** Right Ctrl, the default dictation key. */
  down = () => this.w.sendInput([this.key(VK.rightCtrl, false, true)]);
  up = () => this.w.sendInput([this.key(VK.rightCtrl, true, true)]);
  async tap(holdMs = 40) {
    this.down();
    await sleep(holdMs);
    this.up();
  }
  /** Any key, down and up. */
  press = (vk: number) => this.w.sendInput([this.key(vk, false), this.key(vk, true)]);

  // ---- what the app and the target say ----
  hook<K extends keyof Hook>(name: K, ...args: Parameters<Hook[K]>): Promise<Awaited<ReturnType<Hook[K]>>> {
    return this.app.evaluate(
      (_e, [n, a]) => (globalThis as unknown as { __speakkit: { dictation: Record<string, (...x: unknown[]) => unknown> } }).__speakkit.dictation[n as string]!(...(a as unknown[])),
      [name, args] as const,
    ) as never;
  }
  typed = () => this.targetPage.evaluate(() => (document.getElementById("t") as HTMLTextAreaElement).value);
  keysSeen = () => this.targetPage.evaluate(() => (window as unknown as { keys: { code: string }[] }).keys.map((k) => k.code));
  fgPid = () => createForeground(this.w).info()?.pid;
  /** The dictation windows by page address: the HUD pill and the hidden microphone page. */
  windows = () => this.app.windows().filter((p) => /hud\.html|recorder\.html/.test(p.url()));
  hudPage = () => this.app.windows().find((p) => p.url().includes("hud.html"));
  hudWindowInfo = () =>
    this.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().includes("hud.html"))
        .map((w) => ({ visible: w.isVisible(), focused: w.isFocused(), focusable: w.isFocusable(), alwaysOnTop: w.isAlwaysOnTop() })),
    );

  /** Puts a text on the clipboard of the target program (the person's own clipboard), and reads it back. */
  setClipboard = (text: string) => this.target.evaluate(({ clipboard }, t) => clipboard.writeText(t), text);
  clipboard = () => this.target.evaluate(({ clipboard }) => clipboard.readText());

  /** Brings the target window to the front and empties its field. */
  async focusTarget() {
    for (let i = 0; i < 12 && this.fgPid() !== this.targetPid; i++) {
      await this.target.evaluate(() => (globalThis as unknown as { __target: { raise(): void } }).__target.raise());
      await sleep(300);
    }
    if (this.fgPid() !== this.targetPid) throw new Error("the target window did not come to the front");
    await this.targetPage.evaluate(() => {
      const t = document.getElementById("t") as HTMLTextAreaElement;
      t.value = "";
      t.focus();
      (window as unknown as { keys: unknown[] }).keys = [];
    });
  }

  /** Calls the dictation bridge of the Speak Kit window (`window.speakkitDictation`), as its pages do. */
  bridge<K extends DictationMethod>(method: K, ...args: Parameters<DictationBridge[K]>): Promise<Awaited<ReturnType<DictationBridge[K]>>> {
    return this.page.evaluate(([m, a]) => (window as unknown as { speakkitDictation: Record<string, (...x: unknown[]) => unknown> }).speakkitDictation[m as string]!(...(a as unknown[])), [
      method,
      args,
    ] as const) as never;
  }

  async close() {
    this.up(); // a failed test must not leave the key held on the real keyboard
    await Promise.all([this.launched.cleanup(), this.target.close().catch(() => undefined)]);
    await Promise.all(this.dirs.map(removeDir));
  }
}

export interface RigOptions {
  /** Starting `dictation` section of config.json. */
  dictation?: Record<string, unknown>;
  env?: Record<string, string>;
  /** A recording to use as the microphone instead of the test tone. */
  wav?: string;
  /** Files to put in the app's data folder before it starts (a saved history, say). */
  files?: Record<string, string>;
}

let built: Promise<string> | undefined;
const buildTarget = () =>
  (built ??= (async () => {
    const out = path.join(appDir, "dist-dictation-app");
    await nodeBuild("tests/support/dictation-target.ts", out, "es", "target.js", { empty: false });
    return out;
  })());

/** Starts the target program and Speak Kit with dictation turned on, and waits until the hotkey is live. */
export async function startRig(opts: RigOptions = {}): Promise<DictationRig> {
  const dirs: string[] = [];
  const temp = (name: string) => {
    const d = mkdtempSync(path.join(tmpdir(), name));
    dirs.push(d);
    return d;
  };
  let wav = path.join(temp("speakkit-mic-"), "tone.wav");
  mkdirSync(path.dirname(wav), { recursive: true });
  if (opts.wav) wav = opts.wav;
  else writeToneWav(wav);
  const out = await buildTarget();
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "ELECTRON_RUN_AS_NODE"));
  const target = await _electron.launch({ executablePath: electronPath, args: [path.join(out, "target.js"), `--user-data-dir=${temp("speakkit-target-")}`], env });
  const targetPage = await target.firstWindow();
  await until(() => target.evaluate(() => "__target" in globalThis), "the target program");
  const targetPid = await target.evaluate(() => process.pid);
  const userData = temp("speakkit-desktop-");
  for (const [name, text] of Object.entries(opts.files ?? {})) writeFileSync(path.join(userData, name), text);
  const launched = await launch({
    userData,
    config: { setupDone: true, setupSkipped: false, preferredPort: 0, dictation: { enabled: true, ...opts.dictation } },
    env: { SPEAKKIT_TEST: "1", SPEAKKIT_FAKE_MIC: wav, ...opts.env },
  });
  const rig = new DictationRig({ launched, target, targetPage, targetPid, w: await loadWin32(), dirs });
  if (opts.dictation?.enabled !== false) await until(() => rig.hook("hotkeyActive"), "the hotkey hook");
  return rig;
}

export { VK };
