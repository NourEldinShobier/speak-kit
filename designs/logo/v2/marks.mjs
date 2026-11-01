// Round 2: six original SpeakKit marks, "K fused with voice".
// Every form comes from SpeakKit's own story: the K of Kit, text turning into voice, and the warm yellow
// word being read. Two hues only (page blue, highlight warm), one soft light, light folds, no outer glow.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "./kit.mjs";

const OUT = new URL("./svg/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = {
  blue: "#2F7BFF", blueLight: "#5FA2FF", blueDeep: "#3A4BE8", violet: "#5B5CF5",
  warm: "#FFC83D", warmDeep: "#FFA62B", warmLight: "#FFE08A", fold: "#DCE8FF",
  ink: "#14161B", white: "#F7F8FA",
};
const ease = (a, b, t) => { const u = Math.min(Math.max((t - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
const bez = (p0, p1, p2, p3, t) => p0.map((_, k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
const pathBox = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number), xs = [], ys = [];
  for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

// One soft light from the top left plus a faint shade at the bottom; no specular spots, no rims.
function soft(id, d, box, fill, { light = 0.24, shade = 0.16 } = {}) {
  const r = Math.max(box.w, box.h);
  const defs =
    K.rad(`${id}-l`, [box.x0 + box.w * 0.28, box.y0 + box.h * 0.22, r * 0.8], [[0, "#FFFFFF", light], [1, "#FFFFFF", 0]]) +
    K.lin(`${id}-s`, [box.cx, box.y0 + box.h * 0.45, box.cx, box.y1], [[0, "#0A1240", 0], [1, "#0A1240", shade]]);
  return { defs, body: [fill, `url(#${id}-l)`, `url(#${id}-s)`].map((f) => `<path d="${d}" fill="${f}"/>`).join("") };
}
// A ribbon face: its own gradient, lifted toward the fold (a turning ribbon catches light at the edge).
function face(id, d, vec, stops, fold) {
  const defs = K.lin(`${id}-f`, vec, stops) + K.rad(`${id}-t`, [fold[0], fold[1], 120], [[0, C.fold, 0.85], [0.5, C.fold, 0.3], [1, C.fold, 0]]);
  return { defs, body: `<path d="${d}" fill="url(#${id}-f)"/><path d="${d}" fill="url(#${id}-t)"/>` };
}

const TILE = (id, dark = true) => ({
  defs: K.lin(`${id}-bg`, [512, 0, 512, 1024], dark ? [[0, "#1A1C22"], [1, "#0B0C0F"]] : [[0, "#FFFFFF"], [1, "#EEF0F4"]]),
  body: `<path d="${K.squircle()}" fill="url(#${id}-bg)"/>`,
});
// free mark + app tile; the tile scales the mark to about 60 % of the tile, centred on its box
function emit(slug, layers, box, { tile = layers, tileDark = true } = {}) {
  const all = (ls) => ({ defs: ls.map((l) => l.defs || "").join(""), body: ls.map((l) => l.body).join("\n") });
  const m = all(layers), t = all(tile), bg = TILE(slug, tileDark);
  writeFileSync(new URL(`${slug}.svg`, OUT), K.svg(m.defs, m.body));
  const s = (0.6 * 1024) / Math.max(box.w, box.h);
  const tr = `translate(512 512) scale(${s.toFixed(4)}) translate(${(-box.cx).toFixed(1)} ${(-box.cy).toFixed(1)})`;
  writeFileSync(new URL(`${slug}-tile.svg`, OUT), K.svg(bg.defs + t.defs, `${bg.body}\n<g transform="${tr}">${t.body}</g>`));
}

// tapered tube along a smooth path; r0 -> r1 with an ease, optional sideways S-ripple of `wave` px
const flow = (x0, y0, x1, y1, { wave = 0, r0 = 16, r1 = 70, n = 140 } = {}) =>
  K.tube(K.sample((t) => {
    const e = t * t * (3 - 2 * t), b = wave * Math.sin(2 * Math.PI * t);
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
    return [x0 + (x1 - x0) * t + (b * nx) / l, y0 + (y1 - y0) * t + (b * ny) / l, r0 + (r1 - r0) * e];
  }, n));
// stem with a gentle S, pinched where the arms leave, heavier at the foot like a settling drop
const stem = (x, y0, y1, { bow = 9, r = 48 } = {}) =>
  K.tube(K.sample((t) => [x + bow * Math.sin(2 * Math.PI * t), y0 + (y1 - y0) * t, r - 7 * Math.exp(-(((t - 0.5) / 0.13) ** 2)) + 9 * t * t], 160));
const grow = (box, x0, y0, x1, y1) => {
  const a = Math.min(box.x0, x0), b = Math.min(box.y0, y0), c = Math.max(box.x1, x1), e = Math.max(box.y1, y1);
  return { x0: a, y0: b, x1: c, y1: e, w: c - a, h: e - b, cx: (a + c) / 2, cy: (b + e) / 2 };
};

// ---------- 1 · Liquid K: one liquid body; the arm releases a warm drop, the word being spoken ----------
function liquidK() {
  const sdf = K.union(62, stem(332, 246, 776), flow(366, 504, 684, 278, { wave: 10, r1: 76 }), flow(366, 520, 704, 760, { wave: -12, r1: 80 }));
  const d = K.shapePath(sdf), box = K.bbox(sdf), dDrop = K.shapePath(K.circle(806, 186, 34));
  const s = soft("k1", d, box, "url(#k1-f)"), sd = soft("k1d", dDrop, pathBox(dDrop), "url(#k1-w)", { light: 0.35, shade: 0.1 });
  const defs = K.lin("k1-f", [box.x0, box.y0, box.x1, box.y1], [[0, C.blueLight], [0.5, C.blue], [1, C.blueDeep]]) +
    K.lin("k1-w", [772, 152, 840, 220], [[0, C.warmLight], [1, C.warmDeep]]);
  emit("v2-01-liquid-k", [{ defs: defs + s.defs, body: s.body }, { defs: sd.defs, body: sd.body }], grow(box, 772, 152, 840, 220));
}

// ---------- 2 · Turning K: arm and leg are one ribbon that turns over at the stem, page side blue, voice side warm ----------
function turningK() {
  const SX = 318, V = [392, 516];
  const center = (t) => {
    const u = t < 0.5 ? t * 2 : t * 2 - 1;
    const p = t < 0.5 ? bez([668, 288], [580, 330], [V[0], 420], V, u) : bez(V, [V[0], 610], [600, 742], [760, 800], u);
    const rip = 12 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u); // a soft ripple along each limb
    return [p[0] + rip * 0.55, p[1] - rip * 0.8];
  };
  const theta = (t) => Math.PI * ease(0.3, 0.7, t);
  const [arm, leg] = K.ribbon(center, theta, 52, { min: 3, cut: 0.55 });
  const [st] = K.ribbon((t) => [SX, 240 + 548 * t], () => 0, 48, { min: 0, cut: 0.55 });
  const fs = K.lin("k2-s", [SX, 240, SX, 788], [[0, C.blueLight], [1, C.blueDeep]]);
  const fa = face("k2a", arm.d, [668, 288, V[0], V[1]], [[0, C.blueLight], [1, C.blue]], V);
  const fb = face("k2b", leg.d, [V[0], V[1], 760, 800], [[0, "#FFB0A0"], [0.35, C.warmDeep], [1, C.warm]], V);
  const L = [{ defs: fs, body: `<path d="${st.d}" fill="url(#k2-s)"/>` }, { defs: fa.defs, body: fa.body }, { defs: fb.defs, body: fb.body }];
  emit("v2-02-turning-k", L, pathBox(st.d + arm.d + leg.d));
}

// ---------- 3 · Wave K: a voice wave rises into the stem of the K, Speak flowing into Kit ----------
function waveK() {
  // the voice arrives from the left as a wave and enters the K where its arm and leg leave
  const wave = K.tube(K.sample((t) => {
    const x = 132 + 352 * t, k = (x - 132) / 352;
    return [x, 512 - 74 * Math.sin(3 * Math.PI * k) * (1 - 0.45 * k), 9 + 34 * k * k];
  }, 220));
  const sdf = K.union(56, wave, stem(522, 262, 770, { bow: 0, r: 46 }), flow(552, 500, 818, 290, { wave: 8, r1: 64 }), flow(552, 516, 832, 752, { wave: -8, r1: 70 }));
  const d = K.shapePath(sdf), box = K.bbox(sdf);
  const s = soft("k3", d, box, "url(#k3-f)");
  const defs = K.lin("k3-f", [box.x0, 512, box.x1, 512], [[0, C.warm], [0.33, C.warmDeep], [0.43, "#FF8FA3"], [0.5, "#9C8CFF"], [0.58, C.blueLight], [1, C.blueDeep]]);
  emit("v2-03-wave-k", [{ defs: defs + s.defs, body: s.body }], box);
}

// ---------- 4 · Spoken S: the S of Speak, one ribbon turning over at its spine: page side above, voice side below ----------
const catmull = (pts) => (t) => {
  const n = pts.length - 1, x = Math.min(t * n, n - 1e-9), i = Math.floor(x), u = x - i;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
  const c = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
  return [c(0), c(1)];
};
function spokenS() {
  const center = catmull([[740, 330], [636, 248], [490, 236], [356, 288], [346, 404], [512, 512], [678, 620], [668, 736], [534, 788], [388, 776], [284, 694]]);
  const [top, bottom] = K.ribbon(center, (t) => Math.PI * ease(0.36, 0.64, t), (t) => 50 + 10 * Math.sin(Math.PI * t), { min: 3, cut: 0.28 });
  const mid = center(0.5);
  const fa = face("s4a", top.d, [740, 240, 512, 512], [[0, C.blueLight], [1, C.blue]], mid);
  const fb = face("s4b", bottom.d, [512, 512, 284, 780], [[0, "#FFB0A0"], [0.3, C.warmDeep], [1, C.warm]], mid);
  emit("v2-04-spoken-s", [{ defs: fa.defs, body: fa.body }, { defs: fb.defs, body: fb.body }], pathBox(top.d + bottom.d));
}

// ---------- 5 · Speaking K: the K's arm and leg leave the stem as sound waves; white on ink, one warm word ----------
function speakingK() {
  const sdf = K.union(58, stem(330, 244, 780, { bow: 0, r: 50 }), flow(362, 506, 700, 268, { wave: 26, r1: 62 }), flow(362, 520, 716, 768, { wave: -28, r1: 68 }));
  const d = K.shapePath(sdf), box = K.bbox(sdf), dDot = K.shapePath(K.circle(812, 196, 34));
  const mono = (fill, dot) => [{ body: `<path d="${d}" fill="${fill}"/>` }, { body: `<path d="${dDot}" fill="${dot}"/>` }];
  emit("v2-05-speaking-k", mono(C.ink, C.warmDeep), grow(box, 778, 162, 846, 230), { tile: mono(C.white, C.warm) });
}

// ---------- 6 · Voice ribbon: a spoken phrase as a satin ribbon that swells at each stress and turns over once ----------
function voiceRibbon() {
  const center = (t) => [176 + 672 * t, 512 - 150 * Math.sin(2 * Math.PI * t) * (0.85 + 0.15 * t)];
  const W = (t) => 42 + 26 * Math.abs(Math.sin(2 * Math.PI * t));
  const [a, b] = K.ribbon(center, (t) => Math.PI * ease(0.36, 0.64, t), W, { min: 3, cut: 0.35 });
  const mid = center(0.5);
  const fa = face("r6a", a.d, [176, 360, 512, 512], [[0, C.blueLight], [1, C.blue]], mid);
  const fb = face("r6b", b.d, [512, 512, 848, 640], [[0, "#FFB0A0"], [0.35, C.warmDeep], [1, C.warm]], mid);
  emit("v2-06-voice-ribbon", [{ defs: fa.defs, body: fa.body }, { defs: fb.defs, body: fb.body }], pathBox(a.d + b.d));
}

const ALL = { "v2-01-liquid-k": liquidK, "v2-02-turning-k": turningK, "v2-03-wave-k": waveK, "v2-04-spoken-s": spokenS, "v2-05-speaking-k": speakingK, "v2-06-voice-ribbon": voiceRibbon };
const only = process.argv.slice(2);
const pick = Object.keys(ALL).filter((s) => !only.length || only.some((o) => s.includes(o)));
for (const slug of pick) ALL[slug]();
console.log("written", pick.join(", "));
