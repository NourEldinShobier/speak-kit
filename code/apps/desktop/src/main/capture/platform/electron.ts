import { BrowserWindow, desktopCapturer, screen, shell, systemPreferences, type Display, type NativeImage } from "electron";
import { loadWindowApi, type WindowApi } from "../../screen-vision/native";
import { cropOrFull, type Rect } from "../autocrop";
import { toDisplayPixels, type DisplayGeometry, type WindowGeometry } from "../picker";
import { withoutOwn } from "../privacy";
import type { Target } from "../session";
import { displayOfTarget } from "../target-display";
import type { CapturePlatform, Resolved, ScreenPermission, Still } from "./types";

const SCREEN_PANE = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

const geometry = (d: Display, i: number): DisplayGeometry => ({ id: String(d.id), name: d.label || `Display ${i + 1}`, bounds: d.bounds, scaleFactor: d.scaleFactor });
const displays = () => screen.getAllDisplays().map(geometry);
const ownIds = () => BrowserWindow.getAllWindows().map((b) => ({ id: b.getMediaSourceId() }));

function permissionOf(os: NodeJS.Platform): ScreenPermission {
  if (os !== "darwin") return "not-needed";
  const status = systemPreferences.getMediaAccessStatus("screen");
  if (status === "granted" || status === "not-determined") return status;
  return "denied";
}

/** The part of a still picture the target covers, in pixels of the display picture. */
function areaOf(t: Target, display: DisplayGeometry, window: WindowGeometry | undefined): Rect | undefined {
  if (t.kind === "area") return toDisplayPixels(t.rect, display);
  return window ? toDisplayPixels(window.rect, display) : undefined;
}

/** The picture cut to `area` (kept inside the picture); the whole picture when there is no area or it cannot be cut. */
export function stillOf(picture: NativeImage, area: Rect | undefined): NativeImage {
  const full = picture.getSize();
  if (!area) return picture;
  const x = Math.max(0, area.x);
  const y = Math.max(0, area.y);
  const clamped = { x, y, width: Math.min(area.x + area.width, full.width) - x, height: Math.min(area.y + area.height, full.height) - y };
  return cropOrFull(full, clamped, { crop: (r) => picture.crop(r), full: () => picture });
}

/**
 * The platform of Windows and macOS over Electron's desktop capturer. Windows lists other programs' windows with their rectangles through the DWM
 * (koffi); macOS has no such list in Electron, so the window picker is off there and screen and area remain.
 */
class ElectronCapturePlatform implements CapturePlatform {
  readonly supported = true;
  readonly os: "win32" | "darwin";
  readonly windowPicker: boolean;
  #api: Promise<WindowApi> | undefined;

  constructor(os: "win32" | "darwin") {
    this.os = os;
    this.windowPicker = os === "win32";
  }

  displays = displays;
  cursor = () => screen.getCursorScreenPoint();
  onDisplaysChanged = (fn: () => void) => {
    screen.on("display-removed", fn);
    screen.on("display-added", fn);
    return () => {
      screen.off("display-removed", fn);
      screen.off("display-added", fn);
    };
  };
  screenPermission = () => permissionOf(this.os);
  windowRect = (): Rect | undefined => undefined;

  async openScreenSettings() {
    if (this.os === "darwin") await shell.openExternal(SCREEN_PANE);
  }

  async windows(): Promise<WindowGeometry[]> {
    if (this.os !== "win32") return [];
    const w = await (this.#api ??= loadWindowApi());
    const sources = withoutOwn(await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false }), ownIds());
    const out: WindowGeometry[] = [];
    for (const s of sources) {
      const rect = w.bounds(Number(s.id.split(":")[1]));
      if (rect && rect.width > 8 && rect.height > 8 && s.name.trim()) out.push({ id: s.id, title: s.name, rect: screen.screenToDipRect(null, rect) });
    }
    return out;
  }

  async resolve(t: Target): Promise<Resolved | undefined> {
    if (t.kind === "window") {
      const rect = (await this.windows()).find((w) => w.id === t.windowId)?.rect;
      return { sourceId: t.windowId, title: t.title, ...(rect && { windowRect: rect, bounds: rect }) };
    }
    const d = displays().find((x) => x.id === t.displayId);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
    const s = sources.find((x) => x.display_id === d?.id);
    if (!d || !s) return undefined;
    return t.kind === "screen" ? { sourceId: s.id, title: d.name, bounds: d.bounds } : { sourceId: s.id, title: `${d.name} · Area`, crop: toDisplayPixels(t.rect, d), bounds: t.rect };
  }

  async still(t: Target): Promise<Still | undefined> {
    const window = t.kind === "window" ? (await this.windows()).find((w) => w.id === t.windowId) : undefined;
    const display = displayOfTarget(t, displays(), window ? [window] : []);
    if (!display) return undefined;
    const size = { width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor) };
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
    const source = sources.find((x) => x.display_id === display.id);
    if (!source || source.thumbnail.isEmpty()) return undefined;
    const image = stillOf(source.thumbnail, areaOf(t, display, window));
    const out = image.getSize();
    return { png: image.toPNG(), width: out.width, height: out.height };
  }
}

const unsupported: CapturePlatform = {
  os: "other",
  supported: false,
  windowPicker: false,
  displays: () => [],
  windows: async () => [],
  cursor: () => ({ x: 0, y: 0 }),
  onDisplaysChanged: () => () => {},
  screenPermission: () => "not-needed",
  openScreenSettings: async () => {},
  resolve: async () => undefined,
  still: async () => undefined,
  windowRect: () => undefined,
};

export function createElectronCapturePlatform(os: NodeJS.Platform = process.platform): CapturePlatform {
  return os === "win32" || os === "darwin" ? new ElectronCapturePlatform(os) : unsupported;
}
