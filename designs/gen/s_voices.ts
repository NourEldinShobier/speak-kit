import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";

const W = 1280, H = 800;
const dim = (b: B, t: T, win: Ref) => b.rect(win, { abs: true, x: 0, y: 0, w: W, h: H, fill: t.overlay });
type Row = (f: Ref) => void;

// ---------- shared helpers (exported for s_sys.ts; keep non-array so main.ts ignores them) ----------
export const kbd12 = (b: B, t: T, p: Ref | undefined, keys: string[], o: { state?: "normal" | "amber" } = {}) => {
  if (o.state !== "amber") return K.kbd(b, t, p, keys);
  const f = b.row(p, { gap: 4 });
  keys.forEach((k) => { const c = b.row(f, { h: 19, pad: [0, 6], r: 4, fill: K.tint(t.warn, 0.16), stroke: t.warn, sw: 1, sa: "inside", justify: "center" }); b.text(c, k, { size: 11, c: t.warn }); });
  return f;
};
export const checkbox = (b: B, t: T, p: Ref | undefined, on: boolean, label: string) => {
  const r = b.row(p, { w: "fill", gap: 10, align: "start" });
  K.checkbox(b, t, r, on);
  b.text(r, label, { size: 13, c: t.text, w: "fill", lh: 19 });
  return r;
};
export const sliderBlock = (b: B, t: T, p: Ref | undefined, title: string, desc: string, v: number, w: number, o: { label: string; min: string; max: string }) => {
  const q = b.col(p, { w: "fill", gap: 6 }); b.text(q, title, { size: 13, weight: "Medium", c: t.text }); b.text(q, desc, { size: 12, c: t.text3, w: "fill", lh: 17 }); K.slider(b, t, q, v, w, o); return q;
};
export const kebab = (b: B, t: T, p: Ref | undefined, size = 32, o: { ring?: boolean } = {}) => K.iconBtn(b, t, p, "dots", { size, ring: o.ring });
export const dangerBtn = (b: B, t: T, p: Ref | undefined, label: string, icon?: string) => K.btn(b, t, p, label, { v: "dangerOutline", sz: "sm", icon });
export const tip = (b: B, t: T, win: Ref, xRight: number, y: number, w: number, msg: string) => K.tooltip(b, t, win, msg, undefined, { abs: true, x: xRight - w, y, w, shadow: "md" });
export const popover = (b: B, t: T, win: Ref, xRight: number, y: number, w: number) => K.menu(b, t, win, { abs: true, x: xRight - w, y, w });

// ---------- voice data (28 Kokoro voices, we draw 12) ----------
type V = [string, "US" | "UK", "Female" | "Male", string, string];
const VOICES: V[] = [
  ["Heart", "US", "Female", "A", "Warm, clear. Best all-rounder."], ["Bella", "US", "Female", "A-", "Bright and expressive."], ["Nicole", "US", "Female", "B-", "Soft and close, ASMR-like."], ["Sarah", "US", "Female", "C+", "Calm narrator."],
  ["Michael", "US", "Male", "C+", "Steady and neutral."], ["Fenrir", "US", "Male", "C+", "Deep and serious."], ["Emma", "UK", "Female", "B-", "Polished British."], ["George", "UK", "Male", "C", "Warm British."],
  ["Puck", "US", "Male", "C+", "Light and friendly."], ["Isabella", "UK", "Female", "C", "Clear British."], ["Fable", "UK", "Male", "C", "Storyteller tone."], ["Lewis", "UK", "Male", "D+", "Dry and measured."],
];
const gradeTone = (g: string): any => (g.startsWith("A") ? "ok" : g.startsWith("B") ? "info" : "neutral");
const accLabel = (a: string) => (a === "US" ? "US English" : "UK English");

const voiceCard = (b: B, t: T, p: Ref, v: V, i: number, o: { def?: boolean; playing?: boolean } = {}) => {
  const [n, a, g, gr, d] = v;
  const x = b.col(p, { w: 235, pad: 14, gap: 10, r: 14, fill: t.surface, stroke: o.def ? t.accent : t.border, sw: o.def ? 2 : 1, sa: "inside" });
  const h = b.row(x, { w: "fill", gap: 10, align: "start" });
  K.avatar(b, t, h, n, 36, i);
  const q = b.col(h, { gap: 1, w: "fill" });
  const nr = b.row(q, { gap: 6 }); b.text(nr, n, { size: 15, weight: "Bold", c: t.text }); if (o.def) K.badge(b, t, nr, "Default", "accent", "check");
  b.text(q, `${accLabel(a)} · ${g}`, { size: 12, c: t.text3 });
  b.icon(h, "heart", 16, i === 0 ? t.accent : t.text3);
  b.text(x, d, { size: 12.5, c: t.text2, w: "fill", lh: 17 });
  const f = b.row(x, { w: "fill", justify: "spaceBetween" });
  K.btn(b, t, f, o.playing ? "Stop" : "Preview", { v: o.playing ? "primary" : "soft", sz: "sm", icon: o.playing ? "stop" : "play" });
  K.badge(b, t, f, `Grade ${gr}`, gradeTone(gr));
  return x;
};
const cloneCard = (b: B, t: T, p: Ref, gated: boolean) => {
  const x = b.col(p, { w: 235, pad: 14, gap: 10, r: 14, fill: t.surface, stroke: t.border, sw: 1, sa: "inside", opacity: gated ? 0.6 : undefined });
  const h = b.row(x, { w: "fill", gap: 10, align: "start" });
  K.avatar(b, t, h, "Maya", 36, 4);
  const q = b.col(h, { gap: 1, w: "fill" }); b.text(q, "Maya (you)", { size: 15, weight: "Bold", c: t.text }); b.text(q, "Chatterbox voice", { size: 12, c: t.text3 });
  kebab(b, t, h, 28);
  const m = b.row(x, { gap: 6 }); K.badge(b, t, m, gated ? "Needs Chatterbox" : "Cloned", gated ? "warn" : "accent", gated ? "alert" : "mic"); K.badge(b, t, m, "AI voice", "neutral");
  const f = b.row(x, { w: "fill", gap: 8 });
  K.btn(b, t, f, "Preview", { v: "soft", sz: "sm", icon: "play", disabled: gated }); K.btn(b, t, f, "Style", { v: "secondary", sz: "sm", icon: "sliders", disabled: gated });
  return x;
};
const viewToggle = (b: B, t: T, p: Ref, view: "grid" | "list") => {
  const f = b.row(p, { h: 36, pad: 3, gap: 2, r: 10, fill: t.surface2 });
  [["grid", "Grid", "grid"], ["list", "List", "rows"]].forEach(([k, l, ic]) => {
    const a = k === view; const c = b.row(f, { h: 30, pad: [0, 10], gap: 6, r: 8, fill: a ? t.surface : "none", shadow: a ? "sm" : undefined });
    b.icon(c, ic, 15, a ? t.accent : t.text2); b.text(c, l, { size: 12.5, weight: a ? "SemiBold" : "Medium", c: a ? t.text : t.text2 });
  });
};

export const voicesScreen = (b: B, t: T, win: Ref, main: Ref, o: { view?: "grid" | "list"; gated?: boolean; tooltip?: boolean; playing?: boolean } = {}) => {
  const { view = "grid", gated = false, tooltip = false, playing = false } = o;
  K.pageHeader(b, t, main, "Voices", gated ? "28 Kokoro voices · 1 cloned (needs Chatterbox)" : "28 Kokoro voices · 1 cloned (Chatterbox)", (r) => { K.input(b, t, r, { placeholder: "Search voices", icon: "search", w: 200 }); viewToggle(b, t, r, view); K.btn(b, t, r, "Clone a voice", { v: "primary", icon: "mic", disabled: gated }); });
  const c = b.col(main, { w: "fill", h: "fill", pad: [8, 32, 24, 32], gap: 16 });
  if (gated) {
    const bn = b.row(c, { w: "fill", pad: 16, gap: 16, r: 14, fill: t.warnSoft, stroke: t.warn, sw: 1, sa: "inside" });
    const ic = b.frame(bn, { w: 40, h: 40, r: 20, fill: t.surface, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "mic", 20, t.warn);
    const x = b.col(bn, { gap: 8, w: "fill" });
    b.text(x, "Cloning needs Chatterbox (2.4 GB)", { size: 15, weight: "Bold", c: t.text });
    const rq = b.row(x, { gap: 18 });
    [["NVIDIA GPU: GeForce RTX 3060", true], ["8 GB+ VRAM: 12 GB", true], ["Chatterbox: not installed", false]].forEach(([s, ok]) => { const q = b.row(rq, { gap: 6 }); b.icon(q, ok ? "circleCheck" : "alertCircle", 15, ok ? t.ok : t.warn); b.text(q, s as string, { size: 12.5, weight: "Medium", c: t.text }); });
    K.btn(b, t, bn, "Download in Engines", { v: "primary", iconRight: "arrowRight" });
  }
  const fr = b.row(c, { w: "fill", justify: "spaceBetween" });
  const fl = b.row(fr, { gap: 8 }); ["All", "US English", "UK English", "Female", "Male", "Favorites", "Cloned"].forEach((s, i) => K.chip(b, t, fl, s, i === 0));
  const fr2 = b.row(fr, { gap: 8 }); K.btn(b, t, fr2, "Grades", { v: "ghost", sz: "sm", icon: "info" }); K.select(b, t, fr2, "Sort: Grade", 140);
  if (view === "grid") {
    b.text(c, "Your voices", { size: 13, weight: "Bold", c: t.text });
    const yr = b.row(c, { gap: 14, align: "start" }); cloneCard(b, t, yr, gated);
    const add = b.col(yr, { w: 235, h: 127, r: 14, stroke: t.border, sw: 1.5, dashes: [6, 5], align: "center", justify: "center", gap: 6, opacity: gated ? 0.6 : undefined } as any);
    b.icon(add, "plus", 20, t.accent); b.text(add, "Clone a new voice", { size: 13, weight: "SemiBold", c: t.text2 });
    b.text(c, "Kokoro voices", { size: 13, weight: "Bold", c: t.text });
    const grid = b.frame(c, { layout: "horizontal", wrap: true, gap: 14, crossGap: 14, w: "fill", align: "start" });
    VOICES.slice(0, gated ? 4 : 8).forEach((v, i) => voiceCard(b, t, grid, v, i, { def: i === 0, playing: playing && i === 0 }));
    const mr = b.row(c, { gap: 8 }); b.text(mr, `Showing ${gated ? 4 : 8} of 28 voices`, { size: 12.5, c: t.text3 }); b.text(mr, "Show all", { size: 12.5, weight: "SemiBold", c: t.accent });
  } else {
    const list = K.card(b, t, c, { w: "fill", pad: 0, gap: 0 });
    const hd = b.row(list, { w: "fill", h: 34, pad: [0, 16], gap: 12, fill: t.surface2 });
    [["", 32], ["Voice", 170], ["Accent", 150], ["Gender", 80], ["Grade ↓", 90]].forEach(([s, w]) => b.text(hd, s as string, { size: 12, weight: "SemiBold", c: t.text3, w: w as number }));
    b.text(hd, "Style", { size: 12, weight: "SemiBold", c: t.text3, w: "fill" }); b.frame(hd, { w: 32, h: 20 });
    const rowOf = (n: string, a: string, g: string, gr: string, d: string, i: number, k: "voice" | "clone" | "playing" | "default") => {
      K.divider(b, t, list);
      const r = b.row(list, { w: "fill", h: 42, pad: [0, 16], gap: 12, fill: k === "playing" ? t.accentSoft : "none", opacity: k === "clone" && gated ? 0.6 : undefined });
      const pb = b.frame(r, { w: 32, h: 32, r: 16, fill: k === "playing" ? t.accent : t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, k === "playing" ? "pause" : "play", 13, k === "playing" ? t.ctaText : t.text2);
      const nm = b.row(r, { w: 170, gap: 6 }); b.text(nm, n, { size: 14, weight: "SemiBold", c: t.text }); if (k === "default" || k === "playing") K.badge(b, t, nm, "Default", "accent");
      const ac = b.row(r, { w: 150, gap: 8 }); const pl = b.row(ac, { h: 20, pad: [0, 6], r: 5, fill: t.surface2, stroke: t.border, sw: 1 }); b.text(pl, a === "Chatterbox" ? "—" : a, { size: 12, weight: "SemiBold", c: t.text2 }); b.text(ac, a === "UK" ? "UK English" : a === "US" ? "US English" : "Chatterbox", { size: 12.5, c: t.text2 });
      b.text(r, g, { size: 13, c: t.text2, w: 80 });
      const gw = b.row(r, { w: 90 }); if (gr === "—") K.badge(b, t, gw, gated ? "Needs Chatterbox" : "Cloned", gated ? "warn" : "accent"); else K.badge(b, t, gw, `Grade ${gr}`, gradeTone(gr));
      b.text(r, d, { size: 12.5, c: t.text2, w: "fill" });
      b.icon(r, i === 0 ? "heart" : "heart", 16, i === 0 ? t.accent : t.text3);
    };
    rowOf("Maya (you)", "Chatterbox", "Female", "—", "Your voice · 12 s reference", 9, "clone");
    VOICES.slice(0, 10).forEach(([n, a, g, gr, d], i) => rowOf(n, a, g, gr, d, i, i === 0 ? (playing ? "playing" : "default") : "voice"));
    K.divider(b, t, list); const ft = b.row(list, { w: "fill", h: 38, pad: [0, 16] }); b.text(ft, "Showing 11 of 29 voices", { size: 12.5, c: t.text3 });
  }
  if (tooltip) tip(b, t, win, 1096, 180, 300, "Grade rates the training data behind a voice, from A (best) to D. C voices are still fine for long reading.");
  if (gated) tip(b, t, win, 1248, 121, 232, "Install Chatterbox to clone a voice");
};

// ---------------- G: voices, cloning, engines ----------------
type GS = "library" | "list" | "detail" | "gated" | "clone1" | "clone-rec" | "clone-review" | "clone-proc" | "clone-done" | "clone-err" | "engines" | "engines-gpu" | "engines-oom" | "engines-ready" | "style";
export type CS = "clone1" | "clone-rec" | "clone-review" | "clone-proc" | "clone-done" | "clone-err";
const clipCheck = (b: B, t: T, p: Ref, items: [string, string, boolean][]) => {
  const rt = K.card(b, t, p, { w: 340, pad: 20, gap: 14 }); b.text(rt, "Clip check", { size: 14, weight: "Bold", c: t.text });
  items.forEach(([l, d, ok]) => { const r = b.row(rt, { w: "fill", gap: 10, align: "start" }); b.icon(r, ok ? "circleCheck" : "alertCircle", 18, ok ? t.ok : t.err); const q = b.col(r, { gap: 1, w: "fill" }); b.text(q, `${l}: ${ok ? "passed" : "failed"}`, { size: 13, weight: "SemiBold", c: t.text }); b.text(q, d, { size: 12.5, c: t.text2, w: "fill", lh: 17 }); });
  return rt;
};
export const cloneScreen = (b: B, t: T, win: Ref, main: Ref, st: CS) => {
  K.pageHeader(b, t, main, "Clone a voice", "Chatterbox · zero-shot · runs on your NVIDIA GPU");
  const c = b.col(main, { w: "fill", h: "fill", pad: [8, 32, 24, 32], gap: 18 });
  const idx = { clone1: 0, "clone-rec": 0, "clone-review": 0, "clone-proc": 1, "clone-done": 2, "clone-err": 0 }[st];
  const sr = b.row(c, { gap: 8 }); ["Reference audio", "Analyze", "Name and test"].forEach((s, i) => { const x = b.row(sr, { gap: 6 }); const d = b.frame(x, { w: 22, h: 22, r: 11, fill: i <= idx ? t.accent : t.surface2, layout: "horizontal", align: "center", justify: "center" }); if (i < idx) b.icon(d, "check", 12, t.ctaText); else b.text(d, `${i + 1}`, { size: 12, weight: "Bold", c: i <= idx ? t.ctaText : t.text3 }); b.text(x, s, { size: 13, weight: i === idx ? "SemiBold" : "Medium", c: i === idx ? t.text : t.text3 }); if (i < 2) b.rect(sr, { w: 36, h: 2, fill: i < idx ? t.accent : t.border }); });
  const row = b.row(c, { w: "fill", gap: 20, align: "start" });
  const lft = K.card(b, t, row, { w: "fill", pad: 24, gap: 16 });
  const consent = (on: boolean) => checkbox(b, t, lft, on, "I have the right to clone this voice. It is my own voice, or the speaker gave me permission.");
  if (st === "clone1") {
    const dz = b.col(lft, { w: "fill", h: 190, r: 14, stroke: t.border, sw: 2, dashes: [8, 6], align: "center", justify: "center", gap: 10, fill: t.surface2 } as any);
    const ic = b.frame(dz, { w: 52, h: 52, r: 26, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "upload", 24, t.iconQuiet);
    b.text(dz, "Drop an audio file", { size: 16, weight: "Bold", c: t.text }); b.text(dz, "WAV, MP3, M4A · 10 to 30 seconds of one speaker", { size: 13, c: t.text2 });
    const r = b.row(dz, { gap: 10 }); K.btn(b, t, r, "Choose file", { v: "secondary", icon: "folder" }); K.btn(b, t, r, "Record now", { v: "primary", icon: "mic" });
    consent(false);
    const nt = b.row(lft, { gap: 8 }); b.icon(nt, "shield", 14, t.text3); b.text(nt, "Cloned voices are labeled AI-generated and stay on this computer.", { size: 12.5, c: t.text2 });
  } else if (st === "clone-rec") {
    const rc = b.col(lft, { w: "fill", pad: 18, gap: 10, r: 14, fill: t.surface2, align: "center" }); b.text(rc, "Read this out loud, naturally", { size: 12, weight: "SemiBold", c: t.text3 }); b.text(rc, "“The best software is the kind that disappears into the task. It is fast, private, and yours to keep, long after the network goes quiet.”", { size: 17, c: t.text, ta: "center", w: "fill", lh: 26 });
    const ct = b.row(lft, { w: "fill", pad: 16, gap: 16, r: 14, stroke: t.border, sw: 1, sa: "inside" });
    const rb = b.frame(ct, { w: 56, h: 56, r: 28, fill: t.err, layout: "horizontal", align: "center", justify: "center" }); b.icon(rb, "stop", 22, "#FFFFFF");
    const mid = b.col(ct, { gap: 8, w: "fill" }); K.waveform(b, t, mid, 340, 36, 0.55, 8);
    const tr = K.bar(b, t, mid, 8 / 30, 340, { knob: false }); b.rect(tr, { x: 340 / 3 - 1, y: 0, w: 2, h: 6, fill: t.surface });
    const ml = b.row(mid, { w: 340, justify: "spaceBetween" }); b.text(ml, "Minimum 0:10", { size: 12, c: t.text3 }); b.text(ml, "Maximum 0:30", { size: 12, c: t.text3 });
    b.text(ct, "0:08 / 0:30", { size: 15, weight: "Bold", c: t.text, mono: true });
    const lv = b.row(lft, { w: "fill", gap: 10 }); b.icon(lv, "mic", 15, t.text2); b.text(lv, "Blue Yeti", { size: 12.5, weight: "Medium", c: t.text }); K.bar(b, t, lv, 0.62, 160, { knob: false }); const ok = b.row(lv, { gap: 4 }); b.icon(ok, "circleCheck", 14, t.ok); b.text(ok, "Level good · -14 dB", { size: 12.5, weight: "Medium", c: t.ok });
    const ac = b.row(lft, { gap: 8 }); K.btn(b, t, ac, "Pause", { v: "secondary", sz: "sm", icon: "pause" }); K.btn(b, t, ac, "Discard", { v: "ghost", sz: "sm", icon: "trash" });
    consent(true);
  } else if (st === "clone-review") {
    b.text(lft, "Review your take", { size: 18, weight: "Bold", c: t.text });
    const p = b.row(lft, { w: "fill", pad: 14, gap: 14, r: 12, fill: t.surface2 }); const pb = b.frame(p, { w: 44, h: 44, r: 22, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, "play", 18, t.ctaText); K.waveform(b, t, p, 330, 36, 0.0, 5); b.text(p, "0:00 / 0:14", { size: 13, c: t.text2, mono: true });
    const ac = b.row(lft, { gap: 10 }); K.btn(b, t, ac, "Re-record", { v: "secondary", icon: "refresh" }); K.btn(b, t, ac, "Use this take", { v: "primary", icon: "check" });
    consent(true);
  } else if (st === "clone-err") {
    const fl = b.row(lft, { w: "fill", pad: 14, gap: 12, r: 12, fill: t.surface2, stroke: t.border, sw: 1, sa: "inside" }); const fi = b.frame(fl, { w: 40, h: 40, r: 10, fill: t.surface, layout: "horizontal", align: "center", justify: "center" }); b.icon(fi, "file", 20, t.text2);
    const fq = b.col(fl, { gap: 1, w: "fill" }); b.text(fq, "interview-clip.wav", { size: 14, weight: "SemiBold", c: t.text }); b.text(fq, "4 seconds · 44.1 kHz · mono", { size: 12.5, c: t.text2 }); K.iconBtn(b, t, fl, "x", { size: 30 });
    b.text(lft, "This clip can't be used yet. It is shorter than 10 seconds and has background music at 0:02.", { size: 14, c: t.text, w: "fill", lh: 21 });
    const ac = b.row(lft, { gap: 10 }); K.btn(b, t, ac, "Choose another file", { v: "primary", icon: "folder" }); K.btn(b, t, ac, "Record instead", { v: "secondary", icon: "mic" });
    consent(true);
  } else if (st === "clone-proc") {
    b.text(lft, "Analyzing the voice…", { size: 18, weight: "Bold", c: t.text });
    const pr = b.row(lft, { w: "fill", gap: 12 }); K.bar(b, t, pr, 0.55, 500, { knob: false }); b.text(pr, "55%", { size: 14, weight: "Bold", c: t.text, w: 44, ta: "right" });
    b.text(lft, "About 12 seconds left", { size: 12.5, c: t.text3 });
    [["Clean up audio and trim silence", "done"], ["Extract voice characteristics", "run"], ["Warm up Chatterbox on RTX 3060", "wait"]].forEach(([s, k]) => { const r = b.row(lft, { gap: 10 }); b.icon(r, k === "done" ? "check" : k === "run" ? "loader" : "clock", 16, k === "done" ? t.ok : k === "run" ? t.accent : t.text3); b.text(r, s as string, { size: 14, c: k === "wait" ? t.text3 : t.text }); });
  } else {
    b.text(lft, "Name your voice", { size: 18, weight: "Bold", c: t.text });
    const nf = b.col(lft, { w: "fill", gap: 6 }); b.text(nf, "Voice name", { size: 12.5, weight: "SemiBold", c: t.text2 }); K.input(b, t, nf, { value: "Maya (you)", h: 42, state: "focus" });
    const ai = b.row(lft, { gap: 8 }); b.icon(ai, "info", 14, t.text3); b.text(ai, "AI-generated voice. It is labeled that way in your library.", { size: 12.5, c: t.text2 });
    const tr = b.col(lft, { w: "fill", pad: 14, gap: 10, r: 12, fill: t.surface2 }); b.text(tr, "Test sentence", { size: 12, weight: "SemiBold", c: t.text3 }); b.text(tr, "This is what I sound like when a computer reads to me.", { size: 15, c: t.text, w: "fill" }); const p = b.row(tr, { w: "fill", gap: 12 }); const pb = b.frame(p, { w: 40, h: 40, r: 20, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, "play", 16, t.ctaText); K.waveform(b, t, p, 440, 28, 0.2, 2);
    sliderBlock(b, t, lft, "Emotion exaggeration", "0.50 is a neutral reading. Applies to Maya (you) only.", 0.5, 480, { label: "0.50", min: "Neutral", max: "Dramatic" });
  }
  if (st === "clone-err") clipCheck(b, t, row, [["Length", "4 s. Needs 10 to 30 s.", false], ["Background noise", "Music detected at 0:02.", false], ["Single speaker", "One voice found.", true]]);
  else if (st === "clone-review") clipCheck(b, t, row, [["Length", "14 s, within 10 to 30 s.", true], ["Background noise", "Low. No music found.", true], ["Single speaker", "One voice found.", true]]);
  else if (st === "clone-done") { const rt = K.card(b, t, row, { w: 340, pad: 20, gap: 12 }); b.text(rt, "Good to know", { size: 14, weight: "Bold", c: t.text }); ["Saved on this computer. Nothing is uploaded.", "You can rename, re-record or delete it in Voices.", "Style sliders apply to this voice only."].forEach((s) => { const r = b.row(rt, { w: "fill", gap: 8, align: "start" }); b.ellipse(r, { w: 6, h: 6, fill: t.text3 }); b.text(r, s, { size: 13, c: t.text2, w: "fill", lh: 18 }); }); }
  else { const rt = K.card(b, t, row, { w: 340, pad: 20, gap: 12 }); b.text(rt, "For a good clone", { size: 14, weight: "Bold", c: t.text }); ["10 to 30 seconds of one person", "Quiet room, no music or echo", "Speak at the pace you'd like it to read"].forEach((s) => { const r = b.row(rt, { w: "fill", gap: 8, align: "start" }); b.ellipse(r, { w: 6, h: 6, fill: t.text3 }); b.text(r, s, { size: 13, c: t.text2, w: "fill", lh: 18 }); }); }
  b.frame(c, { w: "fill", h: "fill" });
  const f = b.row(c, { w: "fill", justify: "spaceBetween" }); K.btn(b, t, f, "Cancel", { v: "ghost" });
  const fr = b.row(f, { gap: 14 });
  const hint = { clone1: "Add a clip and confirm your right to use it", "clone-rec": "Stop recording to continue", "clone-err": "Choose a valid clip to continue", "clone-proc": "Analyzing…", "clone-review": "", "clone-done": "" }[st];
  if (hint) b.text(fr, hint, { size: 12.5, c: t.text3 });
  K.btn(b, t, fr, st === "clone-done" ? "Save voice" : "Continue", { v: "primary", disabled: st === "clone1" || st === "clone-rec" || st === "clone-proc" || st === "clone-err", iconRight: "right" });
};

type EO = { name: string; tag: string; tone: any; desc: string; meta: string[]; checks?: [string, boolean][]; right?: Row; sub?: (x: Ref) => void };
const engCard = (b: B, t: T, c: Ref, o: EO) => {
  const x = K.card(b, t, c, { w: "fill", pad: 20, gap: 14 });
  const h = b.row(x, { w: "fill", justify: "spaceBetween", gap: 16, align: "start" });
  const l = b.col(h, { gap: 4, w: "fill" });
  const t1 = b.row(l, { gap: 10 }); b.text(t1, o.name, { size: 18, weight: "Bold", c: t.text }); K.badge(b, t, t1, o.tag, o.tone);
  b.text(l, o.desc, { size: 13.5, c: t.text2, w: "fill", lh: 20 });
  const m = b.row(l, { gap: 16, pad: [4, 0, 0, 0] }); o.meta.forEach((s) => b.text(m, s, { size: 12.5, c: t.text2 }));
  if (o.checks) { const ck = b.row(l, { gap: 20, pad: [2, 0, 0, 0] }); o.checks.forEach(([s, ok]) => { const q = b.row(ck, { gap: 6 }); b.icon(q, ok ? "circleCheck" : "alertCircle", 15, ok ? t.ok : t.warn); b.text(q, s, { size: 12.5, weight: "Medium", c: t.text }); }); }
  if (o.right) { const r = b.row(h, { gap: 8 }); o.right(r); }
  if (o.sub) o.sub(x);
  return x;
};
export const enginesScreen = (b: B, t: T, win: Ref, main: Ref, st: "engines" | "engines-gpu" | "engines-oom" | "engines-ready") => {
  K.pageHeader(b, t, main, "Engines", "Voice models that run on this computer", (r) => K.btn(b, t, r, "Import model…", { v: "secondary", icon: "folder" }));
  const c = b.col(main, { w: "fill", h: "fill", pad: [8, 32, 24, 32], gap: 16 });
  const oom = st === "engines-oom";
  const hw = b.row(c, { w: "fill", pad: [12, 16], gap: 12, r: 12, fill: t.surface2 }); b.icon(hw, "cpu", 18, t.text2); b.text(hw, "Intel Core i7-12700 · 32 GB RAM · NVIDIA GeForce RTX 3060 · CUDA 12.4", { size: 13, c: t.text2, w: "fill" });
  K.badge(b, t, hw, oom ? "GPU: 1.1 GB free of 12 GB" : st === "engines-gpu" ? "GPU: 7.4 GB free of 12 GB" : st === "engines-ready" ? "GPU: 7.4 GB free of 12 GB" : "GPU: 11.2 GB free of 12 GB", oom ? "warn" : "ok", oom ? "alert" : "circleCheck");
  const dots: Row = (r) => kebab(b, t, r, 36, { ring: true });
  engCard(b, t, c, { name: "Kokoro-82M", tag: "Ready", tone: "ok", desc: "Fast, light model. Great default for articles and documents. Runs on CPU.", meta: ["82M parameters", "330 MB on disk", "Apache-2.0", "CPU · 0.4× real time"], right: (r) => { K.btn(b, t, r, "Test voice", { v: "secondary", icon: "play" }); dots(r); } });
  if (st === "engines") engCard(b, t, c, { name: "Chatterbox", tag: "Not installed", tone: "neutral", desc: "Expressive speech with emotion control and voice cloning. Needs an NVIDIA GPU.", meta: ["500M parameters", "2.4 GB download", "MIT", "GPU · 8 GB+ VRAM"], checks: [["Fits your GPU: 12 GB VRAM, needs 8 GB+", true], ["Disk: 412 GB free on drive D · about 6 min at your speed", true]], right: (r) => K.btn(b, t, r, "Download 2.4 GB", { v: "primary", icon: "download" }) });
  if (st === "engines-gpu") engCard(b, t, c, { name: "Chatterbox", tag: "Warming up", tone: "warn", desc: "Loading the model onto the GPU. This takes about 15 seconds the first time after each launch.", meta: ["500M parameters", "Installed 2.4 GB", "MIT", "GPU · 4.6 GB VRAM in use"], right: (r) => K.btn(b, t, r, "Loading…", { v: "secondary", disabled: true, icon: "loader" }), sub: (x) => { const pr = b.row(x, { w: "fill", gap: 12 }); K.bar(b, t, pr, 0.6, 870, { knob: false }); b.text(pr, "60%", { size: 14, weight: "Bold", c: t.text, w: 44, ta: "right" }); b.text(x, "About 6 seconds left", { size: 12.5, c: t.text3 }); } });
  if (st === "engines-ready") engCard(b, t, c, { name: "Chatterbox", tag: "Ready", tone: "ok", desc: "Expressive speech with emotion control and voice cloning.", meta: ["500M parameters", "Installed 2.4 GB", "MIT", "GPU · 4.6 GB VRAM in use"], right: (r) => { K.btn(b, t, r, "Test voice", { v: "secondary", icon: "play" }); dots(r); } });
  if (oom) engCard(b, t, c, { name: "Chatterbox", tag: "Out of GPU memory", tone: "err", desc: "Chatterbox needs 4.6 GB of free GPU memory, but only 1.1 GB is free. Close a program below and retry, or use low-memory mode (needs about 2.6 GB, slower).", meta: ["Needs 4.6 GB", "Free 1.1 GB", "Low-memory mode 2.6 GB"], sub: (x) => {
    const vb = b.col(x, { w: "fill", pad: 14, gap: 8, r: 10, fill: t.surface2 }); b.text(vb, "Using GPU memory right now (from nvidia-smi)", { size: 12, weight: "SemiBold", c: t.text2 });
    const vr = b.row(vb, { w: "fill", gap: 12 }); [["Adobe Photoshop", "5.2 GB"], ["Google Chrome", "3.1 GB"], ["Blender", "2.1 GB"], ["Other", "0.5 GB"]].forEach(([n, z]) => { const q = b.col(vr, { w: "fill", gap: 1 }); b.text(q, n, { size: 13, weight: "Medium", c: t.text }); b.text(q, z, { size: 12.5, c: t.text2, mono: true }); });
    const fr = b.row(x, { w: "fill", justify: "spaceBetween" }); const dt = b.row(fr, { gap: 6 }); b.icon(dt, "right", 14, t.text2); b.text(dt, "Details", { size: 13, weight: "Medium", c: t.text2 });
    const bt = b.row(fr, { gap: 8 }); K.btn(b, t, bt, "Use Kokoro instead", { v: "secondary" }); K.btn(b, t, bt, "Run in low-memory mode", { v: "secondary", icon: "gauge" }); K.btn(b, t, bt, "Retry", { v: "primary", icon: "refresh" });
  } });
  if (st === "engines") { const x = K.card(b, t, c, { w: "fill", pad: 20, gap: 8, fill: t.surface2, stroke: "none" as any }); b.text(x, "Which one should I use?", { size: 14, weight: "Bold", c: t.text }); b.text(x, "Start with Kokoro. Add Chatterbox when you want a cloned voice or more expressive reading and have an NVIDIA GPU. You can switch per reading.", { size: 13, c: t.text2, w: "fill", lh: 19 }); }
  if (st === "engines-ready") {
    const m = popover(b, t, win, 1228, 384, 210);
    [["play", "Test voice", false], ["folder", "Reveal in folder", false], ["sliders", "Voice style…", false], ["trash", "Uninstall (frees 2.4 GB)", true]].forEach(([i, l, d]) => { const r = b.row(m, { w: "fill", h: 34, pad: [0, 10], gap: 10, r: 6 }); b.icon(r, i as string, 15, d ? t.err : t.text2); b.text(r, l as string, { size: 13, c: d ? t.err : t.text }); });
  }
};

export const styleModal = (b: B, t: T, win: Ref) => {
  dim(b, t, win);
  const d = b.col(win, { abs: true, x: 420, y: 130, w: 440, gap: 0, r: 16, fill: t.surface, stroke: t.border, sw: 1, shadow: "dlg", clip: true } as any);
  const h = b.row(d, { w: "fill", pad: [18, 22, 4, 22], justify: "spaceBetween" }); b.text(h, "Voice style", { size: 17, weight: "Bold", c: t.text }); K.iconBtn(b, t, h, "x", { size: 30 });
  const sc = b.row(d, { w: "fill", pad: [0, 22, 6, 22], gap: 6 }); b.icon(sc, "mic", 14, t.text3); b.text(sc, "Applies to Maya (you) only", { size: 12.5, c: t.text2 });
  const bd = b.col(d, { w: "fill", pad: [6, 22, 14, 22], gap: 14 });
  const sl = (title: string, desc: string, v: number, lab: string, mn: string, mx: string) => sliderBlock(b, t, bd, title, desc, v, 310, { label: lab, min: mn, max: mx });
  sl("Emotion exaggeration", "0.50 is a neutral reading. Higher is more dramatic.", 0.5, "0.50", "0", "1");
  K.divider(b, t, bd); sl("Pacing", "Lower is looser and faster, higher is more deliberate.", 0.35, "0.35", "0", "1");
  K.divider(b, t, bd); sl("Randomness", "How much each reading varies from the last.", 0.6, "0.60", "0", "1");
  K.divider(b, t, bd); K.settingRow(b, t, bd, "Low-memory mode", "Slower. Needs about 2.6 GB of GPU memory instead of 4.6 GB.", (f) => K.toggle(b, t, f, false));
  const f = b.row(d, { w: "fill", pad: [14, 22], gap: 8, justify: "spaceBetween", fill: t.surface2 }); K.btn(b, t, f, "Reset to defaults", { v: "ghost" }); K.btn(b, t, f, "Play sample", { v: "primary", icon: "play" });
};

const voices = (id: string, title: string, note: string, st: GS): S => ({
  id, group: "G", title, note, w: W, h: H,
  build: (b, t, root) => {
    const nav = st === "library" || st === "list" || st === "detail" || st === "gated" || st === "style" || st.startsWith("clone") ? "voices" : "engines";
    const status = st.startsWith("clone") || st === "engines-ready" ? { label: "Chatterbox · Ready", sub: "GPU · RTX 3060", tone: "ok" as const } : st === "engines-gpu" ? { label: "Chatterbox · Warming up", sub: "Loading onto the GPU", tone: "warn" as const } : st === "engines-oom" ? { label: "Chatterbox · Out of memory", sub: "1.1 GB of GPU free", tone: "err" as const } : undefined;
    const { win, main } = K.desktopWindow(b, t, root, { nav, status });
    if (st === "library" || st === "detail" || st === "style") voicesScreen(b, t, win, main, { view: "grid", tooltip: st === "library" || (id === "G12"), playing: st === "library" || id === "G12" });
    if (st === "list") voicesScreen(b, t, win, main, { view: "list", playing: true });
    if (st === "gated") voicesScreen(b, t, win, main, { view: "grid", gated: true });
    if (st.startsWith("clone")) cloneScreen(b, t, win, main, st as CS);
    if (st.startsWith("engines")) enginesScreen(b, t, win, main, st as any);
    if (st === "detail") {
      dim(b, t, win);
      const d = b.col(win, { abs: true, x: 880, y: 41, w: 400, h: 759, pad: 24, gap: 16, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" } as any);
      const h = b.row(d, { w: "fill", justify: "spaceBetween" }); const hl = b.row(h, { gap: 4 }); K.iconBtn(b, t, hl, "arrowLeft", { size: 30, ring: true }); K.iconBtn(b, t, hl, "arrowRight", { size: 30, ring: true }); b.text(hl, "1 of 28", { size: 12.5, c: t.text3 }); const hr = b.row(h, { gap: 8 }); b.text(hr, "Esc to close", { size: 12, c: t.text3 }); K.iconBtn(b, t, hr, "x", { size: 30 });
      const hd = b.row(d, { gap: 14 }); K.avatar(b, t, hd, "Heart", 64, 0); const x = b.col(hd, { gap: 3 }); b.text(x, "Heart", { size: 24, weight: "Bold", c: t.text }); b.text(x, "af_heart · US English · Female", { size: 13, c: t.text3 }); const g = b.row(x, { gap: 6 }); K.badge(b, t, g, "Grade A", "ok"); K.badge(b, t, g, "Default", "accent", "check");
      b.text(d, "Warm and clear. Best all-round voice for articles and long documents.", { size: 14, c: t.text2, w: "fill", lh: 21 });
      const sm = K.card(b, t, d, { w: "fill", pad: 14, gap: 10, fill: t.surface2, stroke: "none" as any }); const sh = b.row(sm, { w: "fill", justify: "spaceBetween" }); b.text(sh, "TRY IT", { size: 12, weight: "SemiBold", c: t.text3, ls: 1 }); const eh = b.row(sh, { gap: 4 }); b.icon(eh, "edit", 13, t.accent); b.text(eh, "Edit text", { size: 12, weight: "SemiBold", c: t.accent });
      b.text(sm, "The quick brown fox jumps over the lazy dog, then reads you a short paragraph about local-first software.", { size: 13.5, c: t.text, w: "fill", lh: 20 }); const r = b.row(sm, { w: "fill", gap: 12 }); const pb = b.frame(r, { w: 40, h: 40, r: 20, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, "play", 16, t.ctaText); K.waveform(b, t, r, 250, 26, 0.45);
      sliderBlock(b, t, d, "Speed for this voice", "Used whenever you pick Heart.", 0.2, 270, { label: "1.0×", min: "0.5×", max: "3×" });
      K.btn(b, t, d, "Default voice", { v: "secondary", w: "fill", icon: "check", disabled: true }); K.btn(b, t, d, "Remove from favorites", { v: "secondary", w: "fill", icon: "heart" });
    }
    if (st === "style") styleModal(b, t, win);
  },
});
const G_OLD: S[] = [ // superseded by s_v_voices.ts (not exported so main.ts does not register it)
  voices("G1", "Voices · library", "After Chatterbox is installed: Your voices on top, Kokoro voices as cards with accent, grade and preview (playing state shown), grade legend open.", "library"),
  voices("G2", "Voices · detail drawer", "Scrim under the drawer, previous/next voice, editable try-it sentence. Heart is already the default, so the button is disabled.", "detail"),
  voices("G3", "Clone · choose reference", "Upload or record. Continue stays disabled until a clip is added and the consent box is ticked.", "clone1"),
  voices("G4", "Clone · recording", "Stop button, 0:08 / 0:30 timer with the 0:10 minimum tick, live input meter. Continue is disabled while recording.", "clone-rec"),
  voices("G5", "Clone · analyzing", "Three visible steps including GPU warm-up, with percentage and time left.", "clone-proc"),
  voices("G6", "Clone · name and test", "Name the voice, hear a test sentence, tune exaggeration (0.50 neutral).", "clone-done"),
  voices("G7", "Clone · bad reference", "Per-criterion clip check: length and noise fail, single speaker passes. Next actions are choose another file or record.", "clone-err"),
  voices("G8", "Engines · overview", "Before install: Kokoro ready, Chatterbox with GPU and disk fit checks and a 2.4 GB download.", "engines"),
  voices("G9", "Engines · Chatterbox warming up", "GPU load progress after install, inside the card padding, with percentage.", "engines-gpu"),
  voices("G10", "Engines · out of GPU memory", "Live GPU chip, top VRAM users, three ways forward. Raw CUDA text stays behind Details.", "engines-oom"),
  voices("G11", "Chatterbox · voice style", "Opened from Style on a cloned voice card. Sliders show values; scope is Maya (you).", "style"),
  voices("G13", "Voices · list view", "Dense rows: play, name, accent, gender, grade, style, favorite. Scales to all 28 voices.", "list"),
  voices("G14", "Voices · cloning unavailable", "Chatterbox not installed: Clone is disabled with the reason, a requirements check and a link to Engines. Cloned voices are dimmed.", "gated"),
  voices("G15", "Clone · review take", "After stopping: play back, re-record or use the take. All three clip checks pass.", "clone-review"),
  voices("G16", "Engines · Chatterbox ready", "Installed card with the overflow menu: Test, Reveal in folder, Voice style, Uninstall.", "engines-ready"),
];

// ---------------- H: settings ----------------
type HS = "general" | "playback" | "pron" | "browser" | "keys" | "keys-capture" | "storage" | "appearance" | "about" | "update";
const SUB: [string, string, string][] = [["general", "General", "grid"], ["playback", "Playback", "play"], ["pron", "Pronunciation", "type"], ["browser", "Browser integration", "globe"], ["keys", "Shortcuts", "keyboard"], ["storage", "Storage and models", "hardDrive"], ["appearance", "Appearance", "moon"], ["about", "About", "info"]];
export const settingsScreen = (b: B, t: T, win: Ref, main: Ref, st: HS, o: { portConflict?: boolean } = {}) => {
  const outer = b.col(main, { w: "fill", h: "fill", pad: [28, 0], align: "center", clip: true });
  const c = b.col(outer, { w: 760, gap: 16 });
  const sect = (n: string) => { const s = K.card(b, t, c, { w: "fill", pad: [16, 20], gap: 0 }); b.text(s, n, { size: 14, weight: "Bold", c: t.text }); return s; };
  const rows = (s: Ref, items: [string, string | undefined, Row][]) => items.forEach(([a, d, fn], i) => { if (i) K.divider(b, t, s); K.settingRow(b, t, s, a, d, fn); });
  const on = (v: boolean): Row => (f) => K.toggle(b, t, f, v);
  const head = (s: string) => b.text(c, s, { size: 24, weight: "Bold", c: t.text });
  const spd = (v: number): number => (v - 0.5) / 2.5;
  if (st === "general") { head("General"); rows(sect("Startup and language"), [["Launch when I sign in", "Start in the tray so the extension is ready.", on(true)], ["Show in the tray", "Keep Speak Kit running when the window is closed.", on(true)], ["Open library at launch", "Off: reopen the last reading instead.", on(false)], ["Interface language", "The language of menus and buttons.", (f) => K.select(b, t, f, "English", 180)], ["Reading language", "Detected automatically for each text.", (f) => K.select(b, t, f, "Auto-detect", 180)]]); rows(sect("Privacy and prompts"), [["Offer to read copied text", "Asks after you copy 100+ words. Skips passwords.", on(true)], ["Send anonymous crash reports", "Off by default. Never includes your text.", on(false)], ["Check for updates", "Looks at GitHub releases only.", on(true)]]); }
  if (st === "playback") { head("Playback"); rows(sect("Reading"), [["Default speed", "About 190 words per minute at 1.2×.", (f) => K.slider(b, t, f, spd(1.2), 220, { label: "1.2×", min: "0.5×", max: "3×" })], ["Pause between sentences", "Silence added after each sentence.", (f) => K.seg(b, t, f, ["None", "Short", "Long"], 1)], ["Pause between paragraphs", "Silence added after each paragraph.", (f) => K.seg(b, t, f, ["None", "Short", "Long"], 2)], ["Auto-play next in library", "Continue with the next reading when one ends.", on(false)]]); rows(sect("Clean-up before reading"), [["Skip footnote numbers and citations", "Hides [12] and (Smith, 2020).", on(true)], ["Say “link” instead of long URLs", "Keeps addresses from being spelled out.", on(true)], ["Read code blocks", "Off: skipped with a short pause.", on(false)], ["Expand abbreviations and numbers", "Dr. to Doctor, 3.5k to three point five thousand.", on(true)]]); }
  if (st === "pron") {
    head("Pronunciation"); const s = sect("Custom pronunciations");
    const ad = b.row(s, { w: "fill", gap: 10, pad: [8, 0] }); K.input(b, t, ad, { placeholder: "Word or phrase, e.g. Nginx", w: "fill" }); b.icon(ad, "arrowRight", 16, t.text3); K.input(b, t, ad, { placeholder: "Respelling, e.g. engine X", w: "fill" }); K.btn(b, t, ad, "Add", { v: "primary", icon: "plus" });
    b.text(s, "Respelling: write the word the way it sounds, with plain letters. Press play to check it.", { size: 12.5, c: t.text2 });
    [["Kokoro", "koh-koh-roh"], ["PDF", "P D F"], ["Nginx", "engine X"], ["Okafor", "oh-KAH-for"]].forEach(([a, p]) => { K.divider(b, t, s); const r = b.row(s, { w: "fill", h: 48, justify: "spaceBetween" }); const l = b.row(r, { gap: 14 }); b.text(l, a, { size: 14, weight: "SemiBold", c: t.text, w: 140 }); b.icon(l, "arrowRight", 14, t.text3); b.text(l, p, { size: 14, c: t.text2 }); const rr = b.row(r, { gap: 4 }); K.iconBtn(b, t, rr, "play", { size: 32 }); K.iconBtn(b, t, rr, "trash", { size: 32 }); });
    K.toast(b, t, win, "Deleted “kubectl”", "neutral", { abs: true, x: 640 - 150 + 116, y: 724, icon: "trash", action: "Undo" } as any);
  }
  if (st === "browser") {
    head("Browser integration"); const s = sect("Local server"); const cf = !!o.portConflict;
    const r = b.row(s, { w: "fill", pad: [10, 0], gap: 12 }); const ic = b.frame(r, { w: 40, h: 40, r: 20, fill: cf ? t.errSoft : t.okSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, cf ? "alertCircle" : "check", 20, cf ? t.err : t.ok);
    const x = b.col(r, { gap: 2, w: "fill" }); b.text(x, cf ? "Not listening: port 51730 is in use" : "Listening on 127.0.0.1:51730", { size: 14.5, weight: "SemiBold", c: t.text }); b.text(x, cf ? "Another program is using this port. The extension can't connect until you pick a free one." : "Loopback only. Requests need the pairing token. 1 extension connected.", { size: 12.5, c: t.text2, w: "fill" }); K.toggle(b, t, r, !cf);
    rows(s, [["Port", "Changing it disconnects paired browsers until they re-pair.", (f) => { K.input(b, t, f, { value: cf ? "51730" : "51730", w: 90, h: 34, state: cf ? "error" : "default" }); K.btn(b, t, f, "Apply and re-pair", { v: cf ? "primary" : "secondary", sz: "sm" }); }], ["Pairing token", "Paste into the extension if auto-pairing fails.", (f) => { K.input(b, t, f, { value: "sk_local_••••••••c42e", w: 170, h: 34 }); K.iconBtn(b, t, f, "eye", { size: 32, ring: true }); K.btn(b, t, f, "Copy", { v: "secondary", sz: "sm", icon: "copy" }); dangerBtn(b, t, f, "Regenerate", "refresh"); }]]);
    if (!cf) { const cn = b.row(s, { w: "fill", pad: 14, gap: 12, r: 10, fill: t.errSoft, align: "center" }); b.icon(cn, "alert", 18, t.err); b.text(cn, "Regenerate the token? Chrome and Edge disconnect until you pair them again.", { size: 12.5, weight: "Medium", c: t.text, w: "fill" }); K.btn(b, t, cn, "Cancel", { v: "ghost", sz: "sm" }); K.btn(b, t, cn, "Regenerate", { v: "danger", sz: "sm" }); }
    const e = sect("Paired browsers"); const hr = b.row(e, { w: "fill", justify: "spaceBetween" });
    [["Chrome · Profile Maya", "Extension 0.4.2 · last used 2 min ago", 0], ["Edge · Work", "Extension 0.4.2 · last used 3 days ago", 3]].forEach(([a, d, hi], i) => { if (i === 0) K.divider(b, t, e); const rr = b.row(e, { w: "fill", h: 54, justify: "spaceBetween" }); const l = b.row(rr, { gap: 12 }); K.avatar(b, t, l, (a as string).slice(0, 1), 32, hi as number); const q = b.col(l, { gap: 1 }); b.text(q, a as string, { size: 13.5, weight: "SemiBold", c: t.text }); b.text(q, d as string, { size: 12, c: t.text2 }); dangerBtn(b, t, rr, "Revoke"); if (i === 0) K.divider(b, t, e); });
    const ar = b.row(e, { w: "fill", gap: 8, pad: [10, 0, 0, 0] }); K.btn(b, t, ar, "Install Chrome extension", { v: "secondary", sz: "sm", icon: "external" }); K.btn(b, t, ar, "Pair a new browser", { v: "secondary", sz: "sm", icon: "plus" }); b.text(ar, "Revoking a browser signs it out; pair it again to use it.", { size: 12, c: t.text3, w: "fill" });
  }
  if (st === "keys" || st === "keys-capture") {
    head("Shortcuts");
    const hdr = b.row(c, { w: "fill", justify: "spaceBetween" }); b.text(hdr, "Win-key combinations and Ctrl+Alt+Del are reserved by Windows and can't be used.", { size: 12.5, c: t.text2 }); K.btn(b, t, hdr, "Reset all", { v: "secondary", sz: "sm", icon: "refresh" });
    const s = sect("Global shortcuts (work in any app)");
    [["Read selected text", ["Ctrl", "Alt", "S"]], ["Read clipboard", ["Ctrl", "Alt", "C"]], ["Play / pause", ["Ctrl", "Alt", "Space"]], ["Stop", ["Ctrl", "Alt", "X"]], ["Show mini player", ["Ctrl", "Alt", "M"]]].forEach(([a, k], i) => {
      if (i) K.divider(b, t, s); const conflict = i === 4 && st === "keys"; const cap = i === 4 && st === "keys-capture";
      const rw = b.col(s, { w: "fill", gap: 0, fill: conflict ? t.warnSoft : "none", r: 8, pad: conflict ? [0, 12] : 0, stroke: conflict ? t.warn : undefined, sw: 1, sa: "inside" } as any);
      K.settingRow(b, t, rw, a as string, undefined, (f) => { const r = b.row(f, { gap: 12 }); if (cap) { const pk = b.row(r, { h: 30, pad: [0, 12], gap: 8, r: 8, fill: t.surface, stroke: t.accent, sw: 2, sa: "inside" }); b.text(pk, "Press new keys…", { size: 12.5, weight: "Medium", c: t.text }); b.text(pk, "Esc to cancel", { size: 12, c: t.text3 }); } else { kbd12(b, t, r, k as string[], { state: conflict ? "amber" : "normal" }); K.iconBtn(b, t, r, "edit", { size: 32, ring: true }); K.iconBtn(b, t, r, "refresh", { size: 32, ring: true }); } });
      if (conflict) { const m = b.row(rw, { w: "fill", gap: 8, pad: [0, 0, 12, 0] }); b.icon(m, "alert", 15, t.warn); b.text(m, "Conflicts with Microsoft Word (New comment) · Speak Kit takes priority while it runs.", { size: 12.5, weight: "Medium", c: t.text, w: "fill" }); b.text(m, "Change", { size: 12.5, weight: "SemiBold", c: t.accent }); }
    });
    const s2 = sect("In the app"); [["Play / pause", ["Space"]], ["Back 10 seconds", ["J"]], ["Forward 10 seconds", ["L"]]].forEach(([a, k], i) => { if (i) K.divider(b, t, s2); K.settingRow(b, t, s2, a as string, undefined, (f) => kbd12(b, t, f, k as string[])); });
  }
  if (st === "storage") {
    head("Storage and models"); const s = sect("Disk usage · 1.6 GB");
    const fr = b.row(s, { w: "fill", pad: [6, 0, 8, 0], justify: "spaceBetween" }); b.text(fr, "330 MB models + 1.2 GB cache + 48 MB library", { size: 12.5, c: t.text2 }); b.text(fr, "412 GB free on drive D", { size: 12.5, weight: "Medium", c: t.text2 });
    const sg = b.row(s, { w: 698 - 8, h: 12, gap: 0, r: 6, clip: true }); const C = [t.accent, t.info, t.ok]; [142, 527, 21].forEach((w, i) => b.rect(sg, { w, h: 12, fill: C[i] }));
    const lg = b.row(s, { gap: 20, pad: [10, 0, 4, 0] }); [["Models", "330 MB"], ["Audio cache", "1.2 GB"], ["Library", "48 MB"]].forEach(([n, z], i) => { const q = b.row(lg, { gap: 6 }); b.frame(q, { w: 10, h: 10, r: 3, fill: C[i] }); b.text(q, `${n} ${z}`, { size: 12.5, c: t.text2 }); });
    [["Models", "Kokoro-82M. Chatterbox is not installed.", "330 MB", 0], ["Audio cache", "Rendered sentences, cleared automatically", "1.2 GB", 1], ["Library", "6 readings", "48 MB", 2]].forEach(([a, d, z, i]) => { K.divider(b, t, s); const r = b.row(s, { w: "fill", h: 52, justify: "spaceBetween" }); const l = b.row(r, { gap: 10 }); b.frame(l, { w: 10, h: 10, r: 3, fill: C[i as number] }); const q = b.col(l, { gap: 1 }); b.text(q, a as string, { size: 13.5, weight: "SemiBold", c: t.text }); b.text(q, d as string, { size: 12, c: t.text2 }); const rr = b.row(r, { gap: 12 }); b.text(rr, z as string, { size: 13.5, c: t.text2, mono: true }); if (i === 1) K.btn(b, t, rr, "Clear", { v: "secondary", sz: "sm" }); });
    const cf = b.row(s, { w: "fill", pad: 14, gap: 12, r: 10, fill: t.warnSoft }); b.icon(cf, "alert", 18, t.warn); b.text(cf, "Clear 1.2 GB of audio cache? Sentences are re-rendered the next time you play them.", { size: 12.5, weight: "Medium", c: t.text, w: "fill" }); K.btn(b, t, cf, "Cancel", { v: "ghost", sz: "sm" }); K.btn(b, t, cf, "Clear cache", { v: "danger", sz: "sm" });
    rows(sect("Cache and folders"), [["Keep audio cache up to", "Older sentences are removed first.", (f) => K.select(b, t, f, "2 GB", 140)], ["Models folder", "D:\\SpeakKit\\models", (f) => K.btn(b, t, f, "Change…", { v: "secondary", sz: "sm" })]]);
  }
  if (st === "appearance") {
    head("Appearance"); const s = sect("Reading theme"); const r = b.row(s, { w: "fill", gap: 14, pad: [8, 0] });
    ["White", "Paper", "Sepia"].forEach((n, i) => { const x = b.col(r, { w: "fill", pad: 12, gap: 8, r: 12, stroke: i === 1 ? t.cta : t.border, sw: i === 1 ? 2 : 1, sa: "inside" }); const pv = b.frame(x, { w: 190, h: 80, r: 8, clip: true, stroke: t.border, sw: 1, fill: ["#FFFFFF", "#F7F3EA", "#F1E4C8"][i] }); b.rect(pv, { x: 12, y: 14, w: 60, h: 8, r: 3, fill: "#1F2328" }); b.rect(pv, { x: 12, y: 30, w: 120, h: 6, r: 3, fill: "#F5DFAC" }); const nr = b.row(x, { gap: 6 }); b.text(nr, n, { size: 13, weight: "SemiBold", c: t.text }); if (i === 1) { b.icon(nr, "check", 14, t.text); b.text(nr, "Selected", { size: 12, c: t.text2, weight: "Medium" }); } });
    const h = sect("Highlight"); const sw = b.row(h, { w: "fill", gap: 14, pad: [10, 0, 4, 0], align: "start" });
    const SW: [string, string][] = [["Butter", "#FFE58A"], ["Sky", "#B8DCFF"], ["Mint", "#BDEBC3"], ["Rose", "#FFC2D6"]];
    SW.forEach(([n, hx], i) => { const q = b.col(sw, { gap: 4, align: "center", w: 56 }); const ring = b.frame(q, { w: 44, h: 44, r: 22, stroke: i === 0 ? t.accent : "none" as any, sw: 2, sa: "inside", layout: "horizontal", align: "center", justify: "center" }); b.frame(ring, { w: 32, h: 32, r: 16, fill: hx, stroke: t.text3, sw: 1, sa: "inside" }); b.text(q, n, { size: 12, weight: i === 0 ? "SemiBold" : "Regular", c: i === 0 ? t.text : t.text2 }); });
    const pw = b.col(sw, { w: "fill", pad: 12, r: 10, fill: t.bg, gap: 4 }); b.text(pw, "Preview", { size: 12, weight: "SemiBold", c: t.text3 }); K.para(b, { ...t, hlSent: "#FFE58A", hlWord: "#FFC21A", hlWordText: "#1E1F20" } as any, pw, "Small models now run on a laptop. Nothing leaves the device.", 400, { size: 15, lh: 26, hl: { sent: 0, word: 2 } });
    rows(h, [["Word highlight", "Marks the word being spoken inside the sentence.", on(true)], ["Reduce motion", "Disables smooth scrolling and animations.", on(false)]]);
  }
  if (st === "about" || st === "update") {
    head("About");
    if (st === "update") { const u = K.card(b, t, c, { w: "fill", pad: 20, gap: 14, fill: t.well, stroke: t.accent }); const ur = b.row(u, { w: "fill", gap: 14 }); const ui = b.frame(ur, { w: 44, h: 44, r: 22, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(ui, "download", 20, t.ctaText); const q = b.col(ur, { gap: 2, w: "fill" }); b.text(q, "Version 0.5.0 is available", { size: 16, weight: "Bold", c: t.text }); b.text(q, "Faster start-up, PDF outline, fixes for Windows sleep. 64 MB download.", { size: 13, c: t.text2, w: "fill" }); b.text(u, "Speak Kit restarts to install it, so reading stops. Your library and settings are kept.", { size: 12.5, c: t.text2 }); const ub = b.row(u, { w: "fill", gap: 8 }); K.btn(b, t, ub, "Update and restart", { v: "primary" }); K.btn(b, t, ub, "Remind me later", { v: "secondary" }); K.btn(b, t, ub, "Release notes", { v: "ghost", iconRight: "external" }); }
    const s = K.card(b, t, c, { w: "fill", pad: 20, gap: 12 }); const r = b.row(s, { gap: 16 }); K.logo(b, t, r, 56, { r: 16 }); const x = b.col(r, { gap: 3 }); b.text(x, "Speak Kit", { size: 22, weight: "Bold", c: t.text }); b.text(x, "Version 0.4.2 · MIT licensed · open source", { size: 13, c: t.text2 });
    const br = b.row(s, { w: "fill", gap: 8 }); K.btn(b, t, br, "Check for updates", { v: "secondary", icon: "refresh" }); if (st === "about") { const ok = b.row(br, { gap: 6 }); b.icon(ok, "circleCheck", 16, t.ok); b.text(ok, "You're up to date · checked just now", { size: 13, weight: "Medium", c: t.text }); }
    const lk = b.row(s, { gap: 4 }); ["Privacy", "License text", "Open logs folder"].forEach((l) => K.btn(b, t, lk, l, { v: "ghost", sz: "sm", iconRight: "external" }));
    if (st === "update") { const q = K.card(b, t, c, { w: "fill", pad: [14, 20], gap: 0 }); const qr = b.row(q, { w: "fill", justify: "spaceBetween" }); b.text(qr, "Open-source libraries and licenses (5)", { size: 13.5, weight: "Medium", c: t.text }); b.icon(qr, "external", 15, t.text3); } else rows(sect("Open source"), [["Kokoro-82M", "Apache-2.0 · hexgrad", (f) => b.icon(f, "external", 15, t.text3)], ["Chatterbox", "MIT · Resemble AI", (f) => b.icon(f, "external", 15, t.text3)], ["ONNX Runtime", "MIT · Microsoft", (f) => b.icon(f, "external", 15, t.text3)], ["Electron", "MIT · OpenJS Foundation", (f) => b.icon(f, "external", 15, t.text3)], ["espeak-ng", "GPL-3.0 · runs as a separate process", (f) => b.icon(f, "external", 15, t.text3)]]);
  }
};
const settings = (id: string, title: string, note: string, st: HS): S => ({
  id, group: "H", title, note, w: W, h: H,
  build: (b, t, root) => { const { win, main } = K.desktopWindow(b, t, root, { nav: "settings", settingsKey: st === "keys-capture" ? "keys" : st === "update" ? "about" : st, settingsDot: st === "update" ? "about" : undefined, update: st === "update" }); settingsScreen(b, t, win, main, st); },
});
export const Hs: S[] = [
  settings("H1", "Settings · General", "Startup, tray, language, privacy and the clipboard prompt switch.", "general"),
  settings("H2", "Settings · Playback", "Speed slider with value (0.5× to 3×), pauses and text clean-up rules.", "playback"),
  settings("H3", "Settings · Pronunciation", "Custom dictionary with respelling help, per-entry preview and delete with Undo.", "pron"),
  settings("H4", "Settings · Browser integration", "Server status, port with Apply and re-pair, token, destructive actions with confirm text.", "browser"),
  settings("H5", "Settings · Shortcuts", "Global Ctrl+Alt shortcuts, inline conflict on one row, in-app keys, Reset all.", "keys"),
  settings("H6", "Settings · Storage and models", "Usage adds up to 1.6 GB, segmented bar with legend, Clear asks first.", "storage"),
  settings("H7", "Settings · Appearance", "Reading theme, named highlight colors with a live preview.", "appearance"),
  settings("H8", "Settings · About", "Version, update result, links and one row per open-source library.", "about"),
  settings("H9", "Settings · Update available", "Update card with restart warning and Remind me later; dot on the About item.", "update"),
  settings("H11", "Settings · Shortcuts (recording a key)", "Capture state: Press new keys, Esc to cancel.", "keys-capture"),
];
