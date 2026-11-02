// Extra Lumen components used by the restructured screens (see docs/lumen-study-2.md for the measurements).
import { B, Ref, O } from "./lib";
import * as K from "./kit";
import { T, tint } from "./kit";

export type BTone = "warn" | "err" | "info" | "neutral" | "ok";
export const toneC = (t: T, k: BTone) => ({ warn: t.warn, err: t.err, info: t.info, neutral: t.text3, ok: t.ok })[k];
/** caps group label: 11 px SemiBold text/tertiary */
export const caps = (b: B, t: T, p: Ref | undefined, label: string, o: O = {}) => b.text(p, label, { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5, ...o });
/** Lumen ES1 banner: tinted fill + 1 px matching border, 16 px icon tile, 13 px SemiBold title (what happened + cause), 12 px body (what still works), one primary + one secondary (28 px). */
export const banner = (b: B, t: T, p: Ref | undefined, o: { tone: BTone; title: string; body?: string; primary?: string; secondary?: string; icon?: string; w?: number | "fill"; ghost?: string }) => {
  const c = toneC(t, o.tone);
  const soft = ({ warn: t.warnSoft, err: t.errSoft, info: t.infoSoft, neutral: t.chipGray, ok: t.okSoft })[o.tone];
  const f = b.row(p, { w: o.w ?? "fill", pad: 14, gap: 12, r: 10, fill: soft, align: "start" });
  const tile = b.frame(f, { w: 28, h: 28, r: 6, fill: "#FFFFFF80", layout: "horizontal", align: "center", justify: "center" });
  b.icon(tile, o.icon ?? ({ warn: "alert", err: "alertCircle", info: "info", neutral: "info", ok: "circleCheck" })[o.tone], 16, c);
  const x = b.col(f, { gap: 4, w: "fill" });
  b.text(x, o.title, { size: 13, weight: "SemiBold", c: t.text, w: "fill", lh: 18 });
  if (o.body) b.text(x, o.body, { size: 12, c: t.text3, w: "fill", lh: 17 });
  if (o.primary || o.secondary) { const r = b.row(x, { gap: 8, pad: [6, 0, 0, 0] }); if (o.primary) K.btn(b, t, r, o.primary, { v: "primary", sz: "sm" }); if (o.secondary) K.btn(b, t, r, o.secondary, { v: "secondary", sz: "sm" }); if (o.ghost) K.btn(b, t, r, o.ghost, { v: "ghost", sz: "sm" }); }
  return f;
};
/** annotation card inside a frame (Lumen TR1/NO1): caps title, 11-12 px bullets */
export const rulesCard = (b: B, t: T, p: Ref | undefined, title: string, lines: string[], o: O = {}) => {
  const f = b.col(p, { w: 420, pad: 14, gap: 6, r: 10, fill: t.surface, shadow: "ring", ...o });
  caps(b, t, f, title.toUpperCase());
  lines.forEach((s) => { const r = b.row(f, { w: "fill", gap: 8, align: "start" }); b.ellipse(r, { w: 4, h: 4, fill: t.text3 }); b.text(r, s, { size: 11, c: t.text2, w: "fill", lh: 16 }); });
  return f;
};
/** list card (Lockix): r10, white, card-ring shadow, rows separated by dividers */
export const group = (b: B, t: T, p: Ref | undefined, label: string | undefined, rows: ((f: Ref) => void)[], o: O = {}) => {
  const col = b.col(p, { w: "fill", gap: 4, ...o });
  if (label) caps(b, t, col, label);
  const c = b.col(col, { w: "fill", pad: [0, 16], gap: 0, r: 10, fill: t.surface, shadow: "ring" });
  rows.forEach((fn, i) => { if (i) K.divider(b, t, c); fn(c); });
  return col;
};
/** Lumen setup row: 32 px icon tile (r6, tinted) + title 13 + description 12 + control right; 58 px high */
export const iconRow = (b: B, t: T, p: Ref, ic: string, title: string, desc: string | undefined, control?: (f: Ref) => void, tone: BTone = "info") => {
  const f = b.row(p, { w: "fill", h: desc ? 58 : 46, gap: 12, align: "center", justify: "spaceBetween" });
  const l = b.row(f, { gap: 12, w: "fill" });
  const grey = tone === "info" || tone === "neutral"; const tfill = ({ warn: t.warnSoft, err: t.errSoft, ok: t.okSoft } as Record<string, string>)[tone] ?? t.well;
  const tile = b.frame(l, { w: 32, h: 32, r: 8, fill: tfill, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, ic, 16, grey ? t.iconQuiet : toneC(t, tone));
  const x = b.col(l, { gap: 2, w: "fill" }); b.text(x, title, { size: 13, weight: "Medium", c: t.text }); if (desc) b.text(x, desc, { size: 12, c: t.text3, w: "fill", lh: 16 });
  if (control) control(f);
  return f;
};
export const code6 = (b: B, t: T, p: Ref | undefined, code: string) => {
  const r = b.row(p, { gap: 6 });
  code.split("").forEach((ch, i) => {
    if (i === 3) b.ellipse(r, { w: 4, h: 4, fill: t.text3 });
    const x = b.row(r, { w: 36, h: 48, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", justify: "center", shadow: "ctl" });
    b.text(x, ch, { size: 20, weight: "SemiBold", c: t.text });
  });
  return r;
};
export const STEPS = ["Welcome", "Voice engine", "Download", "Connect browser", "Done"];
/** setup stepper: 20 px circles (current accent + number, done accent + check, future outline), 13 px labels, 28 px joins */
export const stepper = (b: B, t: T, p: Ref | undefined, cur: number) => {
  const r = b.row(p, { gap: 8 });
  STEPS.forEach((s, i) => {
    if (i) b.rect(r, { w: 28, h: 1, fill: i <= cur ? t.cta : t.control });
    const done = i < cur; const on = i === cur;
    const c = b.frame(r, { w: 20, h: 20, r: 999, fill: done || on ? t.cta : "none", stroke: done || on ? undefined : t.control, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
    if (done) b.icon(c, "check", 12, t.ctaText); else b.text(c, String(i + 1), { size: 11, weight: "Medium", c: on ? t.ctaText : t.text3 });
    b.text(r, s, { size: 13, weight: on ? "Medium" : "Regular", c: on ? t.text : t.text2 });
  });
  return r;
};
/** desktop wallpaper + taskbar (setup, first launch, tray and toasts are shown over it) */
export const wallpaper = (b: B, t: T, root: Ref, W = 1280, H = 800, tray?: { x: number }) => {
  b.rect(root, { x: 0, y: 0, w: W, h: H, fills: [{ type: "linearGradient", stops: ["#BBD3F0", "#D9D2EE", "#F0E4DA"], from: [0, 0], to: [1, 1] }] } as any);
  const tb = b.row(root, { x: 0, y: H - 48, w: W, h: 48, pad: [0, 16], gap: 14, fill: "#F3F3F3E6", justify: "spaceBetween" });
  const mid = b.row(tb, { gap: 14, w: "fill", justify: "center" });
  K.logo(b, t, mid, 26, { fill: "#0078D4" }); ["search", "folder", "globe"].forEach((ic) => { const f = b.frame(mid, { w: 32, h: 32, r: 6, layout: "horizontal", align: "center", justify: "center" }); b.icon(f, ic, 18, "#3B3B3B"); });
  const r = b.row(tb, { gap: 12 }); b.icon(r, "up", 14, "#3B3B3B"); const lg = b.frame(r, { w: 20, h: 20, layout: "horizontal", align: "center", justify: "center" }); K.logo(b, t, lg, 16);
  b.icon(r, "volume", 16, "#3B3B3B");
  const clk = b.col(r, { gap: 0, align: "end" }); b.text(clk, "9:41 PM", { size: 11, c: "#202020" }); b.text(clk, "11/1/2026", { size: 11, c: "#202020" });
};
/** Windows toast (Lumen NO1): 364 wide, icon 16 + app name + X, bold title, 2-line body, tertiary footer line, no buttons */
export const winToast = (b: B, t: T, p: Ref | undefined, o: { title: string; body: string; hint: string; tone?: BTone } & O) => {
  const { title, body, hint, tone, ...rest } = o;
  const f = b.col(p, { w: 364, pad: [12, 14], gap: 6, r: 8, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "md", ...rest });
  const h = b.row(f, { w: "fill", gap: 8, justify: "spaceBetween" }); const hl = b.row(h, { gap: 8 }); K.logo(b, t, hl, 16); b.text(hl, "Speak Kit", { size: 12, c: t.text3 }); b.icon(h, "x", 12, t.text3);
  const tr = b.row(f, { w: "fill", gap: 8 }); if (tone) b.icon(tr, tone === "err" ? "alertCircle" : "circleCheck", 16, toneC(t, tone)); b.text(tr, title, { size: 13, weight: "SemiBold", c: t.text, w: "fill" });
  b.text(f, body, { size: 12, c: t.text2, w: "fill", lh: 17 });
  b.text(f, hint, { size: 11, c: t.text3 });
  return f;
};
/** setup window (Lumen X10): 960x680, title bar 32, stepper 52, 720 px content column, footer 64 with top divider. Placed over a wallpaper in a 1280x800 frame. */
export const setupWindow = (b: B, t: T, root: Ref, step: number, o: { h1: string; sub: string; body: (c: Ref) => void; back?: boolean; next?: string; nextDisabled?: boolean; nextIcon?: string; left?: string }) => {
  wallpaper(b, t, root);
  const w = b.col(root, { x: 160, y: 40, w: 960, h: 680, fill: t.bg, r: 8, shadow: "xl", clip: true, gap: 0 });
  const tb = b.row(w, { w: "fill", h: 36, pad: [0, 0, 0, 12], justify: "spaceBetween" });
  const l = b.row(tb, { gap: 8 }); K.logo(b, t, l, 14); b.text(l, "Set up Speak Kit", { size: 12, c: t.text2 });
  const r = b.row(tb, { gap: 0 }); ["minus", "square", "x"].forEach((ic) => { const c = b.frame(r, { w: 36, h: 36, layout: "horizontal", align: "center", justify: "center" }); b.icon(c, ic, 12, t.text2); });
  const sr = b.row(w, { w: "fill", h: 52, pad: [0, 28], justify: "center" }); stepper(b, t, sr, step);
  const host = b.col(w, { w: "fill", h: "fill", pad: [0, 4, 4, 4], gap: 0 });
  const panel = b.col(host, { w: "fill", h: "fill", fill: t.surface, r: 14, shadow: "card", gap: 0, clip: true });
  const body = b.col(panel, { w: "fill", h: "fill", pad: [18, 120, 0, 120], gap: 14, clip: true });
  b.text(body, o.h1, { size: 20, weight: "SemiBold", c: t.text });
  b.text(body, o.sub, { size: 13, c: t.text2, w: "fill", lh: 19 });
  o.body(body);
  b.rect(panel, { w: "fill", h: 1, fill: t.border });
  const ft = b.row(panel, { w: "fill", h: 64, pad: [0, 28], justify: "spaceBetween" });
  if (o.back !== false) K.btn(b, t, ft, "Back", { v: "ghost", sz: "dlg", icon: "arrowLeft" }); else b.frame(ft, { w: 10, h: 1 });
  if (o.left) b.text(ft, o.left, { size: 12, c: t.text3 });
  K.btn(b, t, ft, o.next ?? "Continue", { v: "primary", sz: "dlg", disabled: o.nextDisabled, iconRight: o.nextIcon });
  return w;
};
/** a settings page (Lumen SD1): window with the settings nav, 760 px column, H1 22 px + subtitle, groups */
export const settingsPage = (b: B, t: T, root: Ref, key: string, title: string, sub: string | undefined, body: (c: Ref, win: Ref) => void, o: { colW?: number; search?: string; update?: boolean; pill?: K.Pill } = {}) => {
  const { win, main } = K.desktopWindow(b, t, root, { nav: "settings", settingsKey: key, search: o.search, update: o.update, pill: o.pill });
  const outer = b.col(main, { w: "fill", h: "fill", pad: [28, 0], align: "center", clip: true });
  const c = b.col(outer, { w: o.colW ?? 760, gap: 20 });
  const h = b.col(c, { gap: 4, w: "fill" }); b.text(h, title, { size: 22, weight: "SemiBold", c: t.text }); if (sub) b.text(h, sub, { size: 13, c: t.text2, w: "fill", lh: 19 });
  body(c, win);
  return { win, main, c };
};
export const selectRow = (b: B, t: T, p: Ref, title: string, desc: string | undefined, value: string, w = 160) => K.settingRow(b, t, p, title, desc, (f) => K.select(b, t, f, value, w));
export const toggleRow = (b: B, t: T, p: Ref, title: string, desc: string | undefined, on: boolean) => K.settingRow(b, t, p, title, desc, (f) => K.toggle(b, t, f, on));
/** Windows native menu (Lumen TR1): short, groups separated by dividers, 27 px rows */
export const nativeMenu = (b: B, t: T, p: Ref | undefined, items: ({ l: string; k?: string; hi?: boolean } | "-")[], o: O = {}) => {
  const m = b.col(p, { w: 240, pad: 4, gap: 0, r: 8, fill: "#F9F9F9", stroke: "#0000001F", sw: 1, sa: "inside", shadow: "md", ...o });
  items.forEach((it) => {
    if (it === "-") { const s = b.frame(m, { w: "fill", h: 9, layout: "horizontal", align: "center" }); b.rect(s, { w: "fill", h: 1, fill: "#0000001A" }); return; }
    const r = b.row(m, { w: "fill", h: 27, pad: [0, 10], gap: 10, r: 4, fill: it.hi ? "#0000000F" : "none", justify: "spaceBetween" });
    b.text(r, it.l, { size: 13, c: "#1F1F1F" }); if (it.k) b.text(r, it.k, { size: 12, c: "#606060" });
  });
  return m;
};
/** tray icon state glyph: SpeakKit logo on a 32 px dark chip with a state mark */
export const trayIcon = (b: B, t: T, p: Ref | undefined, state: "normal" | "working" | "needs" | "paused" | "asleep", size = 32) => {
  const f = b.frame(p, { w: size, h: size, r: 6, fill: "#1C1D1F", layout: "horizontal", align: "center", justify: "center" });
  const bars = state === "working" ? [0.4, 0.8, 0.55, 0.9, 0.35] : [0.28, 0.5, 0.7, 0.42, 0.22];
  const col = state === "paused" ? "#8C8C8C" : state === "asleep" ? "#5F6368" : "#FFFFFF";
  const row = b.row(f, { gap: 2, align: "center" }); bars.forEach((h) => b.rect(row, { w: 3, h: size * 0.5 * h * (state === "paused" ? 0.5 : 1) + 2, r: 1.5, fill: col }));
  if (state === "needs") b.ellipse(f, { abs: true, x: size - 11, y: 2, w: 9, h: 9, fill: "#F5A524", stroke: "#1C1D1F", sw: 1.5 });
  return f;
};
