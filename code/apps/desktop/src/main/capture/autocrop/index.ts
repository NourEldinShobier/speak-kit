export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

const valid = (r: Rect | undefined, f: FrameSize): r is Rect =>
  !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.x + r.width <= f.width && r.y + r.height <= f.height;

export interface CropOps<T> {
  crop(r: Rect): T;
  full(): T;
  onError?(e: unknown): void;
}

/**
 * Crops a screen picture to the window that was recorded. Any failure (no window rectangle, a rectangle outside the frame, a crop that throws)
 * returns the full frame: a capture is never lost to a crop.
 */
export function cropOrFull<T>(frame: FrameSize, windowRect: Rect | undefined, { crop, full, onError }: CropOps<T>): T {
  if (!valid(windowRect, frame)) return full();
  // A window that fills the frame needs no crop (a 1920x1080 window took the old path down).
  if (windowRect.x === 0 && windowRect.y === 0 && windowRect.width === frame.width && windowRect.height === frame.height) return full();
  try {
    return crop({ x: Math.round(windowRect.x), y: Math.round(windowRect.y), width: Math.round(windowRect.width), height: Math.round(windowRect.height) });
  } catch (e) {
    onError?.(e);
    return full();
  }
}

/** A desktop rectangle in the pixels of the display whose top-left corner is `origin`. */
export function toFrame(windowRect: Rect, origin: { x: number; y: number }): Rect {
  return { x: windowRect.x - origin.x, y: windowRect.y - origin.y, width: windowRect.width, height: windowRect.height };
}
