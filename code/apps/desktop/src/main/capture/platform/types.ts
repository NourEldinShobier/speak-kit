import type { Rect } from "../autocrop";
import type { DisplayGeometry, WindowGeometry } from "../picker";
import type { Target } from "../session";

/** What the recorder window is pointed at: a capture source, optionally cut to a rectangle (in pixels of that source). */
export interface Resolved {
  sourceId: string;
  crop?: Rect;
  title: string;
  /** Desktop rectangle in device-independent pixels, for the cropped window. */
  windowRect?: Rect;
}

export interface Still {
  png: Buffer;
  width: number;
  height: number;
}

export type ScreenPermission = "granted" | "denied" | "not-determined" | "not-needed";

/** Everything capture needs of the operating system, behind one object. A platform that cannot do something says so instead of failing later. */
export interface CapturePlatform {
  readonly os: "win32" | "darwin" | "other";
  /** False where capture is not built (Linux). */
  readonly supported: boolean;
  /** False where windows cannot be listed with their rectangles (macOS): the picker then offers screen and area only. */
  readonly windowPicker: boolean;
  displays(): DisplayGeometry[];
  /** Windows of other programs, topmost first. Never this app's own windows. */
  windows(): Promise<WindowGeometry[]>;
  cursor(): { x: number; y: number };
  /** Calls `fn` when a display is plugged in or out. Returns the function that stops listening. */
  onDisplaysChanged(fn: () => void): () => void;
  screenPermission(): ScreenPermission;
  openScreenSettings(): Promise<void>;
  resolve(target: Target): Promise<Resolved | undefined>;
  /** One picture of a target, at the screen's own resolution. */
  still(target: Target): Promise<Still | undefined>;
  /** Where a window is now (desktop DIP), to follow it. */
  windowRect(windowId: string): Rect | undefined;
}
