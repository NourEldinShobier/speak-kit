import { desktopCapturer, screen, type BrowserWindow, type IpcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CAPSULE_ACTION,
  CAPSULE_DRAG,
  CAPSULE_INTERACTIVE,
  CAPSULE_READY,
  CAPSULE_STATE,
  MREC_CHUNK,
  MREC_COMMAND,
  MREC_ENDED,
  MREC_LEVEL,
  MREC_READY,
  MREC_REPLY,
} from "../../shared/meetings/channels";
import { CapsuleActionSchema, RecReplySchema, type CapsuleAction, type RecCommand, type RecResult } from "../../shared/meetings/contract";
import * as v from "valibot";
import { createSecureWindow } from "../secure-window";
import { HiddenPage, type PageHandle } from "../transcripts/hidden-page";
import { CAPSULE_SIZE, type CapsuleWindow } from "./capsule";

const handle = (w: BrowserWindow): PageHandle => ({
  contents: w.webContents,
  destroy: () => !w.isDestroyed() && w.destroy(),
  get destroyed() {
    return w.isDestroyed();
  },
});

const page = (distDir: string, name: string) => pathToFileURL(path.join(distDir, "../renderer", `${name}.html`)).href;

export interface RecorderPort {
  start(o: { micDevice: string; system: boolean }): Promise<RecResult>;
  stop(): Promise<void>;
  reopenSystem(): Promise<RecResult>;
  devices(): Promise<RecResult>;
  onChunk(cb: (track: "you" | "them", pcm: Int16Array, atSec: number) => void): void;
  onLevel(cb: (track: "you" | "them", n: number) => void): void;
  onEnded(cb: (track: "you" | "them") => void): void;
  dispose(): void;
}

const isTrack = (t: unknown): t is "you" | "them" => t === "you" || t === "them";

/**
 * The hidden recording page: the microphone and, where the system offers it, the sound the computer plays (loopback), in a window and a session of their
 * own. The page may use the microphone and display capture; no other page of the app gets either. The loopback is taken with a throwaway screen source
 * whose picture is discarded by the page, because getDisplayMedia needs a video source to hand out audio.
 */
export function createRecorderHost(o: { ipcMain: IpcMain; distDir: string; micAllowed(): boolean }): RecorderPort {
  const lost: RecResult = { ok: false, code: "mic-failed" };
  let onChunk: Parameters<RecorderPort["onChunk"]>[0] = () => {};
  let onLevel: Parameters<RecorderPort["onLevel"]>[0] = () => {};
  let onEnded: Parameters<RecorderPort["onEnded"]>[0] = () => {};
  const host = new HiddenPage<RecCommand, RecResult>({
    ipcMain: o.ipcMain,
    channels: { command: MREC_COMMAND, reply: MREC_REPLY, ready: MREC_READY },
    reply: RecReplySchema as never,
    lost,
    open: () => {
      const w = createSecureWindow({ show: false, width: 320, height: 200, webPreferences: { partition: "speakkit-meetings-recorder", backgroundThrottling: false } }, () => {});
      const { session } = w.webContents;
      const id = w.webContents.id;
      const allowed = (p: string) => p === "media" || p === "display-capture";
      session.setPermissionRequestHandler((...[contents, permission, callback]) => callback(contents.id === id && allowed(permission) && o.micAllowed()));
      session.setPermissionCheckHandler((...[contents, permission]) => !!contents && contents.id === id && allowed(permission) && o.micAllowed());
      session.setDisplayMediaRequestHandler((_request, callback) => {
        void desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } }).then(
          (sources) => callback(sources[0] ? { video: sources[0], audio: "loopback" } : {}),
          () => callback({}),
        );
      });
      void w.loadURL(page(o.distDir, "mrecorder")).catch(() => {
        // A page that cannot load never says it is ready; the host drops the window and the recording reports the microphone as failed.
      });
      return handle(w);
    },
  });
  host.on(MREC_CHUNK, (track, pcm, at) => isTrack(track) && pcm instanceof Int16Array && typeof at === "number" && Number.isFinite(at) && onChunk(track, pcm, Math.max(0, at)));
  host.on(MREC_LEVEL, (track, n) => isTrack(track) && typeof n === "number" && Number.isFinite(n) && onLevel(track, Math.min(1, Math.max(0, n))));
  host.on(MREC_ENDED, (track) => isTrack(track) && onEnded(track));
  return {
    start: ({ micDevice, system }) => host.call({ op: "start", micDevice, system } as never, 15_000),
    async stop() {
      await host.call({ op: "stop" } as never, 10_000);
      host.close(); // the microphone closes with the window
    },
    reopenSystem: () => host.call({ op: "reopen-system" } as never, 10_000),
    devices: () => host.call({ op: "devices" } as never, 10_000),
    onChunk: (cb) => (onChunk = cb),
    onLevel: (cb) => (onLevel = cb),
    onEnded: (cb) => (onEnded = cb),
    dispose: () => host.dispose(),
  };
}

export interface CapsuleEvents {
  action(a: CapsuleAction): void;
  interactive(on: boolean): void;
  drag(dx: number, dy: number, end: boolean): void;
}

/**
 * The capsule window: transparent, always on top, never takes keyboard focus, hidden from screen captures, and click-through until the page says the pointer is on
 * the pill. The page's messages are accepted only from this window.
 */
export function createCapsuleWindow(o: { ipcMain: IpcMain; distDir: string; events: CapsuleEvents }): () => CapsuleWindow {
  let current: BrowserWindow | undefined;
  const from = (e: { sender: unknown }) => !!current && !current.isDestroyed() && e.sender === current.webContents;
  o.ipcMain.on(CAPSULE_ACTION, (e, raw: unknown) => {
    const a = v.safeParse(CapsuleActionSchema, raw);
    if (from(e) && a.success) o.events.action(a.output as CapsuleAction);
  });
  o.ipcMain.on(CAPSULE_INTERACTIVE, (e, on: unknown) => from(e) && typeof on === "boolean" && o.events.interactive(on));
  o.ipcMain.on(CAPSULE_DRAG, (e, dx: unknown, dy: unknown, end: unknown) => {
    if (from(e) && typeof dx === "number" && typeof dy === "number" && Number.isFinite(dx) && Number.isFinite(dy) && typeof end === "boolean") o.events.drag(dx, dy, end);
  });
  return () => {
    const w = createSecureWindow(
      {
        ...CAPSULE_SIZE,
        show: false,
        frame: false,
        transparent: true,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        backgroundColor: "#00000000",
      },
      () => {},
    );
    current = w;
    w.setContentProtection(true);
    w.setAlwaysOnTop(true, "screen-saver");
    let ready = false;
    const queued: (() => void)[] = [];
    o.ipcMain.once(CAPSULE_READY, (e) => {
      if (e.sender !== w.webContents) return;
      ready = true;
      queued.splice(0).forEach((f) => f());
    });
    void w.loadURL(page(o.distDir, "meeting-capsule")).catch(() => {
      if (!w.isDestroyed()) w.destroy();
    });
    const when = (f: () => void) => (ready ? f() : void queued.push(f));
    return {
      setPosition: (x, y) => !w.isDestroyed() && w.setPosition(Math.round(x), Math.round(y)),
      position: () => {
        const [x, y] = w.getPosition();
        return { x: x ?? 0, y: y ?? 0 };
      },
      setClickThrough: (on) => !w.isDestroyed() && w.setIgnoreMouseEvents(on, { forward: true }),
      send: (view) => when(() => !w.isDestroyed() && w.webContents.send(CAPSULE_STATE, view)),
      show: () => !w.isDestroyed() && w.showInactive(),
      hide: () => !w.isDestroyed() && w.hide(),
      destroy: () => !w.isDestroyed() && w.destroy(),
      get destroyed() {
        return w.isDestroyed();
      },
    };
  };
}

/** The monitors as the placement logic sees them: the primary first. */
export function displaysNow() {
  const primary = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => Number(b.id === primary) - Number(a.id === primary))
    .map((d) => ({ id: d.id, workArea: d.workArea }));
}
