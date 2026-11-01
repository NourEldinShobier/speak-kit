import type { TrayState } from "../shared/engine-view";

type RGB = [number, number, number];
const BLUE: RGB = [0x24, 0x57, 0xf5];
const GREY: RGB = [0x7a, 0x7d, 0x85];
const BADGE: Partial<Record<TrayState, RGB>> = { working: [0x4a, 0x9e, 0xff], error: [0xf2, 0x55, 0x5a], paused: [0x9a, 0xa0, 0xab], attention: [0xf5, 0x9e, 0x0b] };

/** BGRA bitmap of the SpeakKit mark (rounded square, five bars). Tray variants: asleep is grey, working and error add a corner dot. */
export function logoBitmap(size: number, state: TrayState = "normal"): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  const base = state === "asleep" ? GREY : BLUE;
  const badge = BADGE[state];
  const r = size * 0.28;
  const bars = [0.28, 0.5, 0.7, 0.42, 0.22];
  const bw = Math.max(2, size * 0.09);
  const gap = size * 0.075;
  const x0 = (size - (bars.length * bw + (bars.length - 1) * gap)) / 2;
  const br = size * 0.24; // badge radius, centered in the bottom-right corner
  const bx = size - br - 0.5;
  const by = size - br - 0.5;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      if (badge && d <= br) {
        const ring = d > br - Math.max(1, size * 0.06);
        const c: RGB = ring ? [255, 255, 255] : badge;
        buf[o] = c[2];
        buf[o + 1] = c[1];
        buf[o + 2] = c[0];
        buf[o + 3] = 255;
        continue;
      }
      const cx = Math.min(Math.max(x + 0.5, r), size - r);
      const cy = Math.min(Math.max(y + 0.5, r), size - r);
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const bi = Math.floor((x + 0.5 - x0) / (bw + gap));
      const inBar = bi >= 0 && bi < bars.length && (x + 0.5 - x0) % (bw + gap) < bw && Math.abs(y + 0.5 - size / 2) < (bars[bi]! * size) / 2;
      const c: RGB = inBar ? [255, 255, 255] : base;
      buf[o] = c[2];
      buf[o + 1] = c[1];
      buf[o + 2] = c[0];
      buf[o + 3] = 255;
    }
  return buf;
}
