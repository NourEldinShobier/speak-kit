// Continuous-corner squircle path (Apple style: curvature eases in over the corner) from figma-squircle, as absolute M/C/L/Z.
import { getSvgPath } from "figma-squircle";

const r1 = (v) => Math.round(v * 10) / 10;
// circular arc (sweep 1, under 180 degrees) -> one cubic
function arc(p0, p1, r) {
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy);
  const h = Math.sqrt(Math.max(r * r - (d / 2) ** 2, 0));
  let c = [mx - (dy / d) * h, my + (dx / d) * h];
  if ((p0[0] - c[0]) * (p1[1] - c[1]) - (p0[1] - c[1]) * (p1[0] - c[0]) < 0) c = [mx + (dy / d) * h, my - (dx / d) * h];
  const th = 2 * Math.asin(d / 2 / r), k = (4 / 3) * Math.tan(th / 4);
  const tan = (p) => [-(p[1] - c[1]) / r, (p[0] - c[0]) / r];
  const t0 = tan(p0), t1 = tan(p1);
  return [p0[0] + t0[0] * k * r, p0[1] + t0[1] * k * r, p1[0] - t1[0] * k * r, p1[1] - t1[1] * k * r, p1[0], p1[1]];
}

/** Squircle of `size` px at (x, y); `radius` is the corner radius in px, `smoothing` 0..1 (Apple is about 0.6). */
export function squircleD(x, y, size, radius, smoothing = 0.6) {
  const toks = getSvgPath({ width: size, height: size, cornerRadius: radius, cornerSmoothing: smoothing }).match(/[MLCcaAZz]|-?[0-9.]+/g);
  let i = 0, cmd = "", p = [0, 0], out = "";
  const num = () => +toks[i++];
  const abs = (px, py) => `${r1(px + x)} ${r1(py + y)}`;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    if (cmd === "Z") { out += "Z"; continue; }
    if (cmd === "M" || cmd === "L") { p = [num(), num()]; out += cmd + abs(...p); }
    else if (cmd === "c") {
      const v = [num(), num(), num(), num(), num(), num()].map((n, j) => n + p[j % 2]);
      out += "C" + abs(v[0], v[1]) + " " + abs(v[2], v[3]) + " " + abs(v[4], v[5]);
      p = [v[4], v[5]];
    } else if (cmd === "a") {
      const r = num(); num(); num(); num(); num(); // rx ry rotation large-arc sweep (rx = ry)
      const e = [p[0] + num(), p[1] + num()], v = arc(p, e, r);
      out += "C" + abs(v[0], v[1]) + " " + abs(v[2], v[3]) + " " + abs(v[4], v[5]);
      p = e;
    }
  }
  return out;
}
