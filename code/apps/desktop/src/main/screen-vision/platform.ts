import { BrowserWindow, desktopCapturer, screen, systemPreferences, type Display, type NativeImage } from "electron";
import type { Shot, ScreenPlatform } from "./look";
import { loadWindowApi, type WindowApi } from "./native";
import type { Bitmap, DisplayInfo, WindowInfo } from "./plan";

/** After the windows are excluded the compositor needs a frame or two before a capture leaves them out. */
const HIDE_SETTLE_MS = 120;

/** Windows that stay out of every capture (the card, the indicator): they are never switched back. */
export const keepProtected = new WeakSet<BrowserWindow>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function shotOf(image: NativeImage): Shot {
  const { width, height } = image.getSize();
  return {
    width,
    height,
    crop: (r) => shotOf(image.crop({ x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, width - r.x), height: Math.min(r.height, height - r.y) })),
    png: () => image.toPNG(),
    jpeg: (w, h, quality) => (w === width && h === height ? image : image.resize({ width: w, height: h, quality: "best" })).toJPEG(quality),
    small: (w, h): Bitmap => ({ width: w, height: h, bgra: image.resize({ width: w, height: h, quality: "good" }).toBitmap() }),
  };
}

/** Runs `run` with Speak Kit's own windows excluded from capture; windows that stay protected are left as they were. */
async function withOwnWindowsHidden<T>(run: () => Promise<T>): Promise<T> {
  const windows = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed());
  for (const b of windows) b.setContentProtection(true);
  await sleep(HIDE_SETTLE_MS);
  try {
    return await run();
  } finally {
    for (const b of windows) if (!b.isDestroyed() && !keepProtected.has(b)) b.setContentProtection(false);
  }
}

/**
 * The platform of macOS: the whole screen through desktopCapturer, which asks for Screen Recording permission the first time. There is no window list
 * (positions need a native call), so a look at the window answers "no window" and a look at the screen works. A denied permission fails the capture
 * instead of returning a picture of the wallpaper.
 */
export function createMacPlatform(): ScreenPlatform {
  return {
    supported: true,
    displays: () => screen.getAllDisplays().map((d): DisplayInfo => ({ id: String(d.id), bounds: d.bounds })),
    cursor: () => screen.getCursorScreenPoint(),
    windows: async () => [],
    foreground: () => undefined,
    async grab(display) {
      const status = systemPreferences.getMediaAccessStatus("screen");
      if (status === "denied" || status === "restricted") throw new Error("screen recording is not allowed");
      const scale = screen.getAllDisplays().find((d) => String(d.id) === display.id)?.scaleFactor ?? 1;
      const width = Math.round(display.bounds.width * scale);
      const height = Math.round(display.bounds.height * scale);
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
      const source = sources.find((s) => s.display_id === display.id);
      if (!source || source.thumbnail.isEmpty()) throw new Error("no picture of the display");
      return shotOf(source.thumbnail);
    },
    hideOwnWindows: withOwnWindowsHidden,
  };
}

/** The platform of Windows: desktopCapturer for the pictures, koffi for window positions. macOS has its own; elsewhere there is no capture. */
export function createElectronPlatform(): ScreenPlatform {
  if (process.platform === "darwin") return createMacPlatform();
  if (process.platform !== "win32") {
    return {
      supported: false,
      displays: () => [],
      cursor: () => ({ x: 0, y: 0 }),
      windows: async () => [],
      foreground: () => undefined,
      grab: () => Promise.reject(new Error("unsupported")),
      hideOwnWindows: (run) => run(),
    };
  }
  let api: Promise<WindowApi> | undefined;
  const win = () => (api ??= loadWindowApi());
  const physical = (d: Display): DisplayInfo => ({ id: String(d.id), bounds: screen.dipToScreenRect(null, d.bounds) });
  let foreground: string | undefined;

  return {
    supported: true,
    displays: () => screen.getAllDisplays().map(physical),
    cursor: () => screen.dipToScreenPoint(screen.getCursorScreenPoint()),
    async windows() {
      const w = await win();
      foreground = w.foreground() ? `window:${w.foreground()}` : undefined;
      const own = new Set(BrowserWindow.getAllWindows().map((b) => b.getMediaSourceId()));
      // no thumbnails: they cost about 0.6 s per window; the picture is cut from the display instead
      const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
      return sources.filter((s) => !own.has(s.id)).map((s): WindowInfo => ({ id: s.id, name: s.name, rect: w.bounds(Number(s.id.split(":")[1])) }));
    },
    foreground: () => foreground,
    async grab(display) {
      const { width, height } = display.bounds;
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
      const source = sources.find((s) => s.display_id === display.id);
      if (!source || source.thumbnail.isEmpty()) throw new Error("no picture of the display");
      return shotOf(source.thumbnail);
    },
    hideOwnWindows: withOwnWindowsHidden,
  };
}
