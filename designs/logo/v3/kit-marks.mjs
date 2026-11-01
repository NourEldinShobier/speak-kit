// Round 3: six "kit" marks. A tile holds a small set of soft, wavy pieces: the kit.
// Every piece outline is a sound wave wrapped round a shape (its ripple count is its "voice"),
// and one warm piece is always the word being read.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "../v2/kit.mjs";

const OUT = new URL("./svg/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const TAU = Math.PI * 2;
const C = { blue: "#2F6BFF", yellow: "#FFC23D", coral: "#FF6B57", mint: "#2FCF9F", lilac: "#9C7BFF", white: "#FFFFFF", ink: "#14161B" };

// ---------- piece outlines: radius functions r(t), t = 0 at the top, clockwise ----------
const ripple = (R, n, a, b = 0) => (t) => R * (1 + a * Math.cos(n * t) + b * Math.cos(2 * n * t));
const squircleR = (R, m = 4) => (t) => R / (Math.abs(Math.cos(t)) ** m + Math.abs(Math.sin(t)) ** m) ** (1 / m);
const wavySquare = (R, n, a, m = 4) => (t) => squircleR(R, m)(t) * (1 + a * Math.cos(n * t));
const bloom = (R, n, depth, p = 0.6) => (t) => R * (1 - depth + depth * Math.abs(Math.cos((n * t) / 2)) ** p);
const pill = (rx, ry, n, a, m = 2.6) => (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return (1 / ((Math.abs(s) / rx) ** m + (Math.abs(c) / ry) ** m) ** (1 / m)) * (1 + a * Math.cos(n * t));
};
const pts = (cx, cy, rf, rot = 0, N = 900) =>
  Array.from({ length: N }, (_, i) => { const t = (i / N) * TAU, r = rf(t); return [cx + r * Math.sin(t + rot), cy - r * Math.cos(t + rot)]; });
const shape = (cx, cy, rf, rot = 0) => K.polyPath(pts(cx, cy, rf, rot), 3);
// even scallops along any closed outline: `count` waves of `amp` px, measured along the edge
function edgeWave(P, count, amp) {
  const L = [0];
  for (let i = 1; i <= P.length; i++) L.push(L[i - 1] + Math.hypot(P[i % P.length][0] - P[i - 1][0], P[i % P.length][1] - P[i - 1][1]));
  const total = L.at(-1), N = 1200, out = [];
  let j = 0;
  const at = (d) => { while (L[j + 1] < d) j++; const a = P[j], b = P[(j + 1) % P.length], u = (d - L[j]) / (L[j + 1] - L[j] || 1); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
  const Q = []; for (let i = 0; i < N; i++) Q.push(at((i / N) * total));
  for (let i = 0; i < N; i++) {
    const a = Q[(i + N - 1) % N], b = Q[(i + 1) % N], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty);
    // outward normal for a clockwise outline in screen coordinates
    const w = amp * Math.cos((TAU * count * i) / N);
    out.push([Q[i][0] - (ty / l) * w, Q[i][1] + (tx / l) * w]);
  }
  return out;
}
const scalloped = (cx, cy, rf, count, amp, rot = 0) => K.polyPath(edgeWave(pts(cx, cy, rf, rot), count, amp), 3);
// the same outline as a field (radial distance), for smooth unions with other parts
const field = (cx, cy, rf, rot = 0) => (x, y) => { const dx = x - cx, dy = y - cy; return Math.hypot(dx, dy) - rf(Math.atan2(dx, -dy) - rot); };

// ---------- white glyphs drawn inside pieces ----------
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const polyline = (p) => "M" + p.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L");
const waveGlyph = (cx, cy, w, amp, periods = 2, sw = 26, color = C.white) =>
  `<path d="${polyline(Array.from({ length: 121 }, (_, i) => { const u = i / 120; return [cx - w / 2 + w * u, cy - amp * Math.sin(TAU * periods * u)]; }))}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const linesGlyph = (x, y, lens, gap = 46, sw = 24, color = C.white) =>
  lens.map((l, i) => `<path d="M${f1(x)} ${f1(y + i * gap)}H${f1(x + l)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`).join("");
// polygon with every corner rounded to radius r
function roundedPoly(P, r) {
  const out = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n];
    const a = [p0[0] - p1[0], p0[1] - p1[1]], b = [p2[0] - p1[0], p2[1] - p1[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b), ua = [a[0] / la, a[1] / la], ub = [b[0] / lb, b[1] / lb];
    const ang = Math.acos(ua[0] * ub[0] + ua[1] * ub[1]), d = r / Math.tan(ang / 2);
    const bis = [ua[0] + ub[0], ua[1] + ub[1]], lbis = Math.hypot(...bis), c = [p1[0] + (bis[0] / lbis) * (r / Math.sin(ang / 2)), p1[1] + (bis[1] / lbis) * (r / Math.sin(ang / 2))];
    const t1 = [p1[0] + ua[0] * d, p1[1] + ua[1] * d], t2 = [p1[0] + ub[0] * d, p1[1] + ub[1] * d];
    let s = Math.atan2(t1[1] - c[1], t1[0] - c[0]), e = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    while (e - s > Math.PI) e -= TAU; while (s - e > Math.PI) e += TAU;
    for (let k = 0; k <= 12; k++) { const q = s + ((e - s) * k) / 12; out.push([c[0] + r * Math.cos(q), c[1] + r * Math.sin(q)]); }
  }
  return out;
}
const playGlyph = (cx, cy, s, color = C.white) =>
  `<path d="${K.polyPath(roundedPoly([[cx - s * 0.42, cy - s * 0.56], [cx + s * 0.62, cy], [cx - s * 0.42, cy + s * 0.56]], s * 0.16), 3)}" fill="${color}"/>`;

// ---------- tile and shadow ----------
const shadow = (id, dark) => `<filter id="${id}-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#06070A" flood-opacity="${dark ? 0.45 : 0.13}"/></filter>`;
const tile = (dark) => `<path d="${K.squircle(5, 2)}" fill="${dark ? "#15171C" : C.white}" stroke="${dark ? "#262A33" : "#E6E8EC"}" stroke-width="3"/>`;
const piece = (id, d, fill) => `<path d="${d}" fill="${fill}" filter="url(#${id}-sh)"/>`;
function write(slug, body, { dark = false, bare = false } = {}) {
  writeFileSync(new URL(`${slug}.svg`, OUT), K.svg(shadow(slug, dark), `${bare ? "" : tile(dark)}\n${body}`));
}

// ---------- 1 · Four voices: four pieces, each outline a different voice; the blue one is speaking ----------
function fourVoices() {
  const id = "v3-01-four-voices", A = 318, B = 706;
  write(id, [
    piece(id, shape(A, A, ripple(148, 8, 0.13, -0.005)), C.yellow),
    piece(id, shape(B, A, ripple(146, 12, 0.034, -0.012)), C.blue) + waveGlyph(B, A, 176, 34),
    piece(id, scalloped(A, B, squircleR(132, 4.2), 12, 9), C.coral),
    piece(id, shape(B, B, bloom(150, 5, 0.17)), C.mint),
  ].join("\n"));
}

// ---------- 2 · Feature kit: the pieces are what SpeakKit does: voice, the highlighted word, text, play ----------
function featureKit() {
  const id = "v3-02-feature-kit", A = 318, B = 706;
  write(id, [
    piece(id, shape(A, A, ripple(144, 12, 0.034, -0.012)), C.blue) + waveGlyph(A, A, 172, 33),
    piece(id, scalloped(B, A, pill(160, 100, 0, 0, 3.2), 14, 7), C.yellow) + linesGlyph(B - 88, A - 20, [176, 110], 44, 22, "#5C4300"),
    piece(id, scalloped(A, B, squircleR(130, 4.2), 12, 9), C.coral) + linesGlyph(A - 74, B - 46, [148, 120, 86]),
    piece(id, shape(B, B, bloom(150, 6, 0.15)), C.mint) + playGlyph(B + 6, B, 120),
  ].join("\n"), { dark: true });
}

// ---------- 3 · Puzzle kit: the tile itself is the kit, four pieces cut apart by two voice waves ----------
function puzzleKit() {
  const id = "v3-03-puzzle-kit", g = 13;
  const sx = (y) => 512 + 40 * Math.sin((TAU * (y - 112)) / 400), sy = (x) => 512 - 40 * Math.sin((TAU * (x - 112)) / 400);
  const R = 512 - 4, m = 5;
  const tileF = (x, y) => { const u = Math.abs(x - 512) / R, v = Math.abs(y - 512) / R; return ((u ** m + v ** m) ** (1 / m) - 1) * R; };
  const q = (sxSign, sySign) => (x, y) => K.smax(K.smax(tileF(x, y), sxSign * (x - sx(y)) + g, 14), sySign * (y - sy(x)) + g, 14);
  const parts = [[1, 1, C.blue], [-1, 1, C.yellow], [1, -1, C.coral], [-1, -1, C.mint]];
  write(id, parts.map(([a, b, c]) => `<path d="${K.shapePath(q(a, b))}" fill="${c}"/>`).join("\n"), { bare: true });
}

// ---------- 4 · Speech kit: a wavy speech bubble whose "..." are three kit pieces; the middle one is the word being read ----------
function speechKit() {
  const id = "v3-04-speech-kit";
  const body = field(512, 470, pill(330, 258, 0, 0, 2.4)), tail = K.cone(338, 680, 56, 252, 812, 24);
  const base = K.trace(K.union(70, body, tail), { spacing: 2 })[0];
  const d = K.polyPath(edgeWave(base.slice().reverse(), 18, 11), 3);
  write(id, [
    piece(id, d, C.blue),
    `<path d="${shape(372, 470, ripple(58, 10, 0.06))}" fill="${C.white}"/>`,
    `<path d="${shape(512, 470, ripple(74, 8, 0.13, -0.005))}" fill="${C.yellow}"/>`,
    `<path d="${shape(652, 470, bloom(60, 5, 0.2))}" fill="${C.white}"/>`,
  ].join("\n"));
}

// ---------- 5 · Voice deck: three scalloped voice cards fanned out like a kit you pick from; the front one speaks ----------
function voiceDeck() {
  const id = "v3-05-voice-deck";
  const card = (rot, dx, dy, fill, extra = "") => {
    const cx = 512 + dx, cy = 540 + dy, r = (rot * Math.PI) / 180;
    const P = edgeWave(pts(0, 0, squircleR(170, 5.5)).map(([x, y]) => [x * 0.86, y * 1.12]), 14, 8)
      .map(([x, y]) => [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
    return piece(id, K.polyPath(P, 3), fill) + extra;
  };
  write(id, [
    card(-16, -132, 18, C.yellow),
    card(14, 132, 18, C.coral),
    card(0, 0, -22, C.blue, waveGlyph(512, 518, 170, 40, 2, 30)),
  ].join("\n"));
}

// ---------- 6 · Duo kit: Speak and Kit as two pieces, the voice disc and the warm piece clipped onto it ----------
function duoKit() {
  const id = "v3-06-duo-kit";
  write(id, [
    piece(id, shape(462, 560, ripple(262, 14, 0.026, -0.008)), C.blue) + waveGlyph(462, 560, 300, 58, 2, 44),
    piece(id, shape(752, 296, ripple(132, 8, 0.13, -0.005)), C.yellow),
  ].join("\n"));
}

const ALL = { "v3-01-four-voices": fourVoices, "v3-02-feature-kit": featureKit, "v3-03-puzzle-kit": puzzleKit, "v3-04-speech-kit": speechKit, "v3-05-voice-deck": voiceDeck, "v3-06-duo-kit": duoKit };
const only = process.argv.slice(2);
const pick = Object.keys(ALL).filter((s) => !only.length || only.some((o) => s.includes(o)));
for (const s of pick) ALL[s]();
console.log("written", pick.join(", "));
