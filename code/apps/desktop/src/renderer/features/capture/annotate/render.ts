import { arrowHead, exportRect, strokeFor, type Editor, type Rect, type Shape } from "./model";

export type Surface = HTMLCanvasElement;
export type MakeSurface = (width: number, height: number) => Surface;

/** What drawing needs besides the shapes: the picture, and a way to make a scratch canvas. */
export interface Env {
  image: CanvasImageSource;
  make: MakeSurface;
}

export const INK = "#d92d20";
const MOSAIC = 12;

/** Blurs a region by shrinking it to a few big pixels and drawing it back; the shrunk copy cannot be turned back into the text underneath. */
function mosaic(ctx: CanvasRenderingContext2D, r: Rect, env: Env) {
  const w = Math.max(1, Math.round(r.width / MOSAIC));
  const h = Math.max(1, Math.round(r.height / MOSAIC));
  const small = env.make(w, h);
  small.getContext("2d")?.drawImage(env.image, r.x, r.y, r.width, r.height, 0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, w, h, r.x, r.y, r.width, r.height);
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, env: Env & { line: number }) {
  const { line } = env;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.kind === "arrow") {
    const [a, b] = arrowHead(s.from, s.to, line * 5);
    ctx.beginPath();
    ctx.moveTo(s.from.x, s.from.y);
    ctx.lineTo(s.to.x, s.to.y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(s.to.x, s.to.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (s.kind === "rect") ctx.strokeRect(s.rect.x, s.rect.y, s.rect.width, s.rect.height);
  else if (s.kind === "highlight") {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#facc15";
    ctx.fillRect(s.rect.x, s.rect.y, s.rect.width, s.rect.height);
  } else if (s.kind === "blur") mosaic(ctx, s.rect, env);
  else {
    ctx.font = `600 ${line * 6}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(s.text, s.at.x, s.at.y);
    ctx.fillText(s.text, s.at.x, s.at.y);
  }
  ctx.restore();
}

/** Draws the picture and everything drawn on it at the picture's own size (no crop). Blurs come first and are cut from the original, so a mark over a blurred region stays readable. */
export function paint(target: Surface, e: Editor, env: Env): void {
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(env.image, 0, 0);
  const withLine = { ...env, line: strokeFor(e.width) };
  for (const s of e.shapes) if (s.kind === "blur") drawShape(ctx, s, withLine);
  for (const s of e.shapes) if (s.kind !== "blur") drawShape(ctx, s, withLine);
}

/** The finished picture: everything painted, then cut to the crop. */
export function exportSurface(e: Editor, env: Env): Surface {
  const full = env.make(e.width, e.height);
  paint(full, e, env);
  const r = exportRect(e);
  if (r.width === e.width && r.height === e.height) return full;
  const out = env.make(r.width, r.height);
  out.getContext("2d")?.drawImage(full, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return out;
}
