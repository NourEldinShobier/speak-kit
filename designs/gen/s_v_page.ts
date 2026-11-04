// B group (on-page reading): every state of the content-script UI drawn on the fixture article, inside the real Chrome window on a Windows desktop (kit3).
// Geometry is measured from designs/built/shots/B*-light.png (1278x718 viewport) and the CSS in code/apps/extension/src (dock.css, launcher.css, shell.css, reader.css).
import { B, Ref } from "./lib";
import * as K3 from "./kit3";
import { S } from "./types";

const VW = 1278, VH = 718;
const INK = "#1B2230", SEC = "#475467", TER = "#5F6A7D", CTA = "#201E25", ON_CTA = "#FAFAFA", CTRL = "#E5E5E5", ACC = "#0069CC", RED = "#A61B1B";
const ds = (color: string, y: number, radius: number, spread = 0) => ({ type: "dropShadow", color, offset: [0, y], radius, ...(spread ? { spread } : {}) });
let POP = [ds("#0000001A", 0, 0, 1), ds("#0000000F", 2, 6)]; // --shadow-popover (reassigned for a dark host page, shell.css data-theme dark)
const SHCTL = [ds("#0000000F", 1, 2)];
const SHCTA = [ds("#0000001A", 2, 4)];

// ------------------------------------------------------------------ page (fixture article, support.ts articleHtml)
type PageC = { bg: string; text: string; kick: string; by: string; hr: string; sent: string; word: string; wordTx: string };
const LIGHT_PAGE: PageC = { bg: "#FFFFFF", text: "#202020", kick: "#0069CC", by: "#606060", hr: "#E2E2E5", sent: "#FFF1C2", word: "#FFD24D", wordTx: "#1E1F20" };
const DARK_PAGE: PageC = { bg: "#17181C", text: "#E4E5E9", kick: "#6CB4FF", by: "#9A9CA6", hr: "#2D2F36", sent: "#78621F", word: "#F2C04E", wordTx: "#1E1F20" };
const TITLE = "The quiet return of local-first software";
const L1 = ["For a decade, the default answer to every software question was the cloud. Notes,", "documents and even voices lived on someone else's server, rented back to us by", "the month. Lately that answer has started to wobble. Small models now run on an", "ordinary laptop, and they sound good enough that nobody asks where the audio", "came from."];
const L2 = ["The appeal is simple. When the work happens on your own machine, it keeps", "working on a plane, in a tunnel, and long after a startup has changed its pricing.", "Nothing leaves the device, so there is nothing to leak. Speed stops depending on a", "data centre three time zones away."];
const L3 = ["None of this is nostalgia. It is a bet that the best software is the kind that disappears", "into the task, and that it can only do so when it is fast, private and yours to keep."];
const PARAS = [L1, L2, L3];
const TOPS = [253, 421, 559]; // paragraph tops

export type Hl = { word?: string; para?: number; sentOnly?: boolean; tint?: "hover" | "reading" };
type Seg = { t: string; k?: "s" | "w" | "sel" };
/** Splits line `i` of paragraph 1 into segments: the current sentence (Notes ... the month.) and, optionally, one word inside it. */
const p1Segs = (i: number, o: { sent?: boolean; sel?: boolean; word?: string }): Seg[] => {
  const line = L1[i];
  const k: "s" | "sel" = o.sel ? "sel" : "s";
  if (!o.sent && !o.sel) return [{ t: line }];
  const cut = (txt: string, kind: "s" | "sel", pre = ""): Seg[] => {
    if (o.word && !o.sel && txt.includes(` ${o.word} `)) { const j = txt.indexOf(` ${o.word} `) + 1; return [...(pre ? [{ t: pre }] : []), { t: txt.slice(0, j), k: kind }, { t: o.word, k: "w" as const }, { t: txt.slice(j + o.word.length), k: kind }]; }
    return [...(pre ? [{ t: pre }] : []), { t: txt, k: kind }];
  };
  if (i === 0) { const j = line.indexOf("Notes,"); return cut(line.slice(j), k, line.slice(0, j)); }
  if (i === 1) return cut(line, k);
  if (i === 2) {
    if (o.sel) { const j = line.indexOf(" Small"); return [{ t: line.slice(0, j), k: "sel" }, { t: line.slice(j) }]; } // selection ends after "wobble."
    const j = line.indexOf(" Lately"); return [{ t: line.slice(0, j), k }, { t: line.slice(j) }];
  }
  return [{ t: line }];
};
const SP = 5; // Inter 18 px space advance
const lineRow = (b: B, parent: Ref, y: number, segs: Seg[], pc: PageC) => {
  const row = b.row(parent, { name: "Text line", x: 279, y, w: 720, h: 30, gap: 0, align: "center", justify: "min" });
  const put = (host: Ref, t: string, c: string, deco: boolean, fill?: string) => {
    const lead = /^ /.test(t), trail = / $/.test(t), core = t.trim();
    const sp = () => b.frame(host, { w: SP, h: 22, fill });
    if (lead) sp();
    b.text(host, core, { size: 18, lh: 22, c, ff: "Inter", textDecoration: deco ? "underline" : undefined });
    if (trail) sp();
  };
  segs.forEach((s) => {
    if (!s.k) { put(row, s.t, pc.text, false); return; }
    const fill = s.k === "sel" ? "#3367D1" : s.k === "w" ? pc.word : pc.sent;
    const f = b.row(row, { h: s.k === "sel" ? 30 : 22, gap: 0, fill, align: "center" });
    put(f, s.t, s.k === "sel" ? "#FFFFFF" : s.k === "w" ? pc.wordTx : pc.text, s.k !== "sel", fill);
  });
  return row;
};
/** The article column. dy shifts everything up (scrolled page). */
const article = (b: B, vp: Ref, o: { dark?: boolean; sent?: boolean; sel?: boolean; word?: string; dy?: number }) => {
  const pc = o.dark ? DARK_PAGE : LIGHT_PAGE; const dy = -(o.dy ?? 0);
  const g = b.frame(vp, { name: "Page", x: 0, y: 0, w: VW, h: VH, fill: pc.bg, clip: true });
  b.text(g, "ESSAY · 8 MIN READ", { x: 279, y: 56 + dy, size: 12, lh: 15, weight: "SemiBold", c: pc.kick, ls: 1 });
  b.text(g, TITLE, { x: 279, y: 89 + dy, w: 720, size: 40, lh: 46, weight: "Bold", c: o.dark ? "#FFFFFF" : "#202020" });
  b.text(g, "Maya Okafor · October 28, 2026", { x: 279, y: 199 + dy, size: 14, lh: 17, c: pc.by });
  b.rect(g, { x: 279, y: 234 + dy, w: 720, h: 1, fill: pc.hr });
  PARAS.forEach((ls, pi) => ls.forEach((ln, i) => {
    const y = TOPS[pi] + i * 30 + dy - 1;
    if (pi === 0) lineRow(b, g, y, p1Segs(i, o), pc);
    else lineRow(b, g, y, [{ t: ln }], pc);
  }));
  return g;
};

// ------------------------------------------------------------------ small parts
const txt = (b: B, p: Ref, s: string, o: Record<string, any> = {}) => b.text(p, s, { ff: "Inter", ...o });
const logo = (b: B, p: Ref, size: number, o: Record<string, any> = {}) => { const w = K3.skLogo(b, p, size, o); return w; };
/** lm-btn--icon sm: 28 px, r8, transparent. */
const ib = (b: B, p: Ref, icon: string, o: { size?: number; c?: string; iconSize?: number; opacity?: number; hover?: boolean; tip?: string } = {}) => {
  const s = o.size ?? 28; const f = b.row(p, { w: s, h: s, r: 8, justify: "center", opacity: o.opacity, fill: o.hover ? "#0000000A" : undefined }); b.icon(f, icon, o.iconSize ?? 16, o.c ?? INK);
  return f;
};
const avatar = (b: B, p: Ref, ch: string, size: number, fill: string) => { const f = b.row(p, { w: size, h: size, r: 999, fill, justify: "center" }); txt(b, f, ch, { size: Math.round(size * 0.42), weight: "SemiBold", c: ON_CTA }); return f; };
/** lm-btn sm secondary / primary / ghost */
const btn = (b: B, p: Ref, label: string, v: "primary" | "secondary" | "ghost", o: { icon?: string; iconRight?: string; w?: number; h?: number; hover?: boolean } = {}) => {
  const prim = v === "primary";
  const f = b.row(p, { h: o.h ?? 28, w: o.w ?? "hug", pad: [0, prim ? 12 : 12], gap: 6, r: 8, justify: "center", fill: prim ? (o.hover ? "#36343A" : CTA) : v === "secondary" ? "#FFFFFF" : "none", stroke: v === "secondary" ? CTRL : undefined, sw: 1, sa: "inside", effects: prim ? SHCTA : v === "secondary" ? SHCTL : undefined });
  if (o.icon) b.icon(f, o.icon, 14, prim ? ON_CTA : SEC);
  txt(b, f, label, { size: 13, lh: 16, weight: "Medium", c: prim ? ON_CTA : v === "secondary" ? "#171717" : SEC, ls: -0.13 });
  if (o.iconRight) b.icon(f, o.iconRight, 14, SEC);
  return f;
};
const tooltip = (b: B, p: Ref, label: string, keys: string | undefined, x: number, y: number) => {
  const f = b.row(p, { name: "Tooltip", x, y, h: 28, pad: [0, 12], gap: 6, r: 6, fill: INK });
  txt(b, f, label, { size: 12, lh: 16, c: "#F0F0F0" });
  if (keys) { const k = b.row(f, { h: 16, pad: [0, 4], r: 4, stroke: "#F0F0F066", sw: 1, sa: "inside", justify: "center" }); txt(b, k, keys, { size: 10, lh: 12, c: "#F0F0F0" }); }
  return f;
};
const popover = (b: B, p: Ref, x: number, y: number, w: number, name = "Popover") =>
  b.col(p, { name, x, y, w, pad: 12, gap: 10, r: 10, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: POP });

// ------------------------------------------------------------------ the read-aloud pill (dock.ts / dock.css)
type Dock = "idle" | "playing" | "paused" | "preparing" | "waking" | "finished" | "error";
const SHELL = (b: B, p: Ref, y: number) => b.row(p, { name: "Read-aloud pill", y, x: 0, w: VW, h: 52, justify: "center", align: "center" });
const pillBox = (b: B, p: Ref, name = "Read-aloud pill") => b.row(p, { name, h: 52, pad: [6, 10, 6, 12], gap: 10, r: 12, fill: "#FFFFFF", effects: POP });
const idlePill = (b: B, p: Ref, sub = "45 s at 1.2x") => {
  const f = pillBox(b, p);
  logo(b, f, 28);
  const col = b.col(f, { gap: 2 }); txt(b, col, "Read this page", { size: 13, lh: 16, weight: "SemiBold", c: INK }); txt(b, col, sub, { size: 12, lh: 15, c: SEC });
  const pb = b.row(f, { w: 40, h: 40, r: 999, fill: CTA, justify: "center", effects: SHCTA }); b.icon(pb, "play", 16, ON_CTA);
  ib(b, f, "moreV"); ib(b, f, "x");
  return f;
};
const readingPill = (b: B, p: Ref, st: Dock, closeHover = false) => {
  const off = st === "preparing" || st === "waking" || st === "finished";
  const f = pillBox(b, p);
  ib(b, f, "skipBack", { opacity: off ? 0.5 : undefined });
  const pb = b.row(f, { w: 40, h: 40, r: 999, fill: CTA, justify: "center", effects: SHCTA, opacity: st === "preparing" || st === "waking" ? 0.5 : undefined });
  b.icon(pb, st === "playing" ? "pause" : st === "paused" ? "play" : st === "finished" ? "refresh" : "loader", 16, ON_CTA);
  ib(b, f, "skipFwd", { opacity: off ? 0.5 : undefined });
  const mid = b.col(f, { w: 220, gap: 7 });
  txt(b, mid, st === "preparing" ? "Preparing voice..." : st === "waking" ? "Waking the voice engine..." : st === "finished" ? "Done · Read again" : "Paragraph 2 of 4 · 4 min left", { size: 12, lh: 15, weight: "Medium", c: INK });
  const tr = b.frame(mid, { w: 220, h: 4, r: 2, fill: "#F0F0F0", clip: true });
  if (st === "finished") b.rect(tr, { x: 0, y: 0, w: 220, h: 4, fill: ACC });
  else if (st === "playing" || st === "paused") b.rect(tr, { x: 0, y: 0, w: 80, h: 4, fill: ACC });
  const sp = b.row(f, { h: 28, w: 50, r: 8, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", justify: "center", effects: SHCTL }); txt(b, sp, "1.2x", { size: 13, lh: 16, weight: "Medium", c: "#171717", ls: -0.13 });
  const vc = b.row(f, { name: "Voice chip", h: 28, pad: [0, 6, 0, 4], gap: 6, r: 8, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: SHCTL });
  avatar(b, vc, "H", 20, CTA); txt(b, vc, "Heart · on device", { size: 13, lh: 16, c: SEC, weight: "Regular" }); b.icon(vc, "down", 14, SEC);
  ib(b, f, "moreV"); ib(b, f, "x", closeHover ? { hover: true } : {});
  return f;
};
const ERR: Record<string, { msg: string; act?: string; primary?: boolean }> = {
  offline: { msg: "Speak Kit isn't running", act: "Open app", primary: true },
  token: { msg: "Speak Kit needs to be paired", act: "Settings", primary: true },
  engine: { msg: "Voice engine is still loading" },
  generic: { msg: "Speech synthesis failed." },
  unreadable: { msg: "Speak Kit can't read this page" },
};
const errorPill = (b: B, p: Ref, kind: keyof typeof ERR, retry: boolean) => {
  const e = ERR[kind];
  const f = pillBox(b, p);
  logo(b, f, 28); b.icon(f, "alertCircle", 18, RED);
  txt(b, f, e.msg, { size: 13, lh: 16, weight: "SemiBold", c: INK });
  if (e.act) btn(b, f, e.act, "primary");
  if (retry) btn(b, f, "Retry", "secondary");
  ib(b, f, "moreV"); ib(b, f, "x");
  return f;
};

type Ov = (b: B, vp: Ref) => void;
const dockOv = (st: Dock, o: { kind?: keyof typeof ERR; retry?: boolean; asleep?: boolean; raise?: boolean; closeHover?: boolean } = {}): Ov => (b, vp) => {
  const err = st === "error";
  const row = SHELL(b, vp, err ? 630 : 641);
  if (st === "idle") idlePill(b, row); else if (err) errorPill(b, row, o.kind ?? "offline", o.retry ?? true); else readingPill(b, row, st, o.closeHover);
  if (o.closeHover) tooltip(b, vp, "Close for this tab", undefined, 890, 607); // above the x button (centre x 952 of the playing pill)
  if (err) { const d = b.row(vp, { x: 0, y: 686, w: VW, h: 28, justify: "center" }); btn(b, d, "Details", "ghost", { iconRight: "down" }); }
};

// ------------------------------------------------------------------ other on-page surfaces
const GREEN = "#17693D";
const bubbleOv = (tip: boolean): Ov => (b, vp) => {
  const f = b.row(vp, { name: "Selection bubble", x: 553, y: 209, h: 40, pad: [0, 4], gap: 4, r: 12, fill: "#FFFFFF", effects: POP });
  const l = b.row(f, { h: 32, pad: [0, 12], gap: 6, r: 8, fill: tip ? "#36343A" : CTA, effects: SHCTA, justify: "center" });
  b.icon(l, "play", 14, ON_CTA); txt(b, l, "Listen", { size: 13, lh: 16, weight: "Medium", c: ON_CTA, ls: -0.13 });
  const sl = b.row(f, { w: 28, h: 28, r: 8, justify: "center" }); adjust(b, sl, 16, INK); ib(b, f, "copy");
  if (tip) tooltip(b, vp, "Listen to selection", "Ctrl+Shift+S", 496, 179);
};
const toastOv = (msg: string, kind: "ok" | "err" | "info", action?: string): Ov => (b, vp) => {
  const row = b.row(vp, { name: "Toast", x: 0, y: 630, w: VW, h: 52, justify: "center" });
  const f = b.row(row, { h: 52, pad: [0, 13], gap: 12, r: 12, fill: "#FFFFFF", effects: POP });
  b.icon(f, kind === "ok" ? "circleCheck" : kind === "err" ? "alertCircle" : "info", 18, kind === "ok" ? GREEN : kind === "err" ? RED : SEC);
  txt(b, f, msg, { size: 14, lh: 20, c: INK, ls: -0.14 });
  if (action) btn(b, f, action, "secondary");
};
/** Tabler arrow-up (not in tabler.json), 1.5 px stroke, drawn as a vector in a size x size box */
const arrowUp = (b: B, p: Ref, size: number, c: string) => {
  const k = size / 24; const f = b.frame(p, { w: size, h: size });
  const P = (x: number, y: number) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`;
  b.add("node.create", { type: "vector", path: `M${P(12, 5)} L${P(12, 19)} M${P(18, 11)} L${P(12, 5)} L${P(6, 11)}`, parent: f, x: 0, y: 0, props: { fill: "none", stroke: c, strokeWeight: 1.5, strokeCap: "round", strokeJoin: "round" } });
  return f;
};
/** Tabler adjustments (vertical sliders; only the horizontal variant is in tabler.json) */
const adjust = (b: B, p: Ref, size: number, c: string) => {
  const k = size / 24; const f = b.frame(p, { w: size, h: size });
  const P = (x: number, y: number) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`; const R = (2 * k).toFixed(2);
  const ring = (cx: number, cy: number) => `M${P(cx - 2, cy)} A${R} ${R} 0 1 0 ${P(cx + 2, cy)} A${R} ${R} 0 1 0 ${P(cx - 2, cy)}`;
  const d = [ring(6, 10), `M${P(6, 4)} L${P(6, 8)}`, `M${P(6, 12)} L${P(6, 20)}`, ring(12, 16), `M${P(12, 4)} L${P(12, 14)}`, `M${P(12, 18)} L${P(12, 20)}`, ring(18, 7), `M${P(18, 4)} L${P(18, 5)}`, `M${P(18, 9)} L${P(18, 20)}`].join(" ");
  b.add("node.create", { type: "vector", path: d, parent: f, x: 0, y: 0, props: { fill: "none", stroke: c, strokeWeight: 1.5, strokeCap: "round", strokeJoin: "round" } });
  return f;
};
const backOv: Ov = (b, vp) => {
  const row = b.row(vp, { name: "Back to current", x: 0, y: 16, w: VW, h: 36, justify: "center" });
  const f = b.row(row, { h: 36, pad: [0, 12.5], gap: 6, r: 12, fill: "#FFFFFF", effects: POP, justify: "center" });
  arrowUp(b, f, 14, SEC); txt(b, f, "Back to current", { size: 13, lh: 16, weight: "Medium", c: "#171717", ls: -0.13 });
};
/** paragraph play gutter: tint over the paragraph, a 24 px button left of it, tooltip further left */
const gutterOv = (ptop: number, ph: number, reading: boolean, tip: string): Ov => (b, vp) => {
  b.rect(vp, { name: "Paragraph tint", x: 279, y: ptop, w: 720, h: ph, r: 8, fill: reading ? "#0069CC24" : "#0069CC14" });
  const g = b.row(vp, { name: "Gutter button", x: 231, y: ptop + 2, w: 24, h: 24, r: 8, justify: "center", fill: reading ? CTA : "#FFFFFF", stroke: reading ? undefined : CTRL, sw: 1, sa: "inside", effects: reading ? SHCTA : SHCTL });
  b.icon(g, reading ? "volume" : "play", 14, reading ? ON_CTA : SEC);
  tooltip(b, vp, tip, undefined, reading ? 55 : 100, ptop + 4 - 1);
};
const speedPop: Ov = (b, vp) => {
  const p = b.frame(vp, { name: "Speed popover", x: 420, y: 438, w: 300, h: 180, r: 10, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: POP });
  txt(b, p, "Speed", { x: 13, y: 13, size: 14, lh: 20, weight: "SemiBold", c: INK });
  b.rect(p, { x: 13, y: 49, w: 208, h: 5, r: 3, fill: "#F0F0F0" });
  b.rect(p, { x: 13, y: 49, w: 46, h: 5, r: 3, fill: ACC });
  b.ellipse(p, { x: 51, y: 44, w: 16, h: 16, fill: "#FFFFFF", stroke: "#C3C6CC", sw: 1, sa: "outside", effects: [ds("#0000001F", 1, 2)] });
  txt(b, p, "0.5x", { x: 13, y: 64, size: 11, lh: 14, c: TER }); txt(b, p, "3x", { x: 211, y: 64, size: 11, lh: 14, c: TER });
  txt(b, p, "1.2x", { x: 235, y: 43, w: 52, size: 14, lh: 17, weight: "SemiBold", c: INK, ta: "right" });
  ["0.5x", "1x", "1.2x", "1.5x", "2x", "3x"].forEach((v, i) => {
    const on = v === "1.2x";
    const bt = b.row(p, { x: 13 + i * 46.67, y: 91, w: 40.67, h: 36, r: 4, justify: "center", fill: on ? "#FFFFFF" : "none", stroke: on ? CTRL : undefined, sw: 1, sa: "inside", effects: on ? SHCTL : undefined });
    txt(b, bt, v, { size: 13, lh: 16, weight: "Medium", c: on ? "#171717" : SEC, ls: -0.13 });
  });
  const r = b.row(p, { x: 13, y: 137, h: 28, pad: [0, 12], gap: 6, r: 8, justify: "center" });
  b.icon(r, "refresh", 14, SEC); txt(b, r, "Reset to 1x", { size: 13, lh: 16, weight: "Medium", c: SEC, ls: -0.13 });
};
const VOICES = [["Heart", "US English · Quality A", true], ["Bella", "US English · Quality A-", false], ["Nicole", "US English · Quality B-", false], ["Aoede", "US English · Quality C+", false]] as const;
const voicePop: Ov = (b, vp) => {
  const p = b.frame(vp, { name: "Voice popover", x: 571, y: 454, w: 320, h: 318, r: 10, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: POP });
  txt(b, p, "Voice", { x: 13, y: 13, size: 14, lh: 20, weight: "SemiBold", c: INK });
  txt(b, p, "28 voices", { x: 13, y: 39, size: 12, lh: 15, c: SEC });
  const inp = b.row(p, { x: 13, y: 67, w: 294, h: 28, pad: [0, 10], gap: 8, r: 8, fill: "#FFFFFF", stroke: "#171717", sw: 2, sa: "inside" });
  b.icon(inp, "search", 16, TER); txt(b, inp, "Search voices", { size: 13, lh: 16, c: "#6B7280" });
  VOICES.forEach(([n, sub, sel], i) => {
    const r = b.row(p, { x: 13, y: 105 + i * 46, w: 294, h: 44, pad: [0, 8], gap: 10, r: 4, fill: sel ? "#F0F0F0" : i === 2 ? "#F5F5F5" : "none" });
    avatar(b, r, n[0], 28, sel ? CTA : "#7A4CD9");
    const c = b.col(r, { w: "fill", gap: 1 }); txt(b, c, n, { size: 13, lh: 16, weight: "SemiBold", c: INK }); txt(b, c, sub, { size: 12, lh: 15, c: SEC });
    if (sel) b.icon(r, "check", 14, CTA);
    const pb = b.row(r, { w: 28, h: 28, justify: "center" }); b.icon(pb, "play", 14, INK);
  });
};
const moreMenu: Ov = (b, vp) => {
  const m = b.col(vp, { name: "More menu", x: 702, y: 537, w: 200, pad: 5, gap: 0, r: 10, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: POP });
  [["sliders", "Settings"], ["eyeOff", "Hide for this tab"], ["eyeOff", "Hide on this site"]].forEach(([ic, l]) => {
    const r = b.row(m, { w: "fill", h: 28, pad: [0, 6], gap: 6, r: 5 }); if (ic === "sliders") adjust(b, r, 16, "#667085"); else b.icon(r, ic, 16, "#667085"); txt(b, r, l, { size: 14, lh: 20, c: INK });
  });
};
// edge launcher (launcher.css .sk-tab / .sk-pill)
const tabOv = (reading: boolean): Ov => (b, vp) => {
  const w = reading ? 44 : 14;
  const t = b.frame(vp, { name: "Edge tab", x: VW - w, y: 302, w, h: 76, r: [10, 0, 0, 10], fill: "#FFFFFF", effects: POP });
  if (!reading) { const c = b.row(t, { x: 0, y: 0, w, h: 76, justify: "center" }); b.icon(c, "left", 12, TER); return; }
  b.rect(t, { x: 5, y: 12, w: 3, h: 52, r: 2, fill: "#F0F0F0" }); b.rect(t, { x: 5, y: 12, w: 3, h: 18, r: 2, fill: "#05C283" });
  const pb = b.row(t, { x: 9, y: 25, w: 26, h: 26, r: 999, fill: CTA, justify: "center", effects: SHCTA }); b.icon(pb, "stop", 12, ON_CTA);
};
const vpillOv = (reading: boolean): Ov => (b, vp) => {
  const p = b.col(vp, { name: "Edge pill", x: VW - 14 - 60, y: 232, w: 60, pad: [10, 0], gap: 8, align: "center", r: 12, fill: "#FFFFFF", effects: POP });
  ib(b, p, "right", { iconSize: 14 }); logo(b, p, 32);
  const big = b.row(p, { w: 44, h: 44, r: 999, fill: "#36343A", justify: "center", effects: SHCTA }); b.icon(big, reading ? "pause" : "play", 16, ON_CTA);
  if (reading) {
    const rail = b.frame(p, { w: 4, h: 56, r: 2, fill: "#F0F0F0", clip: true }); b.rect(rail, { x: 0, y: 0, w: 4, h: 20, fill: "#05C283" });
    txt(b, p, "4:21", { size: 12, lh: 15, weight: "Medium", c: SEC, ff: "Consolas" });
  }
  b.rect(p, { w: 28, h: 1, fill: "#EBEBEB" });
  if (reading) { ib(b, p, "back10"); ib(b, p, "fwd10"); } else ib(b, p, "book", { size: 36 });
  const sp = b.row(p, { w: 44, h: 28, r: 8, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", justify: "center", effects: SHCTL }); txt(b, sp, "1.2x", { size: 13, lh: 16, weight: "Medium", c: "#171717", ls: -0.13 });
  const vc = b.row(p, { w: 36, h: 36, r: 8, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", justify: "center", effects: SHCTL }); avatar(b, vc, "H", 24, CTA);
  if (reading) ib(b, p, "stop", { size: 36, iconSize: 14 }); else ib(b, p, "moreV", { size: 36 });
  if (reading) tooltip(b, vp, "Pause", "Space", 1089, 326); else tooltip(b, vp, "Listen to this page", "0:45", 1029, 326);
};

// ------------------------------------------------------------------ reader view (reader.css), serif 19 px / 1.7, column 680
type RTheme = { bg: string; fg: string; muted: string; block: string; sent: string; word: string; line: string };
const PAPER: RTheme = { bg: "#F4ECD8", fg: "#2B2A28", muted: "#6B6557", block: "#ECE1C4", sent: "#E3D09B", word: "#F0B95A", line: "#D9CFB4" };
const RLIGHT: RTheme = { bg: "#FFFFFF", fg: "#1B2230", muted: "#5F6A7D", block: "#F5F5F5", sent: "#D7E4F0", word: "#F0B95A", line: "#EBEBEB" };
const RL1 = ["For a decade, the default answer to every software question was the cloud.", "Notes, documents and even voices lived on someone else's server, rented back to", "us by the month. Lately that answer has started to wobble. Small models now", "run on an ordinary laptop, and they sound good enough that nobody asks", "where the audio came from."];
const RL2 = ["The appeal is simple. When the work happens on your own machine, it keeps", "working on a plane, in a tunnel, and long after a startup has changed its pricing.", "Nothing leaves the device, so there is nothing to leak. Speed stops depending on a", "data centre three time zones away."];
const RL3 = ["None of this is nostalgia. It is a bet that the best software is the kind that", "disappears into the task, and that it can only do so when it is fast, private and", "yours to keep."];
const SERIF = "Palatino Linotype", RLH = 32.3, RSP = 4.75;
const readerLine = (b: B, parent: Ref, y: number, segs: Seg[], th: RTheme) => {
  const row = b.row(parent, { name: "Text line", x: 299, y, w: 680, h: RLH, gap: 0, align: "center", justify: "min" });
  const put = (host: Ref, t: string, deco: boolean, fill?: string) => {
    const lead = /^ /.test(t), trail = / $/.test(t), core = t.trim();
    const sp = () => b.frame(host, { w: RSP, h: 24, fill });
    if (lead) sp();
    b.text(host, core, { size: 19, lh: 24, c: deco ? "#1E1F20" : th.fg, ff: SERIF });
    if (trail) sp();
  };
  segs.forEach((s) => {
    if (!s.k) { put(row, s.t, false); return; }
    const w = s.k === "w";
    const f = b.row(row, { h: 25, gap: 0, fill: w ? th.word : th.sent, r: w ? 3 : 4, align: "center" });
    put(f, s.t, w, w ? th.word : th.sent);
  });
};
const readerView = (b: B, vp: Ref, th: RTheme, word: string) => {
  const g = b.frame(vp, { name: "Reader view", x: 0, y: 0, w: VW, h: VH, fill: th.bg, clip: true });
  // bar
  const bar = b.frame(g, { name: "Reader bar", x: 0, y: 0, w: VW, h: 48 }); b.rect(bar, { x: 0, y: 47, w: VW, h: 1, fill: th.line });
  const cl = b.row(bar, { x: 12, y: 6, w: 36, h: 36, r: 8, justify: "center" }); b.icon(cl, "x", 16, th.fg);
  const src = b.row(bar, { x: 0, y: 0, w: VW, h: 47, gap: 8, justify: "center" }); b.icon(src, "book", 16, th.muted); txt(b, src, "127.0.0.1", { size: 13, lh: 16, weight: "Medium", c: th.muted });
  const ty = b.row(bar, { x: 1230, y: 6, w: 36, h: 36, r: 8, justify: "center" }); b.icon(ty, "type", 16, th.fg);
  // title and blocks
  txt(b, g, "The quiet return of local-first software", { x: 299, y: 87, w: 680, size: 33.25, lh: 42, weight: "Bold", c: th.fg, ff: SERIF });
  b.rect(g, { name: "Current block", x: 287, y: 158, w: 704, h: 173, r: 8, fill: th.block });
  RL1.forEach((ln, i) => {
    const y = 164 + i * RLH; let segs: Seg[];
    if (i === 1) { const j = ln.indexOf(word); segs = j < 0 ? [{ t: ln, k: "s" }] : [{ t: ln.slice(0, j), k: "s" }, { t: word, k: "w" }, { t: ln.slice(j + word.length), k: "s" }]; }
    else if (i === 2) { const j = ln.indexOf(" Lately"); segs = [{ t: ln.slice(0, j), k: "s" }, { t: ln.slice(j) }]; }
    else segs = [{ t: ln }];
    readerLine(b, g, y, segs, th);
  });
  RL2.forEach((ln, i) => readerLine(b, g, 350 + 6 + i * RLH, [{ t: ln }], th));
  RL3.forEach((ln, i) => readerLine(b, g, 511 + 6 + i * RLH, [{ t: ln }], th));
  b.rect(g, { name: "Focus ring", x: 0, y: 48, w: VW, h: VH - 48, fill: "none", stroke: ACC, sw: 1, sa: "inside" });
};
const readingPop: Ov = (b, vp) => {
  const p = b.frame(vp, { name: "Reading popover", x: 966, y: 50, w: 300, h: 227, r: 10, fill: "#FFFFFF", stroke: CTRL, sw: 1, sa: "inside", effects: POP });
  txt(b, p, "Reading", { x: 13, y: 13, size: 14, lh: 20, weight: "SemiBold", c: INK });
  const seg = (y: number, w: number, items: [string, number][], on: number) => {
    const f = b.row(p, { x: 13, y, w, h: 36, pad: 3, gap: 0, r: 8, fill: "#F0F0F0" });
    items.forEach(([l, iw], i) => { const o = b.row(f, { w: iw, h: 30, r: 5, justify: "center", fill: i === on ? "#FFFFFF" : "none", stroke: i === on ? CTRL : undefined, sw: 1, sa: "inside", effects: i === on ? SHCTL : undefined }); txt(b, o, l, { size: 13, lh: 16, weight: i === on ? "Medium" : "Regular", c: i === on ? "#171717" : TER }); });
  };
  seg(43, 206, [["Sans", 62], ["Serif", 56], ["Dyslexic", 85]], 1);
  const row = (cy: number, label: string, val: string, thumb: number) => {
    txt(b, p, label, { x: 13, y: cy - 10, size: 14, lh: 20, c: SEC });
    b.rect(p, { x: 93, y: cy - 2.5, w: 140, h: 5, r: 3, fill: "#F0F0F0" }); b.rect(p, { x: 93, y: cy - 2.5, w: thumb - 93, h: 5, r: 3, fill: ACC });
    b.ellipse(p, { x: thumb - 8, y: cy - 8, w: 16, h: 16, fill: "#FFFFFF", stroke: "#C3C6CC", sw: 1, sa: "outside", effects: [ds("#0000001F", 1, 2)] });
    txt(b, p, val, { x: 227, y: cy - 7.5, w: 60, size: 12, lh: 15, c: SEC, ta: "right" });
  };
  row(99.3, "Size", "19px", 145); row(128.7, "Width", "680px", 153);
  seg(149.3, 130, [["Paper", 63], ["Light", 62]], 0);
  txt(b, p, "Highlight sentence", { x: 13, y: 195, size: 14, lh: 20, c: SEC });
  b.rect(p, { name: "Highlight switch (unstyled in the product)", x: 271, y: 201.7, w: 16, h: 7, r: 3, fill: "#EFEFEF", stroke: "#767676", sw: 1, sa: "inside" });
};
// ------------------------------------------------------------------ frames
type Page = { id: string; title: string; note: string; url?: string; dark?: boolean; page?: Parameters<typeof article>[2]; ov?: Ov[]; rule?: string; view?: (b: B, vp: Ref, o: Page) => void; menuDesign?: boolean };
const frame = (o: Page): S => ({
  id: o.id, group: "B", title: o.title, note: o.note, w: 1440, h: 900,
  build: (b, t, root) => {
    const c = K3.chromeWin(b, root, { w: VW, h: VH + 81, url: o.url ?? "127.0.0.1:4173/essays/local-first", tabTitle: TITLE, backdrop: { w: 1440, h: 900 } });
    const vp = c.viewport.ref;
    POP = o.dark ? [ds("#FFFFFF2E", 0, 0, 1), ds("#00000059", 2, 8)] : [ds("#0000001A", 0, 0, 1), ds("#0000000F", 2, 6)];
    if (o.view) o.view(b, vp, o); else { article(b, vp, { dark: o.dark, ...(o.page ?? {}) }); }
    (o.ov ?? []).forEach((f) => f(b, vp));
  },
});

const READ = { sent: true, word: "on" };
export const Bs: S[] = [
  frame({ id: "B1", title: "Page · selection bubble", note: "Selecting text pops a bubble above the selection: Listen (tooltip with its shortcut), voice and speed, copy.", page: { sel: true }, ov: [bubbleOv(true)] }),
  frame({ id: "B2", title: "Page · paragraph gutter on a fresh page", note: "Before anything is read the margin is empty: no paragraph play button, no tint, no pill.", ov: [] }),
  frame({ id: "B4", title: "Page · pill idle", note: "The read-aloud pill appears bottom center: Speak Kit mark, Read this page with the time estimate, play, more.", ov: [dockOv("idle")] }),
  frame({ id: "B5", title: "Page · pill preparing", note: "Preparing voice: the play button shows a spinner and is dimmed, skips are disabled.", ov: [dockOv("preparing")] }),
  frame({ id: "B6", title: "Page · reading with highlight", note: "Sentence band with a 1 px underline plus the spoken word with a 2 px underline; the pill shows the paragraph and time left.", page: READ, ov: [dockOv("playing")] }),
  frame({ id: "B7", title: "Page · paused", note: "Paused keeps the highlight on the last spoken sentence; the button shows play.", page: READ, ov: [dockOv("paused")] }),
  frame({ id: "B8", title: "Page · finished", note: "Done replaces the text with Read again; the button replays.", ov: [dockOv("finished")] }),
  frame({ id: "B9", title: "Page · app offline error", note: "One surface: the pill explains the problem and offers Open app and Retry; Details sits below.", ov: [dockOv("error", { kind: "offline" })] }),
  frame({ id: "B11", title: "Page · reading on a dark site", note: "The pill stays white over a dark website; the highlight palette adapts to the page and the ring turns light.", dark: true, page: READ, ov: [dockOv("playing")] }),
  frame({ id: "B35", title: "Page · pill idle on a dark site", note: "The idle pill over a dark host page.", dark: true, ov: [dockOv("idle")] }),
  frame({ id: "B21", title: "Page · edge launcher reading on a dark site", note: "The reading tab over a dark host page.", dark: true, page: { sent: true, word: "lived" }, ov: [tabOv(true)] }),
  frame({ id: "B36", title: "Page · edge launcher tab on a dark site", note: "The resting 14 px tab over a dark host page.", dark: true, ov: [tabOv(false)] }),
  frame({ id: "B13", title: "Page · added to queue", note: "Confirmation toast after Add to queue, with a View queue button.", page: { sel: true }, ov: [bubbleOv(false), toastOv("Added to queue · 2 items", "ok", "View queue")] }),
  frame({ id: "B14", title: "Page · back to current", note: "The page was scrolled away from the spoken sentence; a pill at the top jumps back to it.", page: { ...READ, word: "voices", dy: 318 }, ov: [backOv, dockOv("playing")] }),
  frame({ id: "B15", title: "Page · speed popover", note: "Speed popover opened from the pill: slider with the live value and presets.", page: READ, ov: [dockOv("playing"), speedPop] }),
  frame({ id: "B16", title: "Page · voice popover", note: "Voice popover opened from the voice chip: search and a preview button on every row.", page: READ, ov: [dockOv("playing"), voicePop] }),
  frame({ id: "B17", title: "Page · edge launcher, hidden", note: "Resting state: only a 14 px tab at the right edge of the page.", ov: [tabOv(false)] }),
  frame({ id: "B18", title: "Page · edge launcher, hover", note: "Hovering the tab opens the vertical pill: logo, play with a tooltip showing the length, reader view, speed, voice, more.", ov: [vpillOv(false)] }),
  frame({ id: "B19", title: "Page · edge launcher, reading", note: "While reading the tab widens to 44 px with a stop button and a progress rail.", page: { sent: true, word: "lived" }, ov: [tabOv(true)] }),
  frame({ id: "B20", title: "Page · edge launcher, reading expanded", note: "Hover while reading: pause, progress rail with time left, 10 s skips, speed, voice, stop. The paragraph is tinted and tagged Reading this paragraph.", page: { sent: true, word: "someone" }, ov: [gutterOv(253, 150, true, "Reading this paragraph"), vpillOv(true)] }),
  frame({ id: "B22", title: "Page · pill, engine asleep", note: "The product shows the plain idle pill while the engine is asleep (identical to B4); play wakes it.", ov: [dockOv("idle")] }),
  frame({ id: "B23", title: "Page · pill, waking the engine", note: "Play on an unloaded engine: preparing lasts long enough that the pill says Waking the voice engine.", ov: [dockOv("waking")] }),
  frame({ id: "B25", title: "Page · pill, token rejected", note: "Pairing token rejected: Settings and Retry.", ov: [dockOv("error", { kind: "token" })] }),
  frame({ id: "B26", title: "Page · pill, engine not ready", note: "The engine is still loading: Retry only.", ov: [dockOv("error", { kind: "engine" })] }),
  frame({ id: "B27", title: "Page · pill, synthesis failed", note: "Speech synthesis failed: Retry.", ov: [dockOv("error", { kind: "generic" })] }),
  frame({ id: "B28", title: "Page · pill, page not readable", note: "The page has nothing readable: no actions.", ov: [dockOv("error", { kind: "unreadable", retry: false })] }),
  frame({ id: "B29", title: "Page · paragraph gutter while reading", note: "While reading, hovering another paragraph tints it and shows Read from here.", page: { sent: true, word: "voices" }, ov: [gutterOv(421, 120, false, "Read from here"), dockOv("playing")] }),
  frame({ id: "B30", title: "Page · error toast", note: "Error toast: red alert icon and the message.", ov: [toastOv("Could not add to the queue. Is Speak Kit running?", "err")] }),
  frame({ id: "B31", title: "Page · info toast", note: "Info toast: nothing was selected.", ov: [toastOv("Nothing selected to read", "info")] }),
  frame({ id: "B3", title: "Page · context menu", note: "Design-only: the native Chrome menu cannot be screenshotted. The Speak Kit entry opens Read selection, Read from here and Add to queue (menus.ts).", page: { sel: true }, ov: [(b, vp) => {
    const m = K3.nativeMenu(b, vp, { x: 560, y: 340, items: [{ l: "Copy", k: "Ctrl+C" }, { l: "Search Google for “Notes, documents and even…”" }, { l: "Print…", k: "Ctrl+P" }, "-", { l: "Speak Kit", sub: true, hi: true }, "-", { l: "Inspect", k: "Ctrl+Shift+I" }] });
    K3.nativeMenu(b, vp, { x: m.x + m.w - 4, y: m.y + 4 + 96 + 9 - 4, items: [{ l: "Read selection" }, { l: "Read from here" }, { l: "Add to queue" }] });
  }] }),
  frame({ id: "B10", title: "Page · reader view, paper", note: "Paper reader: serif 19 px, 680 px column, current block and sentence band, word marker; the pill stays below.", view: (b, vp) => readerView(b, vp, PAPER, "documents"), ov: [dockOv("playing")] }),
  frame({ id: "B34", title: "Page · reader view, light", note: "Light reader theme: white page, grey current block, blue sentence band.", view: (b, vp) => readerView(b, vp, RLIGHT, "documents"), ov: [dockOv("playing")] }),
  frame({ id: "B32", title: "Page · reader view, theme dark requested", note: "The dark reader theme was removed (light only): choosing it renders the paper theme, identical to B10.", view: (b, vp) => readerView(b, vp, PAPER, "documents"), ov: [dockOv("playing")] }),
  frame({ id: "B24", title: "Page · reading settings popover", note: "Reading popover opened from the reader bar: font, size, width, theme and the Highlight sentence switch (drawn unstyled, as the product renders it).", view: (b, vp) => readerView(b, vp, PAPER, "even"), ov: [dockOv("playing"), readingPop] }),
  frame({ id: "B37", title: "Page · close button hover", note: "Hovering the pill's x shows the Close for this tab tooltip; the click stops reading and removes the pill for this tab only.", page: READ, ov: [dockOv("playing", { closeHover: true })] }),
  frame({ id: "B38", title: "Page · closed for this tab", note: "After Close for this tab the page is left alone: reading stopped, highlight cleared, no pill and no edge tab until the page reloads. Other tabs are not affected.", ov: [] }),
  frame({ id: "B33", title: "Page · pill more menu", note: "The pill's more button opens Settings, Hide for this tab and Hide on this site. The x beside it closes the pill for this tab.", page: READ, ov: [dockOv("playing"), moreMenu] }),
];
