// Page "Logo": the Voice hub logo as editable vectors, imported from designs/logo/final/svg/logo (written by logo.mjs and lockups.mjs).
// Source of truth for the logo is this page of designs/speakkit.figcraft; the SVGs are generated. Icon variants (white tile, tray badges, greyscale,
// macOS body and shadow) repeat the recipes of code/apps/desktop/scripts/icons-lib.mjs and code/apps/extension/scripts/make-icons.mjs.
import { readFileSync } from "fs";
import { B, Ref } from "./lib";
import { T } from "./kit";
import { S } from "./types";

const DIR = `${import.meta.dir}/../logo/final/svg/logo`;
export const svgFile = (n: string) => readFileSync(`${DIR}/${n}.svg`, "utf8");
const dims = (svg: string) => { const m = svg.match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/)!; return { w: +m[1], h: +m[2] }; };
const clipD = (svg: string) => svg.match(/<clipPath id="sq"><path d="([^"]+)"/)![1];

// ---- svg recipes (same as icons-lib.mjs) ----
export const withTile = (svg: string) => svg.replace("</defs>\n", `</defs>\n<path transform="translate(1 1) scale(0.998)" d="${clipD(svg)}" fill="#FFFFFF"/>\n`);
const BADGES: Record<string, string> = { working: "#4A9EFF", error: "#F2555A", paused: "#9AA0AB", attention: "#F59E0B" };
const withDot = (svg: string, color: string) => svg.replace("\n</svg>", `<circle cx="778" cy="778" r="246" fill="#FFFFFF"/><circle cx="778" cy="778" r="185" fill="${color}"/>\n</svg>`);
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); const v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b).toString(16).padStart(2, "0"); return `#${v}${v}${v}`; };
const grey = (svg: string) => svg.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (_, c) => `fill="${lum(c)}"`).replace(/stroke="(#[0-9A-Fa-f]{6})"/g, (_, c) => `stroke="${lum(c)}"`);
export const trayVariant = (state: string, small = true) => {
  let svg = withTile(svgFile(small ? "speakkit-logo-small" : "speakkit-logo-flat"));
  if (state === "asleep") svg = grey(svg); else if (BADGES[state]) svg = withDot(svg, BADGES[state]);
  return svg;
};
const COL = { sky: "#2EC5FF", yellow: "#FFC23D", violet: "#7B61FF", deep: "#1F3FD1", hub: "#2F6BFF" };
const swapFills = (svg: string, map: Record<string, string>) => svg.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (m, c) => (map[c.toUpperCase()] ? `fill="${map[c.toUpperCase()]}"` : m));
const b64 = (s: string) => Buffer.from(s).toString("base64");

// ---- builders ----
/** An SVG as editable vectors, scaled by `k`, inside a named frame at (x, y). */
const vec = (b: B, parent: Ref | undefined, svg: string, k: number, o: { name: string; x?: number; y?: number; opacity?: number }): Ref => {
  const d = dims(svg);
  const wrap = b.frame(parent, { name: o.name, x: o.x, y: o.y, w: Math.round(d.w * k * 100) / 100, h: Math.round(d.h * k * 100) / 100, clip: false, opacity: o.opacity });
  const im = b.add("file.import", { data: b64(svg), name: o.name + ".svg", x: -9000, y: -9000 });
  if (k !== 1) b.add("transform.scale", { ids: [im], factor: k });
  b.add("node.reparent", { ids: [im], parent: wrap });
  b.add("node.set", { ids: [im], x: 0, y: 0, name: o.name + " vectors" });
  return wrap;
};
const comp = (b: B, wrap: Ref) => b.add("component.create", { ids: [wrap] });
const inst = (b: B, c: Ref, parent: Ref, x: number, y: number, name: string) => { const i = b.add("instance.create", { component: c, parent, x, y }); b.add("node.set", { ids: [i], name }); return i; };
/** Native vector of the squircle path (bbox 0..1024), size px wide. */
const squircle = (b: B, parent: Ref, size: number, x: number, y: number, props: any, name: string) =>
  b.add("node.create", { type: "vector", name, path: clipD(svgFile("speakkit-logo-flat")), x, y, width: size, height: size, parent, props });

const INK = "#14161B", WHITE = "#FFFFFF", BLUE = "#0069CC", GUIDE = "#E5484D";
const panel = (b: B, p: Ref, x: number, y: number, w: number, h: number, name: string, fill = WHITE, o: any = {}) =>
  b.frame(p, { name, x, y, w, h, r: 12, fill, stroke: fill === WHITE ? "#EBEBEB" : "#00000014", sw: 1, sa: "inside", clip: false, ...o });
const cap = (b: B, p: Ref, s: string, x: number, y: number, c = "#475467", size = 12) => b.text(p, s, { x, y, size, c });
const head = (b: B, t: T, root: Ref, title: string, sub: string, w: number) => {
  b.text(root, title, { x: 36, y: 32, size: 22, weight: "SemiBold", c: t.text });
  b.text(root, sub, { x: 36, y: 66, size: 13, c: t.text2, w: Math.min(w - 72, 1500), lh: 19 });
};
const board = (b: B, t: T, w: number, h: number, root: Ref) => b.frame(root, { name: "board", x: 0, y: 0, w, h, fill: t.bg, clip: true });
const para = (b: B, p: Ref, s: string, o: { x: number; y: number; w: number; size?: number; c?: string; lh?: number; weight?: string }) => {
  const r = b.text(p, s, { x: o.x, y: o.y, w: o.w, size: o.size ?? 12, c: o.c ?? "#475467", lh: o.lh ?? 18, weight: o.weight });
  b.add("node.set", { ids: [r], textAutoResize: "height" });
  return r;
};
const scr = (id: string, title: string, note: string, w: number, h: number, build: (b: B, t: T, root: Ref) => void): S => ({ id, group: "LG", title, note, w, h, build });

// ---- LG1: primary mark ----
const lg1 = scr("LG1", "Primary mark", "The primary mark is the Voice hub in a continuous-corner squircle at 1024 px, shown on white and on ink.", 2400, 1280, (b, t, root) => {
  const c = board(b, t, 2400, 1280, root); head(b, t, c, "Primary mark: the Voice hub in its squircle", "1024 px canvas, squircle radius 22.4 % with smoothing 0.6, four pieces clipped to it, hub shadow 0 12 32 at 28 %. Main component: Logo / Primary.", 2400);
  const a = panel(b, c, 36, 110, 1100, 1100, "On white");
  const mw = vec(b, a, svgFile("speakkit-logo"), 1, { name: "Logo / Primary", x: 38, y: 38 }); const mc = comp(b, mw);
  const d = panel(b, c, 1164, 110, 1100, 1100, "On ink", INK);
  inst(b, mc, d, 38, 38, "Logo / Primary (instance)");
  cap(b, c, "On white: 1024 px, the pieces stay inside the squircle clip, seams are transparent.", 36, 1226); cap(b, c, "On ink: the same component; the hub shadow stays, the seams show the dark background.", 1164, 1226);
});

// ---- LG2: small variant ----
const lg2 = scr("LG2", "Small variant", "The small variant is for 48 px and below: wider seams, a bigger hub and a bolder wave.", 1600, 900, (b, t, root) => {
  const c = board(b, t, 1600, 900, root); head(b, t, c, "Small variant: 48 px and below", "Same silhouette and colours. Seams and ring 65 px (full: 41 px) on the 1024 grid, hub radius 240 (214), wave 27 % of the hub radius (19 %), wave amplitude of the seams 30 (42). No hub shadow. Main component: Logo / Small.", 1600);
  const a = panel(b, c, 36, 130, 560, 560, "Small master");
  const mw = vec(b, a, svgFile("speakkit-logo-small"), 0.5, { name: "Logo / Small", x: 24, y: 24 }); comp(b, mw);
  cap(b, c, "Logo / Small at 512 px", 36, 702);
  const r = panel(b, c, 632, 130, 932, 560, "Small against full");
  const sizes = [128, 64, 48, 32, 24, 16];
  [["Small", "speakkit-logo-small", 48], ["Full (flat)", "speakkit-logo-flat", 260]].forEach(([lab, f, y]) => {
    cap(b, r, lab as string, 24, (y as number) - 4, INK, 13);
    let x = 24;
    sizes.forEach((s) => { vec(b, r, svgFile(f as string), s / 1024, { name: `${lab} ${s}`, x, y: (y as number) + 24 + (128 - s) }); cap(b, r, `${s} px`, x, (y as number) + 24 + 136, "#5F6A7D", 11); x += s + 44; });
  });
  cap(b, r, "Full below 48 px: seams close up and the wave thins out. Small variant from 48 px down.", 24, 470, "#5F6A7D");
  const n = panel(b, c, 36, 740, 1528, 120, "Construction note", "#FFFFFF");
  para(b, n, "One line weight: the seams, the ring round the hub and the wave stroke are the same width. Full 40.7 px (r 214 x 0.19), small 64.8 px (r 240 x 0.27) on the 1024 grid. Use the small variant at 48 px and below, the full variant above; app icons at 48 px use the small variant.", { x: 20, y: 18, w: 1488, size: 13, c: t.text2, lh: 20 });
});

// ---- LG3: mono ----
const lg3 = scr("LG3", "One colour", "One colour: ink on light, white on dark, with the wave knocked out of the hub; small variants for small sizes.", 1600, 830, (b, t, root) => {
  const c = board(b, t, 1600, 830, root); head(b, t, c, "One colour: ink on light, white on dark", "The wave is knocked out of the hub, so the mark prints in a single ink. Main components: Logo / Mono ink, Logo / Mono white, Logo / Small mono ink, Logo / Small mono white.", 1600);
  const defs: [string, string, string, number][] = [["Logo / Mono ink", "speakkit-logo-mono-ink", WHITE, 0], ["Logo / Mono white", "speakkit-logo-mono-white", INK, 1], ["Logo / Small mono ink", "speakkit-logo-small-mono-ink", WHITE, 2], ["Logo / Small mono white", "speakkit-logo-small-mono-white", INK, 3]];
  defs.forEach(([name, f, bg, i]) => {
    const x = 36 + i * 388; const p = panel(b, c, x, 130, 360, 360, name + " panel", bg);
    const w = vec(b, p, svgFile(f), 296 / 1024, { name, x: 32, y: 32 }); comp(b, w); cap(b, c, name.replace("Logo / ", ""), x, 502);
  });
  [["On white", "ink", WHITE, 36], ["On ink", "white", INK, 812]].forEach(([lab, tone, bg, x]) => {
    const p = panel(b, c, x as number, 560, 752, 200, `${lab} sizes`, bg as string);
    let xx = 28;
    [128, 64, 48, 32, 24, 16].forEach((s) => { vec(b, p, svgFile(`speakkit-logo${s <= 48 ? "-small" : ""}-mono-${tone}`), s / 1024, { name: `Mono ${tone} ${s}`, x: xx, y: 28 + (128 - s) }); cap(b, p, `${s}`, xx, 170, bg === INK ? "#FFFFFFB3" : "#5F6A7D", 11); xx += s + 40; });
    cap(b, c, `${lab}: ${tone} mark, sizes 128 to 16 px (small variant from 48 px down)`, x as number, 774);
  });
});

// ---- LG4: lockups ----
const lg4 = scr("LG4", "Lockups", "Lockups pair the mark with the Speak Kit wordmark, horizontal or stacked, in ink on light and white on dark.", 1600, 1180, (b, t, root) => {
  const c = board(b, t, 1600, 1180, root); head(b, t, c, "Lockups: horizontal and stacked", "Wordmark Speak Kit in Inter Semi Bold, tracking -2 %, outlined. Horizontal: mark 200 px, gap 44, wordmark 128 px with its cap height centred on the mark. Stacked: mark 220 px over a 96 px wordmark.", 1600);
  const place = (x: number, y: number, w: number, h: number, bg: string, tone: string, kind: string, k: number) => {
    const p = panel(b, c, x, y, w, h, `${kind} ${tone} panel`, bg); const svg = svgFile(`speakkit-${kind}-${tone}`); const d = dims(svg);
    const m = vec(b, p, svg, k, { name: `Logo / ${kind[0].toUpperCase() + kind.slice(1)} ${tone}`, x: Math.round((w - d.w * k) / 2), y: Math.round((h - d.h * k) / 2) }); comp(b, m);
  };
  place(36, 130, 744, 280, WHITE, "ink", "lockup-horizontal", 0.8); place(820, 130, 744, 280, INK, "white", "lockup-horizontal", 0.8);
  cap(b, c, "Horizontal, ink on light (80 %)", 36, 422); cap(b, c, "Horizontal, white on dark (80 %)", 820, 422);
  place(36, 470, 744, 400, WHITE, "ink", "lockup-stacked", 1); place(820, 470, 744, 400, INK, "white", "lockup-stacked", 1);
  cap(b, c, "Stacked, ink on light", 36, 882); cap(b, c, "Stacked, white on dark", 820, 882);
  place(36, 930, 744, 150, WHITE, "ink", "wordmark", 0.6); place(820, 930, 744, 150, INK, "white", "wordmark", 0.6);
  cap(b, c, "Wordmark alone, ink (60 %)", 36, 1092); cap(b, c, "Wordmark alone, white (60 %)", 820, 1092);
});

// ---- LG5: app icons ----
const lg5 = scr("LG5", "App icons and tray", "App icons: macOS 1024 canvas with an 824 body and shadow, Windows .ico sizes, extension toolbar sizes, tray states and the menu-bar template.", 2400, 1620, (b, t, root) => {
  const W = 2400, c = board(b, t, W, 1620, root); head(b, t, c, "App icons: macOS, Windows, extension toolbar, tray", "App, tray and installer icons put a white squircle under the pieces so the seams are white; the in-app Logo and the menu-bar template keep transparent seams.", W);
  // macOS
  const mp = panel(b, c, 36, 110, 1100, 1100, "macOS panel", "#ECEDF0"); const cv = b.frame(mp, { name: "macOS icon canvas 1024", x: 38, y: 38, w: 1024, h: 1024, clip: false, stroke: "#0000001A", sw: 1, sa: "inside", dashes: [6, 6] } as any);
  squircle(b, cv, 824, 100, 100, { fill: WHITE, effects: [{ type: "dropShadow", color: "#0000004D", offset: [0, 10], radius: 20 }] }, "Body 824 with shadow");
  vec(b, cv, svgFile("speakkit-logo"), 824 / 1024, { name: "macOS icon pieces", x: 100, y: 100 });
  cap(b, c, "macOS: 1024 canvas, 824 squircle body (100 px margin), shadow 0 10 20 at 30 %, both baked into icon.png", 36, 1226);
  const sp = panel(b, c, 36, 1262, 1100, 322, "Icon sizes"); cap(b, sp, "Sizes and files", 24, 18, INK, 14);
  para(b, sp, "macOS icon.png: 1024 canvas, 824 x 824 body, corner radius 185 px (22.4 %), continuous curve, 100 px transparent margin, shadow 10 px down, blur 20, 30 % black. macOS does not mask or shadow icons, so both are drawn into the file.\n\nWindows .ico: 16, 24, 32, 48, 64, 128, 256 px, full-colour squircle, no extra plate; 94 % of the frame from 48 px up.\n\nExtension: 16, 32, 48 edge to edge, 128 at 94 %. Tray: 32 px (36 px at 2x on macOS), template cut-out for the plain states.", { x: 24, y: 52, w: 1050, size: 13, c: t.text2, lh: 20 });
  // Windows
  const wp = panel(b, c, 1164, 110, 1200, 360, "Windows panel"); cap(b, wp, "Windows .ico frames", 24, 18, INK, 14);
  let x = 24; const wsz = [256, 128, 64, 48, 32, 24, 16];
  wsz.forEach((s) => {
    const fr = b.frame(wp, { name: `Windows ${s}`, x, y: 52 + (256 - s), w: s, h: s, clip: false });
    const k = s <= 32 ? 1 : 0.94, o = (s - s * k) / 2;
    vec(b, fr, withTile(svgFile(s <= 48 ? "speakkit-logo-small" : "speakkit-logo")), (s * k) / 1024, { name: `Windows ${s} icon`, x: o, y: o });
    cap(b, wp, `${s}`, x, 52 + 256 + 8, "#5F6A7D", 11); x += s + 28;
  });
  cap(b, wp, "94 % of the frame from 48 px up, edge to edge at 32, 24 and 16 px; small variant up to 48 px", 24, 336, "#5F6A7D");
  // extension toolbar
  const ep = panel(b, c, 1164, 498, 1200, 400, "Extension panel"); cap(b, ep, "Extension toolbar icons (public/icons)", 24, 18, INK, 14);
  const strip = b.frame(ep, { name: "Chrome toolbar strip", x: 24, y: 52, w: 640, h: 48, r: 8, fill: "#FFFFFF", stroke: "#0000001F", sw: 1, sa: "inside", clip: false });
  const om = b.frame(strip, { name: "Omnibox", x: 12, y: 8, w: 460, h: 32, r: 16, fill: "#F1F3F4" }); b.text(om, "example.com", { x: 16, y: 7, size: 14, c: "#1F1F1F" });
  b.icon(b.frame(strip, { x: 488, y: 15, w: 18, h: 18 }), "puzzle", 18, "#444746"); vec(b, strip, withTile(svgFile("speakkit-logo-small")), 16 / 1024, { name: "Toolbar icon 16 px", x: 524, y: 16 });
  vec(b, strip, withTile(svgFile("speakkit-logo-small")), 32 / 1024, { name: "Toolbar icon 32 px (2x)", x: 556, y: 8 }); b.icon(b.frame(strip, { x: 604, y: 15, w: 18, h: 18 }), "moreV", 18, "#444746");
  cap(b, ep, "Toolbar at 100 % (16 px) and 200 % (32 px)", 24, 108, "#5F6A7D");
  let ex = 24; [128, 48, 32, 16].forEach((s) => {
    const fr = b.frame(ep, { name: `Extension ${s}`, x: ex, y: 160 + (128 - s), w: s, h: s, clip: false }); const k = s > 48 ? 0.94 : 1, o = (s - s * k) / 2;
    vec(b, fr, withTile(svgFile(s <= 48 ? "speakkit-logo-small" : "speakkit-logo")), (s * k) / 1024, { name: `Extension ${s} icon`, x: o, y: o }); cap(b, ep, `${s}`, ex, 160 + 136, "#5F6A7D", 11); ex += s + 56;
  });
  cap(b, ep, "16, 32 and 48 px edge to edge with the small variant; 128 px at 94 % (store and install dialogs)", 24, 340, "#5F6A7D");
  // tray states
  const states = ["normal", "asleep", "working", "error", "paused", "attention"];
  const tp = panel(b, c, 1164, 926, 1200, 330, "Tray panel"); cap(b, tp, "Tray icon states (Windows taskbar, 32 px with a 96 px enlargement)", 24, 18, INK, 14);
  states.forEach((s, i) => {
    const x0 = 24 + i * 192;
    vec(b, tp, trayVariant(s), 96 / 1024, { name: `Tray ${s} 96`, x: x0, y: 56 });
    const dk = b.frame(tp, { name: `Taskbar dark ${s}`, x: x0, y: 168, w: 80, h: 44, r: 6, fill: "#202020" }); vec(b, dk, trayVariant(s), 32 / 1024, { name: `Tray ${s} 32 dark`, x: 8, y: 6 }); vec(b, dk, trayVariant(s), 16 / 1024, { name: `Tray ${s} 16 dark`, x: 50, y: 14 });
    const lt = b.frame(tp, { name: `Taskbar light ${s}`, x: x0 + 88, y: 168, w: 80, h: 44, r: 6, fill: "#F3F3F3", stroke: "#0000001A", sw: 1, sa: "inside" }); vec(b, lt, trayVariant(s), 32 / 1024, { name: `Tray ${s} 32 light`, x: 8, y: 6 }); vec(b, lt, trayVariant(s), 16 / 1024, { name: `Tray ${s} 16 light`, x: 50, y: 14 });
    cap(b, tp, s, x0, 222, INK, 13);
  });
  para(b, tp, "Normal: the logo. Asleep: greyscale (engine unloaded). Working: blue dot. Error: red dot. Paused: grey dot. Attention: amber dot. The dot sits bottom right with a white ring.", { x: 24, y: 252, w: 1150, size: 12, c: "#5F6A7D" });
  // macOS menu bar
  const bp = panel(b, c, 1164, 1284, 1200, 300, "Menu bar panel"); cap(b, bp, "macOS menu bar (36 px at 2x, shown at 18 px logical)", 24, 18, INK, 14);
  [["Light bar", "#E9EAEE", INK, "speakkit-logo-small-mono-ink", 56], ["Dark bar", "#2B2C30", WHITE, "speakkit-logo-small-mono-white", 150]].forEach(([lab, bg, ink, tpl, y]) => {
    const bar = b.frame(bp, { name: `${lab}`, x: 24, y: y as number, w: 1152, h: 28, r: 6, fill: bg as string }); b.text(bar, lab as string, { x: 12, y: 7, size: 12, c: ink as string });
    states.forEach((s, i) => {
      const x0 = 160 + i * 150;
      if (s === "normal" || s === "asleep") vec(b, bar, svgFile(tpl as string), 18 / 1024, { name: `Menu bar ${s} ${lab}`, x: x0, y: 5, opacity: s === "asleep" ? 0.45 : 1 });
      else vec(b, bar, trayVariant(s), 18 / 1024, { name: `Menu bar ${s} ${lab}`, x: x0, y: 5 });
      b.text(bar, s, { x: x0 + 26, y: 7, size: 11, c: ink as string, opacity: 0.8 } as any);
    });
  });
  para(b, bp, "Normal and asleep are template images (black, wave knocked out; macOS tints them for light, dark and selected bars; asleep at 45 % opacity). The other states stay coloured with their dot.", { x: 24, y: 214, w: 1150, size: 12, c: "#5F6A7D" });
});

// ---- LG6: construction and rules ----
const lg6 = scr("LG6", "Construction and rules", "Construction: squircle 22.4 % with smoothing 0.6, seam = ring = wave = one line weight; clear space, minimum sizes, colours, do and don't.", 2400, 1560, (b, t, root) => {
  const W = 2400, c = board(b, t, W, 1560, root); head(b, t, c, "Construction and rules", "Everything is derived from the 1024 grid in designs/logo/final/logo.mjs.", W);
  // construction
  const cp = panel(b, c, 36, 110, 1000, 1000, "Construction panel"); const K = 880 / 1024, O = 60;
  vec(b, cp, svgFile("speakkit-logo-flat"), K, { name: "Construction mark", x: O, y: O, opacity: 0.35 });
  const line = (x: number, y: number, w: number, h: number, name: string) => b.rect(cp, { name, x, y, w, h, fill: GUIDE });
  line(O, O + 440 - 0.5, 880, 1, "Axis horizontal"); line(O + 440 - 0.5, O, 1, 880, "Axis vertical");
  squircle(b, cp, 880, O, O, { fill: "none", stroke: GUIDE, strokeWeight: 1.5 }, "Squircle outline");
  const circ = (r: number, name: string, dash = false) => b.ellipse(cp, { name, x: O + 440 - r * K, y: O + 440 - r * K, w: 2 * r * K, h: 2 * r * K, fill: "none", stroke: GUIDE, sw: 1.5, ...(dash ? { dashes: [6, 5] } : {}) } as any);
  circ(214, "Hub r 214"); circ(214 + 40.66, "Hub plus ring", true);
  cap(b, cp, "Squircle: radius 22.4 % = 229 px of 1024, Apple smoothing 0.6, pieces clipped to it", 24, 20, INK, 13);
  cap(b, cp, "Hub radius 214 (20.9 %); ring and seams 41 px; wave stroke 41 px, 1.2 x 214 wide", 24, 40, INK, 13);
  const ann = (s: string, x: number, y: number) => cap(b, cp, s, x, y, GUIDE, 12);
  ann("hub r 214", O + 440 + 20, O + 440 - 210 * K + 4); ann("hub + ring 255", O + 440 + 190 * K, O + 440 + 190 * K); ann("axis x 512", O + 450, O + 10);
  cap(b, cp, "Seam = ring = wave = 41 px (half-gap 20.3 each side of the cut). Small variant: 65 px.", 24, 960, "#5F6A7D");
  // clear space
  const rx = 1064, rw = 1300;
  const cs = panel(b, c, rx, 110, 640, 480, "Clear space"); cap(b, cs, "Clear space", 20, 16, INK, 14);
  const m = 200, q = m / 4; const box = b.frame(cs, { name: "Clear space box", x: 120, y: 90, w: m + 2 * q + 0, h: m + 2 * q, fill: "#E0EDF9", stroke: BLUE, sw: 1, dashes: [5, 4] } as any);
  vec(b, box, svgFile("speakkit-logo"), m / 1024, { name: "Clear space mark", x: q, y: q });
  b.rect(cs, { name: "Quarter marker top", x: 120, y: 90, w: m + 2 * q, h: 1, fill: BLUE, opacity: 0 }); cap(b, cs, "= 1/4 of the mark width on every side (50 px at 200 px)", 20, 420, "#5F6A7D");
  cap(b, cs, "1/4", 120 - 28, 90 + q / 2 - 7, BLUE, 12); cap(b, cs, "1/4", 120 + q + m + 6, 90 + q / 2 - 7, BLUE, 12);
  // min sizes
  const ms = panel(b, c, rx + 660, 110, 640, 480, "Minimum sizes"); cap(b, ms, "Minimum sizes and which variant", 20, 16, INK, 14);
  let sx = 20; [[128, "full"], [64, "full"], [48, "small"], [32, "small"], [24, "small"], [16, "small"]].forEach(([s, v]) => {
    vec(b, ms, svgFile(v === "small" ? "speakkit-logo-small" : "speakkit-logo-flat"), (s as number) / 1024, { name: `Min ${s}`, x: sx, y: 70 + (128 - (s as number))}); cap(b, ms, `${s}`, sx, 206, "#5F6A7D", 11); sx += (s as number) + 28;
  });
  para(b, ms, "Small variant at 48 px and below, full variant above. Never below 16 px. App and tray icons put the tile under the pieces; macOS menu bar uses the template.", { x: 20, y: 250, w: 600, size: 13, c: t.text2, lh: 20 });
  para(b, ms, "Primary file 64 px and up; the hub shadow is the only effect and is left out of the flat variant and of every one-colour version.", { x: 20, y: 330, w: 600, size: 13, c: t.text2, lh: 20 });
  // colours
  const cl = panel(b, c, rx, 618, rw, 220, "Colours"); cap(b, cl, "Colours", 20, 16, INK, 14);
  [["Hub", "#2F6BFF"], ["Sky", "#2EC5FF"], ["Read-word yellow", "#FFC23D"], ["Violet", "#7B61FF"], ["Deep blue", "#1F3FD1"], ["Ink", "#14161B"], ["White", "#FFFFFF"]].forEach(([n, hx], i) => {
    const x = 20 + i * 180; b.rect(cl, { name: `Swatch ${n}`, x, y: 52, w: 160, h: 80, r: 10, fill: hx, stroke: "#0000001F", sw: 1, sa: "inside" });
    b.text(cl, n, { x, y: 142, size: 13, weight: "SemiBold", c: INK }); b.text(cl, hx, { x, y: 162, size: 12, c: "#5F6A7D" });
  });
  // do / don't
  const dp = panel(b, c, rx, 866, rw, 660, "Do and don't"); cap(b, dp, "Do", 20, 16, "#17693D", 14);
  const tile = (x: number, y: number, bg: string, name: string, label: string, ok: boolean, draw: (p: Ref) => void) => {
    const p = b.frame(dp, { name, x, y, w: 190, h: 190, r: 10, fill: bg, stroke: "#0000001A", sw: 1, sa: "inside", clip: true }); draw(p);
    b.text(dp, label, { x, y: y + 198, size: 12, c: "#475467", w: 190 }); b.add("node.set", { ids: [b.add("node.create", { type: "ellipse", parent: dp, x: x + 8, y: y + 8, width: 20, height: 20, props: { fill: ok ? "#17693D" : "#A61B1B" } })], name: ok ? "ok dot" : "no dot" });
    return p;
  };
  const dos: [string, string, string, string, number][] = [
    ["Ink on light", WHITE, "speakkit-logo-mono-ink", "One colour: ink on light", 120], ["White on dark", INK, "speakkit-logo-mono-white", "One colour: white on dark", 120],
    ["Colour on white", WHITE, "speakkit-logo-flat", "Full colour on white or a very light surface", 120], ["Small at 32", WHITE, "speakkit-logo-small", "Small variant at small sizes", 32],
  ];
  dos.forEach(([n, bg, f, lab, sz], i) => tile(20 + i * 210, 48, bg, `Do ${n}`, lab, true, (p) => vec(b, p, svgFile(f), sz / 1024, { name: `Do ${n} mark`, x: (190 - sz) / 2, y: (190 - sz) / 2 })));
  cap(b, dp, "Don't", 20, 300, "#A61B1B", 14);
  const flat = svgFile("speakkit-logo-flat");
  const swap = swapFills(flat, { "#2EC5FF": "#7B61FF", "#7B61FF": "#2EC5FF", "#FFC23D": "#1F3FD1", "#1F3FD1": "#FFC23D" });
  const recol = swapFills(flat, { "#2EC5FF": "#FF5A7A", "#FFC23D": "#8A8F98", "#7B61FF": "#3DDC97", "#1F3FD1": "#B04BFF", "#2F6BFF": "#FF8A00" });
  const donts: [string, string, number, number, number, string][] = [
    ["Recoloured", recol, 120, 1, 0, "Don't recolour the pieces"], ["Rearranged", swap, 120, 1, 0, "Don't rearrange the pieces"],
    ["Rotated", flat, 110, 1, 15, "Don't rotate"], ["Stretched", flat, 120, 1.5, 0, "Don't stretch or squash"],
  ];
  donts.forEach(([n, svg, sz, sx2, rot, lab], i) => tile(20 + i * 210, 328, WHITE, `Dont ${n}`, lab, false, (p) => {
    const m2 = vec(b, p, svg, sz / 1024, { name: `Dont ${n} mark`, x: (190 - sz * sx2) / 2, y: (190 - sz) / 2 });
    if (sx2 !== 1) b.add("node.set", { ids: [m2], width: sz * sx2 }); if (rot) b.add("node.set", { ids: [m2], rotation: rot });
  }));
  [["Busy background", "#E0EDF9"], ["Mid-tone one colour", "#7B61FF"]].forEach(([lab, bg], i) => tile(20 + (i + 4) * 210, 328, bg, `Dont ${lab}`, i === 0 ? "Don't add outlines, glows or other effects" : "Don't put the ink or white mark on a mid-tone", false, (p) => {
    const m2 = vec(b, p, svgFile(i === 0 ? "speakkit-logo-flat" : "speakkit-logo-mono-ink"), 120 / 1024, { name: `Dont ${lab} mark`, x: 40, y: 40 });
    if (i === 0) squircle(b, p, 136, 32, 32, { fill: "none", stroke: INK, strokeWeight: 4 }, "outline");
  }));
  para(b, dp, "The only effect is the hub shadow. The container is always the squircle; don't crop it to a circle or a square.", { x: 20, y: 580, w: 1240, size: 13, c: t.text2, lh: 20 });
});

export const LOGO_SCREENS: S[] = [lg1, lg2, lg3, lg4, lg5, lg6];
