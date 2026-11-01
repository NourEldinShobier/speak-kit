// Geometry kit for the round-2 SpeakKit marks: shapes are signed distance fields (SDF, negative inside)
// blended with smooth unions, traced with d3-contour and written as smooth closed Bezier paths.
import { contours } from "d3-contour";
import fitCurve from "fit-curve";

export const SIZE = 1024;

// ---------- SDF primitives ----------
export const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

export const ellipse = (cx, cy, rx, ry, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
  };
};

// Round cone: radius ra at a, rb at b (Inigo Quilez, sdUnevenCapsule).
export const cone = (ax, ay, ra, bx, by, rb) => {
  const px0 = bx - ax, py0 = by - ay, h = px0 * px0 + py0 * py0;
  const b = ra - rb, cx = Math.sqrt(Math.max(h - b * b, 1e-9)), cy = b;
  return (x, y) => {
    const qx0 = x - ax, qy0 = y - ay;
    const qx = Math.abs(qx0 * py0 - qy0 * px0) / h, qy = (qx0 * px0 + qy0 * py0) / h;
    const k = cx * qy - cy * qx, m = cx * qx + cy * qy, n = qx * qx + qy * qy;
    if (k < 0) return Math.sqrt(h * n) - ra;
    if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
    return m - ra;
  };
};

// Tube along a sampled curve; pts = [[x, y, r], ...]. Consecutive cones share end circles, so the plain min is smooth.
export const tube = (pts) => {
  const parts = [];
  for (let i = 1; i < pts.length; i++) parts.push(cone(...pts[i - 1], ...pts[i]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), rmax = Math.max(...pts.map((p) => p[2]));
  const x0 = Math.min(...xs) - rmax, x1 = Math.max(...xs) + rmax, y0 = Math.min(...ys) - rmax, y1 = Math.max(...ys) + rmax;
  return (x, y) => {
    // cheap bound far outside the tube's box keeps big grids fast; the margin must exceed any smooth-union radius
    const ox = Math.max(x0 - x, 0, x - x1), oy = Math.max(y0 - y, 0, y - y1);
    if (ox > 200 || oy > 200) return Math.hypot(ox, oy);
    let d = Infinity;
    for (const f of parts) d = Math.min(d, f(x, y));
    return d;
  };
};

// Sample a parametric curve f(t) -> [x, y, r] for t in [0, 1].
export const sample = (f, n = 160) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

export const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);
export const union = (k, ...fs) => (x, y) => {
  let d = fs[0](x, y);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y), k);
  return d;
};
export const cut = (k, a, b) => (x, y) => smax(a(x, y), -b(x, y), k);
export const offset = (f, r) => (x, y) => f(x, y) - r;

// ---------- tracing ----------
// Returns rings (arrays of [x, y]) of the zero level set, sampled every `step` px.
export function trace(sdf, { step = 2, spacing = 3 } = {}) {
  const n = Math.ceil(SIZE / step) + 1;
  const values = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values[i + j * n] = -sdf(i * step, j * step);
  const [geo] = contours().size([n, n]).thresholds([0])(values);
  const rings = [];
  for (const poly of geo.coordinates)
    for (const ring of poly) {
      // d3-contour places sample (i, j) at (i + 0.5, j + 0.5)
      const pts = ring.map(([gx, gy]) => [(gx - 0.5) * step, (gy - 0.5) * step]);
      rings.push(resample(pts, spacing));
    }
  return rings.filter((r) => r.length > 6);
}

function resample(pts, spacing) {
  const closed = pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts;
  const seg = [], L = [0];
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i], b = closed[(i + 1) % closed.length];
    seg.push([a, b]);
    L.push(L.at(-1) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = L.at(-1), count = Math.max(8, Math.round(total / spacing)), out = [];
  let s = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (L[s + 1] < d) s++;
    const [a, b] = seg[s], t = (d - L[s]) / Math.max(L[s + 1] - L[s], 1e-9);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

const f1 = (v) => Math.round(v * 10) / 10;
// Closed ring of evenly spaced points -> fewest cubic Beziers within 0.45 px (Schneider fit, G1 at every join).
export function ringPath(p) {
  const segs = fitCurve([...p, p[0]], 0.45);
  let d = `M${f1(segs[0][0][0])} ${f1(segs[0][0][1])}`;
  for (const [, c1, c2, e] of segs) d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(e[0])} ${f1(e[1])}`;
  return d + "Z";
}
export const shapePath = (sdf, opts) => trace(sdf, opts).map(ringPath).join("");

// Open polyline (for an outline we build ourselves) -> closed smooth path.
export const polyPath = (pts, spacing = 3) => ringPath(resample([...pts, pts[0]], spacing));

// Flat ribbon along center(t) that turns over where cos(theta(t)) changes sign; projected half-width W·|cos θ| + min.
// Returns one closed path per visible face, split at each turn, with round caps at the free ends.
// W may be a number or a function of t; cut > 0 ends the ribbon with parallel slanted cuts instead of round caps.
export function ribbon(center, theta, W, { min = 3, N = 260, caps = true, cut = 0 } = {}) {
  const Wf = typeof W === "function" ? W : () => W;
  const at = (t) => {
    const [x, y] = center(t), e = 1e-4, a = center(Math.max(t - e, 0)), b = center(Math.min(t + e, 1));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    const c = Math.cos(theta(t));
    return { x, y, tx, ty, nx: -ty, ny: tx, w: Wf(t) * Math.abs(c) + min, s: Math.sign(c) || 1 };
  };
  const ts = Array.from({ length: N + 1 }, (_, i) => i / N), pieces = [];
  let cur = [ts[0]];
  for (let i = 1; i < ts.length; i++) {
    if (at(ts[i]).s !== at(ts[i - 1]).s) { cur.push(ts[i]); pieces.push(cur); cur = [ts[i]]; } else cur.push(ts[i]);
  }
  pieces.push(cur);
  return pieces.map((seg, k) => {
    const P = seg.map(at), L = P.map((p) => [p.x + p.nx * p.w, p.y + p.ny * p.w]), R = P.map((p) => [p.x - p.nx * p.w, p.y - p.ny * p.w]);
    const cap = (p, dir) => {
      const out = [];
      for (let j = 1; j < 12; j++) {
        const a = (Math.PI * j) / 12, c = Math.cos(a), s = Math.sin(a);
        // from the left edge round the tip to the right edge (dir = +1 at the end, -1 at the start)
        out.push([p.x + p.nx * p.w * c * dir + p.tx * p.w * s * dir, p.y + p.ny * p.w * c * dir + p.ty * p.w * s * dir]);
      }
      return out;
    };
    if (cut) {
      // shear both free ends the same way: the left edge runs on, the right edge stops short
      const sh = (p, i, arr, sign) => { arr[i] = [arr[i][0] + p.tx * p.w * cut * sign, arr[i][1] + p.ty * p.w * cut * sign]; };
      if (k === 0) { sh(P[0], 0, L, 1); sh(P[0], 0, R, -1); }
      if (k === pieces.length - 1) { sh(P.at(-1), L.length - 1, L, 1); sh(P.at(-1), R.length - 1, R, -1); }
    }
    const endCap = caps && !cut && k === pieces.length - 1 ? cap(P.at(-1), 1) : [];
    const startCap = caps && !cut && k === 0 ? cap(P[0], -1) : [];
    return { d: polyPath([...L, ...endCap, ...R.reverse(), ...startCap], 6), t0: seg[0], t1: seg.at(-1) };
  });
}

// Shaded ribbon: thin overlapping quads along center(t), each filled with colorAt(t, face, facing),
// face 0 or 1 by the sign of cos(theta), facing = |cos(theta)| (1 face-on, 0 edge-on). Round end caps.
export function ribbonStrips(center, theta, W, colorAt, { min = 3, N = 150, overlap = 1.2 } = {}) {
  const at = (t) => {
    const [x, y] = center(t), e = 1e-4, a = center(Math.max(t - e, 0)), b = center(Math.min(t + e, 1));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    return { x, y, tx, ty, nx: -ty, ny: tx, w: W * Math.abs(Math.cos(theta(t))) + min };
  };
  const fill = (t) => { const c = Math.cos(theta(t)); return colorAt(t, c >= 0 ? 0 : 1, Math.abs(c)); };
  const P = (pts) => "M" + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join("L") + "Z";
  const out = [];
  const cap = (p, dir) => {
    const pts = [];
    for (let j = 0; j <= 16; j++) {
      const a = (Math.PI * j) / 16, c = Math.cos(a), s = Math.sin(a);
      pts.push([p.x + (p.nx * c + p.tx * s) * p.w * dir, p.y + (p.ny * c + p.ty * s) * p.w * dir]);
    }
    return pts;
  };
  out.push({ d: P(cap(at(0), -1)), fill: fill(0) });
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, a = at(t0), b = at(t1), ex = b.tx * overlap, ey = b.ty * overlap;
    out.push({
      d: P([[a.x + a.nx * a.w, a.y + a.ny * a.w], [b.x + b.nx * b.w + ex, b.y + b.ny * b.w + ey], [b.x - b.nx * b.w + ex, b.y - b.ny * b.w + ey], [a.x - a.nx * a.w, a.y - a.ny * a.w]]),
      fill: fill((t0 + t1) / 2),
    });
  }
  out.push({ d: P(cap(at(1), 1)), fill: fill(1) });
  return out;
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const rgbHex = (c) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
// colour ramp: stops [[t, "#hex"], ...] -> f(t) -> [r, g, b]
export const ramp = (stops) => (t) => {
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [ta, ca] = stops[i], [tb, cb] = stops[i + 1], u = Math.min(Math.max((t - ta) / (tb - ta), 0), 1);
  const a = hexRgb(ca), b = hexRgb(cb);
  return a.map((v, k) => v + (b[k] - v) * u);
};

export function bbox(sdf, step = 8) {
  let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
  for (let y = 0; y <= SIZE; y += step) for (let x = 0; x <= SIZE; x += step)
    if (sdf(x, y) < 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// ---------- SVG ----------
const stopsXml = (stops) => stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ""}/>`).join("");
export const lin = (id, [x1, y1, x2, y2], stops) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}">${stopsXml(stops)}</linearGradient>`;
export const rad = (id, [cx, cy, r], stops, [fx, fy] = [cx, cy]) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fx="${f1(fx)}" fy="${f1(fy)}">${stopsXml(stops)}</radialGradient>`;
export const svg = (defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;

// Superellipse app tile (n = 5 reads as a continuous-corner squircle).
export function squircle(n = 5, inset = 0) {
  const r = SIZE / 2 - inset, pts = [];
  for (let i = 0; i < 720; i++) {
    const t = (i / 720) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([SIZE / 2 + r * Math.sign(c) * Math.abs(c) ** (2 / n), SIZE / 2 + r * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return ringPath(pts);
}

export const PALETTE = {
  ink: "#0C0D10", ink2: "#16181D", paper: "#F4F4F2", white: "#FFFFFF",
  aqua: "#3BE0D2", sky: "#3FA9FF", azure: "#1677FF", indigo: "#4B48F2", lilac: "#B39BFF", yellow: "#F6C64E", amber: "#FFAE3B",
};
