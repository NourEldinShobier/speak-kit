// d-library: Library (E*), reader (F*) and export/bell (J*) frames, drawn as editable copies of designs/built/shots/<ID>-*-light.png
// inside the real Windows 11 window (kit3 winApp). Coordinates are the shot's own (client 1278 x 799), so every number can be checked against the PNG. Light only.
import { B, Ref } from "./lib";
import { T, LIGHT } from "./kit";
import * as K from "./kit";
import { S } from "./types";
import { winApp } from "./kit3";

export const CW = 1278;
export const INK = "#1B2230", INK2 = "#475467", INK3 = "#5F6A7D", GREEN = "#17693D";

/** text whose vertical centre is cy (line height lh). x is the left edge; with ta "right"/"center" x is the right edge/centre of a box of width w. */
export const tx = (b: B, p: Ref, s: string, x: number, cy: number, o: Record<string, any> = {}) => {
  const lh = o.lh ?? 16; const { ta, w, ...rest } = o;
  const bw = w ?? 600;
  return b.text(p, s, { x: ta === "right" ? x - bw : ta === "center" ? x - bw / 2 : x, y: Math.round((cy - lh / 2) * 2) / 2, w: ta ? bw : w, lh, size: 13, c: INK, ta, ...rest });
};
/** icon centred on (cx, cy) */
export const ic = (b: B, p: Ref, name: string, size: number, cx: number, cy: number, c = INK2, o: Record<string, any> = {}) => {
  const f = b.icon(p, name, size, c, o); b.add("node.set", { ids: [f], x: Math.round(cx - size / 2), y: Math.round(cy - size / 2) }); return f;
};
export const box = (b: B, p: Ref, x: number, y: number, w: number, h: number, o: Record<string, any> = {}) => b.frame(p, { x, y, w, h, ...o });
/** run a kit component at (x, y) */
export const at = (b: B, p: Ref, x: number, y: number, draw: (f: Ref) => void) => { const f = b.frame(p, { x, y, layout: "horizontal", align: "start" }); draw(f); return f; };
export const dimAll = (b: B, t: T, c: Ref, h: number) => b.rect(c, { x: 0, y: 0, w: CW, h, fill: t.overlay });

/** keyboard hint ("Ctrl K"): 1 px stroke, r5 */
export const kbd = (b: B, p: Ref, label: string, x: number, y: number, w: number, dark = false) => {
  const k = box(b, p, x, y, w, 18, { r: 5, stroke: dark ? "#FFFFFF5C" : "#E5E5E5", sw: 1, sa: "inside" });
  tx(b, k, label, 0, 9, { w, ta: "left", size: 11, lh: 14, c: dark ? "#FAFAFA" : INK3, weight: "Medium" });
  return k;
};
const kbdC = (b: B, p: Ref, label: string, x: number, y: number, w: number, dark = false) => {
  const k = box(b, p, x, y, w, 18, { r: 5, stroke: dark ? "#FFFFFF5C" : "#E5E5E5", sw: 1, sa: "inside" });
  tx(b, k, label, w / 2, 9, { w, ta: "center", size: 11, lh: 14, c: dark ? "#FAFAFA" : INK3, weight: "Medium" });
  return k;
};

export type Shell = { main: Ref };
type ShellO = { h: number; nav?: string; footer?: string[]; dot?: boolean; recent?: string[]; pill?: { label: string; tone?: "ok" | "warn" | "err" | "info" | "neutral" }; engine?: string; sub?: string; noEngine?: boolean; mainFill?: string };
/** The Speak Kit window client: 36 px bar, 248 px sidebar, white panel at (252,36) 1018 x 735, 28 px footer. */
export const appShell = (b: B, t: T, c: Ref, o: ShellO): Shell => {
  const { h } = o; const nav = o.nav ?? "Library";
  b.rect(c, { name: "Window", x: 0, y: 0, w: CW, h, fill: "#F0F0F0" });
  // ---- title bar
  const bar = box(b, c, 0, 0, CW, 36, { name: "Title bar" });
  ic(b, bar, "sidebar", 16, 22, 18, INK); ic(b, bar, "left", 16, 55, 18, INK); ic(b, bar, "right", 16, 87, 18, "#9AA1AD");
  const se = box(b, bar, 434, 4, 419, 28, { name: "Search", r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" });
  ic(b, se, "search", 16, 18, 14, INK3); tx(b, se, "Search readings, voices and commands", 34, 14, { c: INK3 }); kbdC(b, se, "Ctrl K", 375, 5, 36);
  const pill = o.pill ?? { label: "Ready", tone: "ok" };
  at(b, bar, 1058, 8, (f) => K.badge(b, t, f, pill.label, pill.tone ?? "ok"));
  ic(b, bar, "bell", 16, 1127, 18, INK);
  if (o.dot) b.ellipse(bar, { x: 1127, y: 7, w: 7, h: 7, fill: t.dotOrange, stroke: "#F0F0F0", sw: 1.5, sa: "outside" });
  // ---- sidebar
  const sb = box(b, c, 0, 35, 252, h - 36 - 28, { name: "Sidebar" });
  const nr = box(b, sb, 8, 2, 236, 36, { name: "New reading", r: 8, fill: t.cta, shadow: "cta" });
  ic(b, nr, "plus", 16, 23, 18, "#FAFAFA"); tx(b, nr, "New reading", 37, 18, { size: 13, weight: "SemiBold", c: "#FAFAFA", lh: 18 }); kbdC(b, nr, "Ctrl N", 185, 9, 36, true);
  const items: [string, string][] = [["Home", "home"], ["Library", "book"], ["Voices", "mic"], ["Engines", "cpu"], ["Browser", "globe"]];
  items.forEach(([l, i], k) => { const cy = 68 + k * 38; const on = l === nav; ic(b, sb, i, 16, 27, cy, on ? INK : INK3); tx(b, sb, l, 46, cy, { size: 13, c: on ? INK : INK2, weight: on ? "Medium" : "Regular", lh: 18 }); });
  tx(b, sb, "Recent", 18, 262, { size: 11, weight: "Medium", c: INK3, lh: 14 });
  if (o.recent && o.recent.length) o.recent.forEach((r, k) => { ic(b, sb, "history", 14, 27, 289 + k * 28, INK3); tx(b, sb, r, 46, 289 + k * 28, { size: 13, c: INK2, w: 190 }); });
  else tx(b, sb, "Readings you start appear here.", 18, 289, { size: 12, c: INK3, lh: 16 });
  if (!o.noEngine) {
    const ec = box(b, sb, 8, 637, 236, 54, { name: "Engine card", r: 14, fill: "#FFFFFF", shadow: "card" });
    tx(b, ec, o.engine ?? "Kokoro-82M · Ready", 12, 18, { size: 13, weight: "Medium", lh: 18 });
    if (o.sub) tx(b, ec, o.sub, 12, 35, { size: 12, c: INK3 });
    else { ic(b, ec, "lock", 14, 18, 35, GREEN); tx(b, ec, "100% on this device", 31, 35, { size: 12, c: GREEN }); }
  }
  ic(b, sb, "settings", 16, 27, 715, INK3); tx(b, sb, "Settings", 46, 715, { size: 13, c: INK2, lh: 18 });
  // ---- panel
  const main = b.frame(c, { name: "Panel", x: 252, y: 36, w: 1018, h: h - 36 - 28, r: 14, fill: o.mainFill ?? "#FFFFFF", clip: true, shadow: "card" });
  // ---- footer: right aligned, 12 px, 10 px gaps, 1 px dividers
  const ft = o.footer ?? ["Kokoro ready", "Voice: Heart", "3 readings"];
  const fr = b.row(c, { name: "Footer", x: 600, y: h - 28, w: 664, h: 28, gap: 10, justify: "max", align: "center" });
  ft.forEach((s, i) => { if (i) b.rect(fr, { w: 1, h: 12, fill: "#C3C6CC" }); b.text(fr, s, { size: 12, c: INK3, lh: 16 }); });
  return { main };
};

/** the Windows window around a client: returns the client frame and a function to draw on top (scrim etc.) */
export const winFrame = (b: B, root: Ref, h: number) => {
  const a = winApp(b, root, { w: CW, h, backdrop: { w: 1440, h: 900 } });
  return a.ref;
};

// ======================================================================= Library
export type Row = { t: string; s: string; tile: string; badge?: "New" | "Finished" | { pct: number; label: string }; time: string; when: string; hl?: string; sub?: string };
export const ROWS: Record<string, Row> = {
  mn: { t: "Meeting notes", s: "Meeting notes.txt", tile: "clip", badge: "New", time: "0:06", when: "Today" },
  sm: { t: "Speech models", s: "Speech models.txt", tile: "clip", badge: "New", time: "0:08", when: "Today" },
  lf: { t: "Why local-first matters", s: "local-first.md", tile: "MD", badge: "New", time: "0:30", when: "Today" },
};
const newBadge = (b: B, p: Ref, x: number, cy: number) => {
  const f = box(b, p, x, cy - 10, 40, 20, { r: 999, fill: "#F0F0F0" }); tx(b, f, "New", 20, 10, { w: 40, ta: "center", size: 12, weight: "Medium", c: "#0B5CAD", lh: 16 }); return f;
};
const hlText = (b: B, p: Ref, text: string, q: string | undefined, x: number, cy: number, o: Record<string, any>) => {
  if (!q) return tx(b, p, text, x, cy, o);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return tx(b, p, text, x, cy, o);
  const r = b.row(p, { x, y: cy - 9, gap: 0, h: 18 });
  if (i) b.text(r, text.slice(0, i).replace(/ $/, " "), { size: o.size ?? 13, c: o.c ?? INK, weight: o.weight, lh: 16 });
  const m = b.frame(r, { layout: "horizontal", pad: [1, 0], r: 3, fill: "#E3CF9D", align: "center" }); b.text(m, text.slice(i, i + q.length), { size: o.size ?? 13, c: INK, weight: o.weight, lh: 16 });
  if (i + q.length < text.length) b.text(r, text.slice(i + q.length).replace(/^ /, " "), { size: o.size ?? 13, c: o.c ?? INK, weight: o.weight, lh: 16 });
  return r;
};
/** one row at list-local (0, y) */
export const libRow = (b: B, t: T, list: Ref, r: Row, y: number, first: boolean, q?: string) => {
  const h = r.sub ? 68 : 68;
  const row = box(b, list, 0, y, 952, h);
  if (!first) b.rect(row, { x: 0, y: 0, w: 952, h: 1, fill: "#EBEBEB" });
  const tile = box(b, row, 16, 14, 40, 40, { r: 8, fill: "#F5F5F5" });
  if (r.tile === "clip") ic(b, tile, "clipboard", 16, 20, 20, "#737373"); else if (r.tile === "globe") ic(b, tile, "globe", 16, 20, 20, "#737373"); else tx(b, tile, r.tile, 20, 20, { w: 40, ta: "center", size: 11, c: INK3, weight: "Medium" });
  hlText(b, row, r.t, q, 72, 26, { size: 14, weight: "Medium", lh: 18 });
  hlText(b, row, r.s, q, 72, 42, { size: 13, c: INK2, lh: 16 });
  const bx = 507, cy = 34;
  if (r.badge === "New") newBadge(b, row, bx, cy);
  else if (r.badge === "Finished") { const f = box(b, row, bx, cy - 10, 80, 20, { r: 999, fill: t.okSoft }); ic(b, f, "check", 12, 12, 10, t.ok); tx(b, f, "Finished", 22, 10, { size: 12, weight: "Medium", c: t.ok }); }
  else if (r.badge) { const tr = box(b, row, bx, cy - 9, 210, 4, { r: 999, fill: "#F0F0F0", clip: true }); b.rect(tr, { x: 0, y: 0, w: 210 * r.badge.pct, h: 4, fill: t.accent }); tx(b, row, r.badge.label, bx, cy + 8, { size: 12, c: INK2 }); }
  tx(b, row, r.time, 804, cy, { w: 72, ta: "right", size: 13, c: INK });
  tx(b, row, r.when, 905, cy, { w: 84, ta: "right", size: 13, c: INK2 });
  ic(b, row, "dots", 16, 926, cy, INK);
  return row;
};
export type LibO = { sub?: string; rows?: Row[]; chip?: number; q?: string; count?: string; focusSearch?: boolean; banner?: boolean; sortOpen?: boolean };
const CHIPS: [string, number][] = [["All", 41], ["Web pages", 95], ["PDFs and files", 113], ["Pasted text", 95], ["Unfinished", 92]];
/** Library page body inside the panel (panel coordinates: shot x-252, y-36) */
export const libBody = (b: B, t: T, m: Ref, o: LibO) => {
  tx(b, m, "Library", 33, 46, { size: 22, weight: "SemiBold", lh: 28, c: INK });
  tx(b, m, o.sub ?? "3 readings · 1 min of audio", 33, 72, { size: 13, c: INK2, lh: 18 });
  const se = box(b, m, 580, 32, 320, 36, { r: 8, fill: "#FFFFFF", stroke: o.focusSearch ? "#171717" : "#E5E5E5", sw: 1, sa: "inside", shadow: o.focusSearch ? undefined : "ctl" });
  ic(b, se, "search", 16, 21, 18, INK3);
  if (o.q !== undefined) tx(b, se, o.q, 36, 18, { size: 13, c: INK }); else tx(b, se, "Search title, source or text", 37, 18, { c: "#6B7280" });
  const add = box(b, m, 908, 32, 77, 36, { r: 8, fill: t.cta, shadow: "cta" }); ic(b, add, "plus", 16, 23, 18, "#FAFAFA"); tx(b, add, "Add", 38, 18, { size: 13, weight: "Medium", c: "#FAFAFA", lh: 18 });
};
export const chipsAndSort = (b: B, t: T, m: Ref, y: number, active = 0) => {
  let x = 33;
  CHIPS.forEach(([l, w], i) => { const c = box(b, m, x, y, w, 26, { r: 999, fill: i === active ? "#F0F0F0" : "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside" }); tx(b, c, l, w / 2, 13, { w, ta: "center", size: 13, c: i === active ? INK : INK2, weight: i === active ? "Medium" : "Regular", lh: 18 }); x += w + 8; });
  const s = box(b, m, 808, y - 1, 177, 28, { r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" });
  tx(b, s, "Sort: Recently played", 13, 14, { size: 13, c: INK, lh: 18 }); ic(b, s, "down", 16, 157, 14, INK2);
};
export const listCard = (b: B, m: Ref, y: number, n: number, h?: number) => b.frame(m, { name: "List", x: 33, y, w: 952, h: h ?? n * 68.5 - 0.5 + 1, r: 12, fill: "#FFFFFF", shadow: "ring", clip: true });

export const libraryPage = (b: B, t: T, m: Ref, o: LibO & { rows: Row[] }) => {
  libBody(b, t, m, o);
  const y = o.banner ? 97 + 69 : 97;
  chipsAndSort(b, t, m, y, o.chip ?? 0);
  const lc = listCard(b, m, y + 42, o.rows.length);
  o.rows.forEach((r, i) => libRow(b, t, lc, r, i * 68.5, i === 0, o.q));
  return lc;
};

// ---------------------------------------------------------------------- shared pieces
type BV = "primary" | "secondary" | "danger" | "ghost";
/** Lumen button: 36 px (sm 28), r8, primary SemiBold on #201E25, secondary white with 1 px stroke, danger 10% red */
export const pbtn = (b: B, t: T, p: Ref, label: string, o: { v?: BV; icon?: string; sz?: "md" | "sm"; w?: number; dis?: boolean; spin?: boolean; x?: number; y?: number } = {}) => {
  const v = o.v ?? "secondary"; const sm = o.sz === "sm"; const h = sm ? 28 : 36;
  const fill = v === "primary" ? t.cta : v === "danger" ? "#C628281A" : v === "secondary" ? "#FFFFFF" : "none";
  const fg = v === "primary" ? "#FAFAFA" : v === "danger" ? t.destructive : v === "ghost" ? INK2 : "#171717";
  const f = b.row(p, { x: o.x, y: o.y, h, w: o.w ?? "hug", pad: [0, sm ? 12 : 14], gap: 6, r: 8, fill, justify: "center", stroke: v === "secondary" ? "#E5E5E5" : undefined, sw: 1, sa: "inside", shadow: v === "primary" ? "cta" : v === "secondary" ? "ctl" : undefined, opacity: o.dis ? 0.5 : undefined });
  if (o.spin) b.icon(f, "loader", sm ? 14 : 16, fg); else if (o.icon) b.icon(f, o.icon, sm ? 14 : 16, fg);
  b.text(f, label, { size: 13, weight: v === "primary" ? "SemiBold" : "Medium", c: fg, lh: 18 });
  return f;
};
/** centered dialog: pad 16, gap 14, r10, title 15 semibold, close 28 px at top 10 / right 10 */
export const dialog = (b: B, t: T, c: Ref, o: { w: number; h: number; title: string; H?: number; x?: number; y?: number }) => {
  const H = o.H ?? 799;
  const d = b.col(c, { name: "Dialog", x: o.x ?? (CW - o.w) / 2, y: o.y ?? Math.round(((H - o.h) / 2) * 2) / 2, w: o.w, h: o.h, pad: 16, gap: 14, r: 10, fill: "#FFFFFF", shadow: "dlg" });
  const hd = b.row(d, { w: "fill", h: 20, pad: [0, 24, 0, 0] }); b.text(hd, o.title, { size: 15, weight: "SemiBold", c: INK, lh: 20 });
  const cl = b.frame(d, { abs: true, x: o.w - 38, y: 10, w: 28, h: 28 }); ic(b, cl, "x", 14, 14, 14, INK);
  const body = b.col(d, { w: "fill", gap: 8 });
  return { d, body };
};
export const dfoot = (b: B, d: Ref) => b.row(d, { w: "fill", justify: "max", gap: 8, pad: [6, 0, 0, 0], align: "center" });
export const label = (b: B, p: Ref, s: string) => b.text(p, s, { size: 12, weight: "Medium", c: INK2, lh: 15 });
export const field = (b: B, p: Ref, o: { value?: string; ph?: string; icon?: string; h?: number; focus?: boolean; w?: number | "fill" }) => {
  const f = b.row(p, { w: o.w ?? "fill", h: o.h ?? 36, pad: [4, 12], gap: 8, r: 8, fill: "#FFFFFF", stroke: o.focus ? "#171717" : "#E5E5E5", sw: o.focus ? 2 : 1, sa: "inside", shadow: "ctl" });
  if (o.icon) b.icon(f, o.icon, 16, INK3);
  if (o.value !== undefined) b.text(f, o.value, { size: 13, c: INK, lh: 18 }); else b.text(f, o.ph ?? "", { size: 13, c: "#6B7280", lh: 18 });
  return f;
};
export const select = (b: B, p: Ref, v: string, w: number, h = 28) => {
  const f = b.row(p, { w, h, pad: [0, 8, 0, 12], gap: 8, r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl", justify: "spaceBetween" });
  b.text(f, v, { size: 13, c: INK, lh: 18 }); b.icon(f, "down", 16, INK2); return f;
};
/** Lumen banner: warning (orange) 10/14 or error (red) 12/16; title 13 semibold, text 12/15 */
export const banner = (b: B, t: T, p: Ref, o: { tone: "warn" | "err"; title: string; text?: string; action?: string; w?: number | "fill"; icon?: string; x?: number; y?: number; primary?: boolean }) => {
  const e = o.tone === "err";
  const f = b.row(p, { x: o.x, y: o.y, w: o.w ?? "fill", pad: e ? [12, 16] : [10, 14], gap: e ? 12 : 10, r: 12, fill: e ? "#FFE4E5" : "#FFEBCF" });
  b.icon(f, o.icon ?? (e ? "alertCircle" : "alert"), 16, e ? t.err : "#B35C00");
  const body = b.col(f, { w: "fill", gap: 2 });
  b.text(body, o.title, { size: 13, weight: "SemiBold", c: INK, lh: 16 }); if (o.text) o.text.split("\n").forEach((ln) => b.text(body, ln, { size: 12, c: INK2, lh: 15, w: "fill" }));
  if (o.action) pbtn(b, t, f, o.action, { v: o.primary ? "primary" : "ghost", sz: "sm" });
  return f;
};
export const emptyCard = (b: B, t: T, m: Ref, y: number, h: number, icon: string, title: string, lines: string[], btns: [string, "primary" | "secondary", number][]) => {
  const card = b.frame(m, { x: 33, y, w: 952, h, r: 12, fill: "#FFFFFF", shadow: "ring" });
  box(b, card, 451, 41, 52, 52, { r: 12, fill: "#F5F5F5" }); ic(b, card, icon, 24, 477, 67, INK2);
  tx(b, card, title, 476, 114, { w: 500, ta: "center", size: 15, weight: "SemiBold", lh: 20 });
  lines.forEach((l, i) => tx(b, card, l, 476, 145 + i * 19, { w: 700, ta: "center", size: 13, c: INK2, lh: 18 }));
  const by = 145 + lines.length * 19 + 4;
  let x = 476 - btns.reduce((a, q) => a + q[2], 0) / 2 - 4 * (btns.length - 1);
  btns.forEach(([l, v, w]) => { pbtn(b, t, card, l, { v, w, x, y: by }); x += w + 8; });
  return card;
};
const searchLine = (b: B, m: Ref, n: string) => { tx(b, m, n, 33, 154, { size: 13, c: INK2, lh: 18 }); tx(b, m, "Clear", 107, 154, { size: 13, weight: "Medium", c: INK, lh: 18 }); };
/** search field with a typed query: focus = 2 px dark ring plus the native input outline */
export const focusSearch = (b: B, m: Ref, q: string) => {
  const se = box(b, m, 580, 32, 320, 36, { r: 8, fill: "#FFFFFF", stroke: "#171717", sw: 2, sa: "inside" });
  ic(b, se, "search", 16, 21, 18, INK3);
  box(b, se, 35, 5, 270, 24, { stroke: "#4B9BF5", sw: 1.5, sa: "inside", r: 2 }); tx(b, se, q, 38, 18, { size: 13, c: INK });
};
const dim = (b: B, t: T, c: Ref, h = 799) => dimAll(b, t, c, h);

const lib = (b: B, t: T, c: Ref, o: { rows: Row[]; sub?: string; footer?: string[]; q?: string; h?: number; banner?: boolean }) => {
  const { main } = appShell(b, t, c, { h: o.h ?? 799, footer: o.footer });
  libraryPage(b, t, main, { rows: o.rows, sub: o.sub, q: o.q, banner: o.banner });
  return main;
};
const R3 = [ROWS.mn, ROWS.sm, ROWS.lf];

const mk = (id: string, title: string, note: string, build: (b: B, t: T, c: Ref) => void, h = 799): S => ({ id, group: id[0], title, note, w: 1440, h: 900, build: (b, t, root) => {
  const a = winApp(b, root, { w: CW, h, backdrop: { w: 1440, h: 900 } }); build(b, t, a.ref);
} });

const dropZone = (b: B, t: T, c: Ref, o: { bad?: boolean; h?: number; text: string; sub: string }) => {
  const { main } = appShell(b, t, c, { h: o.h ?? 798, footer: ["Kokoro ready", "Voice: Heart", "3 readings"] });
  const z = box(b, main, 17, 8, 984, 718, { r: 12, fill: o.bad ? "#FFE4E5" : "#E0EDF9", stroke: o.bad ? "#A61B1B" : "#0069CC", sw: 2, sa: "inside", dashes: [5, 3] });
  ic(b, z, "upload", 24, 492, 303, o.bad ? "#A61B1B" : INK2);
  tx(b, z, o.text, 492, 331, { w: 600, ta: "center", size: 13, weight: "SemiBold", lh: 18 });
  tx(b, z, o.sub, 492, 354, { w: 700, ta: "center", size: 12, c: INK2, lh: 16 });
};
const toast = (b: B, t: T, c: Ref, y: number, msg: string, undo?: boolean) => {
  const f = b.row(c, { name: "Toast", x: 461, y, w: 356, h: 52, pad: [8, 14], gap: 12, r: 10, fill: "#FFFFFF", shadow: "lg" });
  b.icon(f, "circleCheck", 16, INK2); b.text(f, msg, { size: 13.5, weight: "Medium", c: INK, w: "fill", lh: 20 });
  if (undo) pbtn(b, t, f, "Undo", { sz: "sm" });
};

export const VLIB_E: S[] = [
  mk("E1", "Library · empty", "Zero readings: Nothing to read yet, Choose file, Paste text and a web address link.", (b, t, c) => {
    const { main } = appShell(b, t, c, { h: 799, footer: ["Kokoro ready", "Voice: Heart", "0 readings"] });
    libBody(b, t, main, { sub: "0 readings" });
    emptyCard(b, t, main, 95, 262, "book", "Nothing to read yet", ["Drop a PDF, Word, EPUB, Markdown or text file here. Or", "use a web address."], [["Choose file", "primary", 98], ["Paste text", "secondary", 90]]);
  }),
  mk("E2", "Library · with readings", "Three readings: tile, title and source, status, duration, date and a row menu.", (b, t, c) => { lib(b, t, c, { rows: R3 }); }),
  mk("E3", "Add · paste text", "Dialog with title, text, live word count, voice; Add or Add and play.", (b, t, c) => {
    lib(b, t, c, { rows: R3 }); dim(b, t, c);
    const { d, body } = dialog(b, t, c, { w: 560, h: 446, title: "Add pasted text" });
    const f1 = b.col(body, { w: "fill", gap: 8 }); label(b, f1, "Title (optional)"); field(b, f1, { value: "Notes from the call" });
    label(b, body, "Text");
    const ta = b.col(body, { w: "fill", h: 196, pad: [8, 12], gap: 0, r: 8, fill: "#FFFFFF", stroke: "#171717", sw: 2, sa: "inside" });
    b.text(ta, "We talked about the reader first.", { size: 14, c: INK, lh: 20 }); b.text(ta, " ", { size: 14, lh: 20 }); b.text(ta, "The export dialog follows after the release.", { size: 14, c: INK, lh: 20 });
    const r = b.row(body, { w: "fill", justify: "spaceBetween", align: "center" }); b.text(r, "13 words · about 0:05 at 1x", { size: 12, c: INK3, lh: 16 }); select(b, r, "Heart · US", 160);
    const ft = dfoot(b, d); pbtn(b, t, ft, "Cancel"); pbtn(b, t, ft, "Add"); pbtn(b, t, ft, "Add and play", { v: "primary", icon: "play" });
  }),
  mk("E4", "Add · web address fetching", "Field is read-only while fetching; the primary button shows Fetching.", (b, t, c) => {
    lib(b, t, c, { rows: R3 }); dim(b, t, c);
    const { d, body } = dialog(b, t, c, { w: 520, h: 181, title: "Add from a web address" });
    label(b, body, "Web address"); field(b, body, { value: "http://127.0.0.1:52650/article", icon: "link" });
    const ft = dfoot(b, d); pbtn(b, t, ft, "Cancel"); pbtn(b, t, ft, "Fetching", { v: "primary", spin: true, dis: true });
  }),
  mk("E5", "Add · web address failed", "Reason in plain words, details behind a link; Paste text instead is the way forward.", (b, t, c) => {
    lib(b, t, c, { rows: R3 }); dim(b, t, c);
    const { d, body } = dialog(b, t, c, { w: 520, h: 257, title: "Add from a web address" });
    label(b, body, "Web address"); field(b, body, { value: "http://127.0.0.1:52689/article", icon: "link" });
    banner(b, t, body, { tone: "warn", title: "That page could not be added", text: "Some sites block automatic reading. Copy the article text and paste it instead.", action: "Details" });
    const ft = dfoot(b, d); pbtn(b, t, ft, "Cancel"); pbtn(b, t, ft, "Paste text instead", { v: "primary" });
  }),
  mk("E6", "Library · dragging a file", "The whole content area becomes the drop target.", (b, t, c) => dropZone(b, t, c, { text: "Drop to add to your library", sub: "PDF, DOCX, EPUB, Markdown, HTML and text files" }), 798),
  mk("E14", "Library · dragging several files", "The same drop target for any number of files.", (b, t, c) => dropZone(b, t, c, { text: "Drop to add to your library", sub: "PDF, DOCX, EPUB, Markdown, HTML and text files" }), 798),
];

// ---------------------------------------------------------------------- E7 - E16
const RS = (r: Row, o: Partial<Row>): Row => ({ ...r, ...o });
const PASTE5: Row = { t: "We talked about the reader first.", s: "Pasted text", tile: "clip", badge: "New", time: "0:05", when: "Today" };
const NOTE5: Row = { t: "Pasted note", s: "Pasted text", tile: "clip", badge: "New", time: "0:05", when: "Today" };
const results = (b: B, t: T, c: Ref, q: string, rows: Row[], n: number) => {
  const { main } = appShell(b, t, c, { h: 799 });
  libBody(b, t, main, {}); focusSearch(b, main, q); chipsAndSort(b, t, main, 97, 0); searchLine(b, main, `${n} results`);
  if (rows.length) { const lc = listCard(b, main, 183, rows.length); rows.forEach((r, i) => libRow(b, t, lc, r, i * 68.5, i === 0, q)); }
  return main;
};
const MENU: [string, string, boolean?][] = [["Play", "play"], ["Rename", "edit"], ["Change voice", "mic"], ["Mark as finished", "circleCheck"]];
const delDialog = (b: B, t: T, c: Ref, title: string, text: string) => {
  dim(b, t, c);
  const { d, body } = dialog(b, t, c, { w: 440, h: 162, title });
  b.text(body, text, { size: 14, c: INK3, lh: 20, w: "fill" });
  const ft = dfoot(b, d); pbtn(b, t, ft, "Cancel"); pbtn(b, t, ft, "Delete", { v: "danger" });
};

export const VLIB_E2: S[] = [
  mk("E7", "Library · search results", "Matches highlighted in title, source or text, result count and a Clear link.", (b, t, c) => {
    results(b, t, c, "speech", [RS(ROWS.sm, { t: "Speech models", s: "Speech models.txt" }), RS(ROWS.lf, { s: "...it keeps working when a service shuts down. How speech mode..." })], 2);
  }),
  mk("E8", "Library · no search results", "Clear search is the primary action; Add text is secondary.", (b, t, c) => {
    const main = results(b, t, c, "zebra", [], 0);
    emptyCard(b, t, main, 183, 243, "search", "No readings match \"zebra\"", ["Titles, sources and the text of every reading were searched."], [["Clear search", "primary", 107], ["Add text", "secondary", 81]]);
  }),
  mk("E9", "Library · row menu", "Anchored to the row's menu button: Play, Rename, Change voice, Mark as finished, Delete.", (b, t, c) => {
    lib(b, t, c, { rows: R3 });
    const m = b.col(c, { name: "Row menu", x: 1071, y: 229, w: 153, pad: [4, 4], gap: 0, r: 10, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "md" });
    const item = (l: string, i: string, red = false) => { const r = b.row(m, { w: "fill", h: 28, pad: [0, 8], gap: 8, r: 6 }); b.icon(r, i, 16, red ? t.destructive : INK3); b.text(r, l, { size: 14, c: red ? t.destructive : INK, lh: 18 }); };
    MENU.forEach(([l, i]) => item(l, i));
    const sp = b.frame(m, { w: "fill", h: 8, layout: "horizontal", align: "center" }); b.rect(sp, { w: "fill", h: 1, fill: "#EBEBEB" });
    item("Delete", "trash", true);
  }),
  mk("E10", "Library · delete confirmation", "Imported file or page: the original is untouched. Cancel is the default.", (b, t, c) => {
    lib(b, t, c, { rows: R3 });
    delDialog(b, t, c, "Delete \"Meeting notes\"?", "The original file or page is not touched. Only the reading and its progress are removed from Speak Kit.");
  }),
  mk("E12", "Library · deleted toast", "After deleting, a toast offers Undo.", (b, t, c) => {
    lib(b, t, c, { rows: [ROWS.sm, ROWS.lf], sub: "2 readings · 1 min of audio" }); toast(b, t, c, 721, "Deleted \"Meeting notes\".", true);
  }, 798),
  mk("E13", "Library · added toast", "Success toast after adding; the new reading is at the top.", (b, t, c) => {
    lib(b, t, c, { rows: [PASTE5, ROWS.mn, ROWS.sm, ROWS.lf], sub: "4 readings · 1 min of audio" }); toast(b, t, c, 721, "Added \"We talked about the reader first.\".");
  }, 798),
  mk("E15", "Library · unsupported file", "A banner names the file type and lists the supported ones; Dismiss clears it.", (b, t, c) => {
    const { main } = appShell(b, t, c, { h: 798 }); libraryPage(b, t, main, { rows: R3, banner: true });
    banner(b, t, main, { tone: "warn", x: 33, y: 96, w: 952, title: "Some files could not be added", text: "movie.mp4: .mp4 is not a supported type. Supported: TXT, MD, HTML, PDF, DOCX, EPUB.", action: "Dismiss" });
  }, 798),
  mk("E16", "Library · delete pasted text", "Pasted text has no original, so the copy says it is the only copy.", (b, t, c) => {
    lib(b, t, c, { rows: [NOTE5, ROWS.mn, ROWS.sm, ROWS.lf], sub: "4 readings · 1 min of audio", footer: ["Kokoro ready", "Voice: Heart", "4 readings"], h: 798 });
    delDialog(b, t, c, "Delete \"Pasted note\"?", "Pasted text has no original file, so this is the only copy. You can undo for a few seconds.");
  }, 798),
];

// ======================================================================= Reader
export type Line = { k: "title" | "meta" | "h" | "p" | "pm"; t: string; cy: number; x?: number };
export type Mark = { x0: number; x1: number; y0: number; y1: number; c: string };
export const MK_SENT = "#EBDDBB", MK_WORD = "#C49B36", MK_FIND = "#A8CBEF", MK_CUR = "#E0B070";
/** coordinates are the shot's own (client space); the article column starts at x 417 */
const drawLines = (b: B, c: Ref, lines: Line[], o: { serif?: boolean; size?: number; dx?: number; dy?: number } = {}) => {
  const ff = o.serif ? "Georgia" : "Inter"; const dx = o.dx ?? 0, dy = o.dy ?? 0;
  lines.forEach((l) => {
    const x = (l.x ?? 417) + dx, cy = l.cy + dy + (l.k === "title" ? -2 : l.k === "meta" ? 0 : -1);
    if (l.k === "title") tx(b, c, l.t, x, cy, { size: 38, weight: "SemiBold", lh: 46, c: INK, ff });
    else if (l.k === "meta") tx(b, c, l.t, x, cy, { size: 14, c: INK2, lh: 20, ff });
    else if (l.k === "h") tx(b, c, l.t, x, cy, { size: 28.5, weight: "SemiBold", lh: 37, c: INK, ff });
    else if (l.k === "pm") tx(b, c, l.t, x, cy, { size: o.size ?? 19, lh: 32, c: INK2, ff });
    else tx(b, c, l.t, x, cy, { size: o.size ?? 19, lh: 32, c: INK, ff });
  });
};
export const LF: Line[] = [
  { k: "title", t: "Why local-first matters", cy: 154 }, { k: "meta", t: "76 words", cy: 194 },
  { k: "h", t: "Why local-first matters", cy: 250 },
  { k: "p", t: "Local-first software keeps your data on your own computer. It works", cy: 312 }, { k: "p", t: "without a network, and it keeps working when a service shuts down.", cy: 344 },
  { k: "h", t: "How speech models got small", cy: 400 },
  { k: "p", t: "A few years ago a natural voice needed a server farm. Today an eighty", cy: 462 }, { k: "p", t: "million parameter model speaks faster than you can read.", cy: 494 },
  { k: "h", t: "What comes next", cy: 546 },
  { k: "p", t: "Voices will run on every laptop. The only thing left to decide is which one", cy: 611 }, { k: "p", t: "you like to hear.", cy: 643 },
];
export type Bar = { title: string; sub?: string; cur: string; end: string; frac?: number; playing?: boolean; speed?: string; sleep?: string; dim?: boolean };
/** player bar: tile, title, transport, scrub row, speed / sleep / volume / queue */
export const playerBar = (b: B, t: T, c: Ref, o: Bar, dy = 0) => {
  const Y = (y: number) => y + dy; const op = o.dim ? 0.4 : undefined;
  const tile = box(b, c, 276, Y(709), 40, 40, { r: 8, fill: "#F5F5F5" }); ic(b, tile, "headphones", 20, 20, 20, "#737373");
  tx(b, c, o.title, 328, Y(721.5), { size: 14, weight: "Medium", lh: 18, c: INK });
  tx(b, c, o.sub ?? "Heart · Kokoro", 328, Y(737), { size: 12, c: INK2, lh: 16 });
  const tc = o.dim ? "#A0A5AF" : INK;
  ic(b, c, "skipBack", 18, 663, Y(719), tc); ic(b, c, "back10", 20, 711, Y(719), tc); ic(b, c, "fwd10", 20, 811, Y(719), tc); ic(b, c, "skipFwd", 18, 861, Y(719), tc);
  const pb = b.frame(c, { x: 741, y: Y(699), w: 40, h: 40, r: 20, fill: t.cta, shadow: "cta", opacity: op }); ic(b, pb, o.playing === false ? "play" : "pause", 20, 20, 20, "#FAFAFA");
  tx(b, c, o.cur, 481, Y(751), { size: 12, c: INK2, lh: 16 }); tx(b, c, o.end, 1041, Y(751), { size: 12, c: INK2, lh: 16, w: 60, ta: "right" });
  const track = box(b, c, 533, Y(749), 200, 4, { r: 2, fill: "#F0F0F0" });
  const fr = o.frac ?? 0; if (fr > 0) box(b, track, 0, 0, 8 + 184 * fr, 4, { r: 2, fill: t.accent });
  b.ellipse(c, { x: 533 + 184 * fr, y: Y(743), w: 16, h: 16, fill: "#FFFFFF", stroke: "#C3C6CC", sw: 1.5, sa: "inside" });
  const ex = o.sleep ? 39 : 0;
  const sp = box(b, c, 1071 - ex, Y(716), 37, 26, { r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" }); tx(b, sp, o.speed ?? "1x", 18.5, 13, { w: 37, ta: "center", size: 13, c: INK, lh: 18 });
  const sw = o.sleep ? 80 : 41;
  const sl = box(b, c, 1117 - ex, Y(716), sw, 26, { r: 8, fill: o.sleep ? "#F5F5F5" : "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" });
  ic(b, sl, "zzz", 16, o.sleep ? 20 : 20.5, 13, INK); if (o.sleep) tx(b, sl, o.sleep, 34, 13, { size: 12, c: INK, lh: 16, weight: "Medium" });
  ic(b, c, "volume", 16, 1184, Y(729), INK); ic(b, c, "list", 16, 1228, Y(729), INK);
};
export type RO = { h?: number; source: string; srcW?: number; dot?: boolean; footer?: string[]; lines: Line[]; marks?: Mark[]; bar: Bar; thumb?: [number, number] | false; serif?: boolean; size?: number; recent?: string[]; topDim?: boolean; find?: boolean; hideBar?: boolean; extra?: (pane: Ref) => void };
/** the reader inside the window: sidebar and footer from appShell, then the reading pane, top bar and player bar */
export const reader = (b: B, t: T, c: Ref, o: RO) => {
  const H = o.h ?? 799; const dy = H - 799;
  appShell(b, t, c, { h: H, dot: o.dot ?? true, footer: o.footer ?? ["Kokoro ready", "Voice: Heart", "1 reading"], recent: o.recent });
  const top = o.find ? 89 + 0 : 89;
  const pane = b.frame(c, { name: "Reading pane", x: 252, y: top, w: 1018, h: 688 + dy - top, clip: true, fill: "#FFFFFF" });
  (o.marks ?? []).forEach((m) => b.rect(pane, { x: m.x0 - 252, y: m.y0 - top, w: m.x1 - m.x0, h: m.y1 - m.y0, r: 2, fill: m.c }));
  drawLines(b, pane, o.lines, { serif: o.serif, size: o.size, dx: -252, dy: -top });
  if (o.thumb !== false) b.rect(c, { x: 1263, y: (o.thumb ?? [92, 610])[0], w: 4, h: (o.thumb ?? [92, 610])[1] - (o.thumb ?? [92, 610])[0], r: 2, fill: "#D1D1D1" });
  if (o.extra) o.extra(pane);
  // top bar
  const tb = b.frame(c, { name: "Reader top bar", x: 252, y: 36, w: 1018, h: 53, fill: "#FFFFFF" });
  ic(b, tb, "arrowLeft", 16, 34, 26, INK); tx(b, tb, "Library", 60, 26, { size: 14, weight: "Medium", lh: 18 });
  const w = o.srcW ?? (o.source === "Pasted text · Pasted text" ? 153 : o.source === "File · local-first.md" ? 122 : Math.round(o.source.length * 5.2 + 17));
  const sc = box(b, tb, 111, 16, w, 20, { r: 999, fill: "#F0F0F0" }); tx(b, sc, o.source, 9, 10, { size: 12, c: INK2, lh: 16 });
  [["search", 764], ["textSize", 807], ["bookmark", 852], ["download", 896], ["sidebarRight", 940], ["mic", 984]].forEach(([n, x]) => ic(b, tb, n as string, 16, x as number, 26, INK));
  b.rect(tb, { x: 0, y: 52, w: 1018, h: 1, fill: "#EBEBEB" });
  // player bar sits on the panel's white bottom band
  b.rect(c, { x: 252, y: 688 + dy, w: 1018, h: 1, fill: "#EBEBEB" });
  if (!o.hideBar) playerBar(b, t, c, o.bar, dy);
};
export const VLIB_F: S[] = [
  mk("F1", "Reader · playing", "Sentence band plus word marker on the heading; the player bar shows pause, 0:00 of 0:28.", (b, t, c) => {
    reader(b, t, c, { source: "File · local-first.md", lines: LF, footer: ["Kokoro ready", "Voice: Heart", "3 readings"], bar: { title: "Why local-first matters", cur: "0:00", end: "0:28", playing: true },
      marks: [{ x0: 416, x1: 733, y0: 231, y1: 265, c: MK_SENT }, { x0: 486, x1: 619, y0: 231, y1: 265, c: MK_WORD }] });
  }),
  mk("F2", "Reader · paused", "Paused keeps the sentence band on the heading; the play button replaces pause.", (b, t, c) => {
    reader(b, t, c, { source: "File · local-first.md", lines: LF, footer: ["Kokoro ready", "Voice: Heart", "3 readings"], bar: { title: "Why local-first matters", cur: "0:00", end: "0:28", playing: false },
      marks: [{ x0: 416, x1: 733, y0: 231, y1: 265, c: MK_SENT }] });
  }),
];

// ---------------------------------------------------------------------- F3 - F17
const SHORT = (x = 421, serif = false): Line[] => serif
  ? [{ k: "title", t: "Short", cy: 154, x }, { k: "meta", t: "16 words", cy: 194, x }, { k: "p", t: "One short sentence here. A second sentence follows it. And a third to finish the", cy: 246.5, x }, { k: "p", t: "paragraph.", cy: 278.5, x }]
  : [{ k: "title", t: "Short", cy: 154, x }, { k: "meta", t: "16 words", cy: 194, x }, { k: "p", t: "One short sentence here. A second sentence follows it. And a third to finish", cy: 246.5, x }, { k: "p", t: "the paragraph.", cy: 278.5, x }];
const P2 = "scrolling. The voice reads one paragraph after another until the end.";
const para = (n: number) => `Paragraph ${n} of the essay. It has a few sentences so the page needs`;
/** the long essay: paragraphs n0.. with their first line at cy */
const ESSAY = (title: string, first: number[], x = 417): Line[] => {
  const ls: Line[] = [{ k: "title", t: title, cy: 154 }, { k: "meta", t: "350 words", cy: 194 }];
  first.forEach((cy, i) => { ls.push({ k: "p", t: para(i + 1), cy }, { k: "p", t: P2, cy: cy + 32 }); });
  return ls;
};
const SLOW = ESSAY("Slow reading", [246.5, 330.5, 414.5, 497.5, 581.5, 664.5]);
const rr = (b: B, p: Ref, x: number, y: number, w: number, h: number, o: Record<string, any> = {}) => b.frame(p, { x, y, w, h, ...o });
const closeX = (b: B, p: Ref, cx: number, cy: number) => ic(b, p, "x", 14, cx, cy, INK);
/** the 280 px side panel (outline, voice) inside the panel, left hairline at x 990 */
const sidePanel = (b: B, c: Ref, title: string) => {
  const sp = b.frame(c, { name: title + " panel", x: 990, y: 89, w: 280, h: 599, fill: "#FFFFFF", clip: true });
  b.rect(sp, { x: 0, y: 0, w: 1, h: 599, fill: "#EBEBEB" });
  tx(b, sp, title, 12, 25, { size: 14, weight: "SemiBold", lh: 18 }); closeX(b, sp, 254, 25);
  return sp;
};
const slider = (b: B, t: T, p: Ref, x: number, cy: number, w: number, knobX: number) => {
  rr(b, p, x, cy - 2.5, w, 5, { r: 3, fill: "#F0F0F0" }); rr(b, p, x, cy - 2.5, knobX - x, 5, { r: 3, fill: t.accent });
  b.ellipse(p, { x: knobX - 8, y: cy - 8, w: 16, h: 16, fill: "#FFFFFF", stroke: "#C3C6CC", sw: 1.5, sa: "inside" });
};
const LFBAR: Bar = { title: "Why local-first matters", cur: "0:00", end: "0:30", playing: false };
const F3S = ["Kokoro ready", "Voice: Heart", "1 reading"];

const popCard = (b: B, c: Ref, x: number, y: number, w: number, h: number) => b.frame(c, { x, y, w, h, r: 12, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "lg", clip: true });
const VOICES = ["Heart", "Bella", "Nicole", "Aoede", "Kore", "Sarah", "Alloy", "Nova", "Sky", "Jessica", "River"];
const voiceRow = (b: B, p: Ref, name: string, x: number, cy: number, w: number, sel: boolean, rh: number) => {
  if (sel) rr(b, p, x, cy - rh / 2, w, rh, { r: 4, fill: "#F0F0F0" });
  const nm = b.text(p, name, { x: x + 8, y: cy - 9, size: 14, c: INK, lh: 18 });
  const sub = b.text(p, "US · female", { x: x + 8 + name.length * 8.2 + 8, y: cy - 8, size: 12, c: INK3, lh: 16 }); void nm; void sub;
  if (sel) ic(b, p, "check", 16, x + w - 14, cy, INK);
};
const warnBanner = (b: B, t: T, c: Ref) => banner(b, t, c, { tone: "warn", x: 421, y: 230, w: 680, title: "This PDF has no text layer", text: "The 2 pages are pictures of text. Reading aloud needs text recognition (OCR), which\nruns on this computer.", action: "Recognize text", primary: true });
const SCAN: Line[] = [{ k: "title", t: "Scan", cy: 154, x: 421 }, { k: "meta", t: "0 words · 2 pages", cy: 195, x: 421 }];
const SCANBAR: Bar = { title: "Scan", cur: "0:00", end: "0:00", playing: false, dim: true };
const SRC_PASTE = "Pasted text · Pasted text", SRC_SCAN = "File · Scan.pdf";

export const VLIB_F2: S[] = [
  mk("F3", "Reader · preparing next paragraph", "A pill at the top says Preparing next paragraph while the voice renders the next block.", (b, t, c) => {
    reader(b, t, c, { source: SRC_PASTE, lines: SLOW, footer: F3S, thumb: [93, 338], bar: { title: "Slow reading", cur: "0:09", end: "2:05", frac: 0.065, playing: true }, marks: [{ x0: 416, x1: 645, y0: 318, y1: 341, c: MK_SENT }],
      extra: () => { const p = b.row(c, { x: 657, y: 101, w: 208, h: 29, pad: [0, 14], gap: 8, r: 999, fill: "#FFFFFF", shadow: "lg" }); b.icon(p, "loader", 14, INK2); b.text(p, "Preparing next paragraph", { size: 13, c: INK, lh: 18 }); } });
  }, 798),
  mk("F4", "Reader · finished", "Finished card over the dimmed text: Back to library, Read again.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines: SHORT(), footer: F3S, thumb: false, bar: { title: "Short", cur: "0:02", end: "0:02", frac: 1, playing: false, speed: "3x" } });
    b.rect(c, { x: 252, y: 89, w: 1018, h: 599, fill: t.overlay });
    const d = b.col(c, { name: "Finished card", x: 607, y: 296, w: 308, h: 184, pad: [28, 32], gap: 8, r: 10, fill: "#FFFFFF", shadow: "lg", align: "center" });
    b.icon(d, "circleCheck", 24, GREEN); b.text(d, "Finished", { size: 18, weight: "SemiBold", c: INK, lh: 24 }); b.text(d, "\"Short\" is marked as finished.", { size: 12, c: INK2, lh: 16 });
    const r = b.row(d, { gap: 8, pad: [8, 0, 0, 0] }); pbtn(b, t, r, "Back to library"); pbtn(b, t, r, "Read again", { v: "primary", icon: "refresh" });
  }, 798),
  mk("F5", "Reader · read from here", "Selecting text offers Read from here, Bookmark and Copy.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines: SHORT(), footer: F3S, thumb: false, bar: { title: "Short", cur: "0:00", end: "0:06", playing: false },
      extra: () => { const ch = b.row(c, { x: 367, y: 193, w: 348, h: 41, pad: [0, 6], gap: 6, r: 12, fill: "#FFFFFF", shadow: "lg" }); pbtn(b, t, ch, "Read from here", { v: "primary", icon: "play", sz: "sm" }); pbtn(b, t, ch, "Bookmark", { icon: "bookmark", sz: "sm" }); pbtn(b, t, ch, "Copy", { icon: "copy", sz: "sm" }); } });
  }, 798),
  mk("F6", "Reader · outline and bookmarks", "The outline lists the headings of the text; bookmarks sit below it.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: "File · local-first.md", lines: LF.map((l) => ({ ...l, x: 276 })), footer: ["Kokoro ready", "Voice: Heart", "3 readings"], thumb: false, bar: LFBAR,
      extra: () => {
        b.rect(c, { x: 985, y: 93, w: 4, h: 516, r: 2, fill: "#D1D1D1" });
        const sp = sidePanel(b, c, "Outline");
        rr(b, sp, 12, 48, 255, 28, { r: 6, fill: "#F0F0F0" });
        [["Why local-first matters", 61], ["How speech models got small", 89.5], ["What comes next", 117]].forEach(([s, cy]) => tx(b, sp, s as string, 20, cy as number, { size: 13, c: INK, lh: 18 }));
        tx(b, sp, "Bookmarks", 12, 139, { size: 14, weight: "SemiBold", lh: 18 }); tx(b, sp, "A few years ago a natural voice ...", 20, 169.5, { size: 13, c: INK, lh: 18 }); closeX(b, sp, 254, 169.5);
      } });
  }, 798),
  mk("F7", "Reader · display settings", "Display popover: font, text size, line spacing, text width and scroll along with the voice (serif shown).", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines: SHORT(421, true), serif: true, footer: F3S, thumb: false, bar: { title: "Short", cur: "0:00", end: "0:06", playing: false },
      extra: () => {
        const p = popCard(b, c, 759, 87, 318, 310);
        tx(b, p, "Display", 12, 22, { size: 14, weight: "SemiBold", lh: 18 }); tx(b, p, "Font", 12, 52, { size: 14, c: INK2, lh: 18 });
        const sg = rr(b, p, 12, 68, 120, 36, { r: 10, fill: "#F0F0F0" }); tx(b, sg, "Sans", 16, 18, { size: 14, c: INK3, lh: 18 });
        const sel = rr(b, sg, 66, 3, 51, 30, { r: 8, fill: "#FFFFFF", shadow: "ctl" }); tx(b, sel, "Serif", 25.5, 15, { w: 51, ta: "center", size: 14, c: INK, lh: 18 });
        [["Text size", "19px", 126, 150, 77.5], ["Line spacing", "1.7", 180, 204, 102], ["Text width", "680px", 234, 258, 97]].forEach(([l, v, ly, sy, kx]) => {
          tx(b, p, l as string, 12, ly as number, { size: 14, c: INK2, lh: 18 }); tx(b, p, v as string, 306, ly as number, { w: 100, ta: "right", size: 14, weight: "SemiBold", lh: 18 });
          slider(b, t, p, 12, sy as number, 200, kx as number);
        });
        tx(b, p, "Scroll along with the voice", 12, 288, { size: 14, c: INK2, lh: 18 });
        const tg = rr(b, p, 274, 278, 32, 20, { r: 999, fill: t.cta }); b.ellipse(tg, { x: 14, y: 2, w: 16, h: 16, fill: "#FFFFFF" });
      } });
  }, 798),
  mk("F8", "Reader · sleep timer", "The sleep timer button shows the time left (14:59) and a soft fill while a timer runs.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines: SHORT(), footer: F3S, thumb: false, bar: { title: "Short", cur: "0:00", end: "0:06", playing: false, sleep: "14:59" } });
  }, 798),
  mk("F9", "Reader · voice popover", "Voice list from the speaker button in the player bar: the current voice is checked.", (b, t, c) => {
    reader(b, t, c, { source: "File · local-first.md", lines: LF, footer: ["Kokoro ready", "Voice: Heart", "3 readings"], bar: LFBAR,
      extra: () => {
        const p = popCard(b, c, 923, 331, 278, 374); tx(b, p, "Voice", 12, 21, { size: 14, weight: "SemiBold", lh: 18 });
        const lst = rr(b, p, 0, 40, 278, 318, { clip: true }); VOICES.forEach((v, i) => voiceRow(b, lst, v, 12, 19 + i * 34, 245, i === 0, 34));
        rr(b, p, 260, 46, 4, 100, { r: 2, fill: "#D1D1D1" });
      } });
  }),
  mk("F10", "PDF reader · playing", "A PDF with a text layer reads like any text: the heading carries the sentence band and the word marker.", (b, t, c) => {
    const L: Line[] = [{ k: "title", t: "Report", cy: 154, x: 421 }, { k: "meta", t: "54 words · 3 pages", cy: 196, x: 421 }, { k: "h", t: "Local First Software", cy: 250, x: 421 },
      { k: "p", t: "For a decade the default answer to every software question was the cloud.", cy: 312.5, x: 421 }, { k: "p", t: "Notes and documents lived on someone else's server.", cy: 344, x: 421 },
      { k: "p", t: "The appeal is simple. When the work happens on your own machine it", cy: 396.5, x: 421 }, { k: "p", t: "keeps working on a plane.", cy: 428.5, x: 421 },
      { k: "p", t: "Second page paragraph one stays on its own page.", cy: 480, x: 421 }, { k: "p", t: "Third page text.", cy: 531, x: 421 }];
    reader(b, t, c, { source: "File · Report.pdf", lines: L, footer: F3S, thumb: false, bar: { title: "Report", cur: "0:01", end: "0:19", frac: 0.02, playing: true }, marks: [{ x0: 421, x1: 570, y0: 231, y1: 265, c: MK_SENT }, { x0: 571, x1: 694, y0: 231, y1: 265, c: MK_WORD }] });
  }),
  mk("F11", "PDF reader · scanned page", "A PDF without a text layer says so and offers Recognize text; the player stays disabled.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_SCAN, lines: SCAN, footer: F3S, thumb: false, bar: SCANBAR, extra: () => warnBanner(b, t, c) });
  }, 798),
  mk("F12", "PDF reader · recognize text consent", "Before OCR runs, the dialog says what is downloaded once and that pages never leave the computer.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_SCAN, lines: SCAN, footer: F3S, thumb: false, bar: SCANBAR, extra: () => warnBanner(b, t, c) }); dim(b, t, c, 798);
    const { d, body } = dialog(b, t, c, { w: 460, h: 202, title: "Recognize text on this computer?", H: 798 });
    b.text(body, "Speak Kit will download English language data for text recognition once, from cdn.jsdelivr.net (a few megabytes), and keep it in this app. The pages themselves never leave this computer. Long documents take a while; you can cancel at any time.", { size: 14, c: INK3, lh: 19.5, w: "fill" });
    const ft = dfoot(b, d); pbtn(b, t, ft, "Not now"); pbtn(b, t, ft, "Recognize text", { v: "primary" });
  }, 798),
  mk("F13", "PDF reader · recognizing text", "OCR progress card: step name, a progress bar and Cancel.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_SCAN, lines: SCAN, footer: F3S, thumb: false, bar: SCANBAR, extra: () => {
      const k = b.frame(c, { x: 421, y: 230, w: 680, h: 131, r: 12, fill: "#FFFFFF", shadow: "ring" });
      tx(b, k, "Recognizing text", 16, 27, { size: 13, weight: "SemiBold", lh: 16, ff: "Segoe UI" }); tx(b, k, "Getting ready", 16, 57, { size: 12, c: INK2, lh: 16, ff: "Segoe UI" });
      rr(b, k, 16, 74, 648, 4, { r: 2, fill: "#F0F0F0" }); rr(b, k, 247, 74, 9, 4, { r: 2, fill: t.accent });
      const cb = rr(b, k, 16, 88, 648, 27, { r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" }); tx(b, cb, "Cancel", 324, 13.5, { w: 648, ta: "center", size: 13, lh: 18, ff: "Segoe UI" });
    } });
  }, 798),
  mk("F17", "PDF reader · recognition failed", "When OCR finds no text the banner says so and offers Try again.", (b, t, c) => {
    reader(b, t, c, { h: 798, source: SRC_SCAN, lines: SCAN, footer: F3S, thumb: false, bar: SCANBAR, extra: () => banner(b, t, c, { tone: "err", x: 421, y: 230, w: 680, title: "Text recognition stopped", text: "No text was recognized on these pages.", action: "Try again", primary: true }) });
  }, 798),
  mk("F14", "Reader · voice panel", "Speed slider with presets and the voice list in the side panel.", (b, t, c) => {
    reader(b, t, c, { source: "File · local-first.md", lines: LF.map((l) => ({ ...l, x: 276 })), footer: ["Kokoro ready", "Voice: Heart", "3 readings"], thumb: false, bar: LFBAR, extra: () => {
      b.rect(c, { x: 985, y: 93, w: 4, h: 516, r: 2, fill: "#D1D1D1" });
      const sp = sidePanel(b, c, "Voice");
      tx(b, sp, "Speed", 12, 56, { size: 14, c: INK2, lh: 18 }); tx(b, sp, "1.0x", 266, 56, { w: 80, ta: "right", size: 14, weight: "SemiBold", lh: 18 });
      slider(b, t, sp, 12, 83, 200, 55.5);
      [["0.8x", 12, 45, 115, false], ["1x", 65.5, 32, 115, true], ["1.2x", 108, 43, 115, false], ["1.5x", 158.5, 44, 115, false], ["2x", 209, 35, 115, false], ["3x", 12, 35, 144, false]].forEach(([l, x, w, cy, on]) => {
        const ch = rr(b, sp, x as number, (cy as number) - 11, w as number, 22, { r: 999, fill: on ? "#F0F0F0" : "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside" }); tx(b, ch, l as string, (w as number) / 2, 11, { w: w as number, ta: "center", size: 13, c: on ? INK : INK2, lh: 16, weight: on ? "Medium" : "Regular" });
      });
      VOICES.forEach((v, i) => voiceRow(b, sp, v, 12, 182.5 + i * 30, 241, i === 0, 28));
      rr(b, sp, 261, 172, 4, 114, { r: 2, fill: "#D1D1D1" });
    } });
  }, 798),
  mk("F15", "Reader · back to current", "Scrolled away from the voice: a Back to current pill returns to the sentence being read.", (b, t, c) => {
    const lines: Line[] = [{ k: "p", t: P2, cy: 96 }];
    [148.5, 232.5, 315.5, 399.5, 482.5, 566.5, 650.5].forEach((cy, i) => { lines.push({ k: "p", t: para(i + 7), cy }, { k: "p", t: P2, cy: cy + 32 }); });
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines, footer: F3S, thumb: [347, 592], bar: { title: "Long essay", cur: "0:01", end: "2:05", frac: 0.01, playing: true }, extra: () => {
      const p = b.row(c, { x: 693, y: 643, w: 136, h: 28, pad: [0, 12], gap: 6, r: 8, fill: t.cta, shadow: "cta" }); b.icon(p, "down", 14, "#FAFAFA"); b.text(p, "Back to current", { size: 13, weight: "Medium", c: "#FAFAFA", lh: 18 }); } });
  }, 798),
  mk("F16", "Reader · find in text", "Find bar under the title: matches in blue, the current one in orange, with a count and previous / next.", (b, t, c) => {
    const lines: Line[] = [{ k: "title", t: "Long essay", cy: 196 }, { k: "meta", t: "350 words", cy: 235.5 }];
    [287.5, 371.5, 455.5, 538.5, 622.5].forEach((cy, i) => lines.push({ k: "p", t: para(i + 1), cy }, { k: "p", t: P2, cy: cy + 32 }));
    const marks: Mark[] = [{ x0: 416, x1: 508, y0: 275, y1: 298, c: MK_CUR }];
    [307, 391, 475, 558, 642].forEach((y) => marks.push({ x0: 691, x1: 783, y0: y, y1: y + 23, c: MK_FIND })); [359, 443, 526, 610].forEach((y) => marks.push({ x0: 416, x1: 508, y0: y, y1: y + 23, c: MK_FIND }));
    reader(b, t, c, { h: 798, source: SRC_PASTE, lines, marks, footer: F3S, thumb: [134, 345], find: true, bar: { title: "Long essay", cur: "0:00", end: "2:20", playing: false }, extra: () => {
      const fb = b.frame(c, { x: 252, y: 89, w: 1018, h: 42, fill: "#FFFFFF" }); rr(b, fb, 0, 41, 1018, 1, { fill: "#EBEBEB" });
      const f = rr(b, fb, 16, 7, 280, 28, { r: 8, fill: "#FFFFFF", stroke: "#171717", sw: 2, sa: "inside" }); ic(b, f, "search", 14, 17, 14, INK3); rr(b, f, 27, 3, 250, 22, { stroke: "#4B9BF5", sw: 1.5, sa: "inside", r: 2 }); tx(b, f, "paragraph", 29, 14, { size: 13, c: INK, lh: 16 });
      tx(b, fb, "1 of 28", 304, 21, { size: 12, c: INK3, lh: 16 }); ic(b, fb, "up", 14, 364, 21, INK); ic(b, fb, "down", 14, 400, 21, INK); ic(b, fb, "x", 14, 436, 21, INK);
    } });
  }, 798),
];

// ======================================================================= Export (J*) and the bell
const MONO = "Consolas";
const homeCard = (b: B, m: Ref, x: number, w: number, cap: string, big: string, sub: (p: Ref) => void) => {
  const c = rr(b, m, x, 84.5, w, 89.5, { r: 12, fill: "#FFFFFF", shadow: "ring" });
  tx(b, c, cap, 15.5, 23, { size: 12, weight: "Medium", c: INK3, lh: 16 });
  b.ellipse(c, { x: 16, y: 41, w: 8, h: 8, fill: "#05C283" }); tx(b, c, big, 32, 45, { size: 16, weight: "SemiBold", lh: 20 });
  sub(c);
};
/** Home page body (panel coordinates) */
export const homePage = (b: B, t: T, m: Ref, port: string, tail: string) => {
  tx(b, m, "Home", 157, 35.5, { size: 22, weight: "SemiBold", lh: 28 });
  tx(b, m, "Speak Kit runs a private voice server on this computer. Your browser extension talks to it.", 157, 60, { size: 13, c: INK2, lh: 18 });
  homeCard(b, m, 157, 347, "Server", "Running", (c) => { tx(b, c, "Listening on", 15.5, 66, { size: 13, c: INK2, lh: 18 }); tx(b, c, port, 96, 66, { size: 13, c: INK, lh: 18, ff: MONO }); });
  homeCard(b, m, 514, 350, "Voice engine", "Ready", (c) => tx(b, c, "Kokoro-82M, runs on the CPU", 15.5, 66, { size: 13, c: INK2, lh: 18 }));
  tx(b, m, "Pairing token", 157, 198.5, { size: 16, weight: "SemiBold", lh: 20 });
  tx(b, m, "Paste this token in the extension under Options > General > Pairing token.", 157, 216, { size: 12, c: INK3, lh: 16 });
  const tk = rr(b, m, 157, 234, 707, 64, { r: 12, fill: "#FFFFFF", shadow: "ring" });
  const fl = rr(b, tk, 16, 14, 350, 36, { r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" }); tx(b, fl, "\u2022".repeat(15) + tail, 14, 18, { size: 13, c: INK, lh: 18, ff: MONO });
  pbtn(b, t, tk, "Reveal", { icon: "eye", x: 375, y: 14, w: 90 }); pbtn(b, t, tk, "Copy", { v: "primary", icon: "copy", x: 474, y: 14, w: 84 }); pbtn(b, t, tk, "Regenerate", { icon: "refresh", x: 565, y: 14, w: 126 });
  tx(b, m, "Install the extension", 157, 323.7, { size: 16, weight: "SemiBold", lh: 20 });
  tx(b, m, "Add Speak Kit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.", 157, 341, { size: 12, c: INK3, lh: 16 });
  const ls = rr(b, m, 157, 359, 707, 116, { r: 12, fill: "#FFFFFF", shadow: "ring", clip: true });
  tx(b, ls, "Speak Kit for Chrome", 16, 19.5, { size: 14, weight: "Medium", lh: 18 }); tx(b, ls, "Not connected yet", 16, 37, { size: 13, c: INK2, lh: 16 });
  pbtn(b, t, ls, "Pair", { sz: "sm", x: 486, y: 15, w: 48 }); pbtn(b, t, ls, "Open Web Store", { sz: "sm", icon: "external", x: 545, y: 15, w: 146 });
  rr(b, ls, 0, 58, 707, 1, { fill: "#EBEBEB" });
  tx(b, ls, "Engines", 16, 78, { size: 14, weight: "Medium", lh: 18 }); tx(b, ls, "Kokoro-82M is installed. Chatterbox comes later.", 16, 95, { size: 13, c: INK2, lh: 16 });
  pbtn(b, t, ls, "Manage", { sz: "sm", x: 617, y: 72, w: 74 });
};
const home = (b: B, t: T, c: Ref, port: string, tail: string, o: { pill?: boolean; h?: number; dot?: boolean } = {}) => {
  const { main } = appShell(b, t, c, { h: o.h ?? 799, nav: "Home", dot: o.dot ?? true, footer: ["Kokoro ready", "Voice: Heart", "0 readings"] });
  homePage(b, t, main, port, tail);
  if (o.pill) { const p = rr(b, c, 8, 621, 236, 41, { r: 10, fill: "#FFFFFF", stroke: "#171717", sw: 2, sa: "inside" }); tx(b, p, "My note.wav", 12, 18, { size: 13, c: INK, lh: 18 }); rr(b, p, 12, 29, 212, 3, { r: 2, fill: "#F0F0F0" }); }
};
const xdlg = (b: B, c: Ref, y: number, h: number, title: string) => {
  const d = b.frame(c, { name: "Dialog", x: 359, y, w: 560, h, r: 10, fill: "#FFFFFF", shadow: "dlg" });
  tx(b, d, title, 16, 25.5, { size: 15, weight: "SemiBold", lh: 20 }); ic(b, d, "x", 14, 536, 24, INK);
  return d;
};
const pathText = (b: B, d: Ref, s: string, x: number, cy: number) => tx(b, d, s, x, cy, { size: 12, c: INK, lh: 16, ff: MONO });

export const VLIB_J: S[] = [
  mk("J1", "Export audio · options", "Format (MP3 with bitrate, or WAV), voice, file name and folder; the size is an estimate.", (b, t, c) => {
    reader(b, t, c, { source: "File · local-first.md", lines: LF, footer: ["Kokoro ready", "Voice: Heart", "3 readings"], bar: LFBAR }); dim(b, t, c);
    const d = xdlg(b, c, 173, 453, "Export audio");
    const lab = (s: string, cy: number) => tx(b, d, s, 16, cy, { size: 14, c: INK2, lh: 18 });
    lab("Text", 109); const ta = rr(b, d, 116, 50, 428, 119, { r: 8, fill: "#FFFFFF", stroke: "#E5E5E5", sw: 1, sa: "inside", shadow: "ctl" });
    ["Why local-first matters", "", "Local-first software keeps your data on your own", "computer. It works without a network, and it keeps working", "when a service shuts down."].forEach((s, i) => { if (s) tx(b, ta, s, 12, 19 + i * 20, { size: 14, c: INK, lh: 20 }); });
    rr(b, ta, 417, 5, 4, 33, { r: 2, fill: "#D1D1D1" });
    lab("Format", 199); const sg = rr(b, d, 116, 182, 118, 36, { r: 10, fill: "#F0F0F0" }); const sl = rr(b, sg, 2, 3, 54, 30, { r: 8, fill: "#FFFFFF", shadow: "ctl" }); tx(b, sl, "MP3", 27, 15, { w: 54, ta: "center", size: 14, weight: "Medium", lh: 18 }); tx(b, sg, "WAV", 88, 18, { w: 56, ta: "center", size: 14, c: INK3, lh: 18 });
    select(b, rr(b, d, 242, 186, 160, 28), "192 kbps", 160);
    lab("Voice", 243); select(b, rr(b, d, 116, 229, 428, 28), "Heart", 428);
    lab("File name", 283); field(b, rr(b, d, 116, 269, 428, 28), { value: "Why local-first matters", h: 28, w: 428 });
    lab("Folder", 323); pathText(b, d, "C:\\Users\\noure\\Music\\Speak Kit", 116, 323); pbtn(b, t, d, "Browse", { sz: "sm", icon: "folder", x: 453, y: 309, w: 91 });
    tx(b, d, "About 685 KB at 1.00x. The real size is known when it is done.", 16, 358, { size: 13, c: INK3, lh: 18 });
    pbtn(b, t, d, "Cancel", { x: 16, y: 402, w: 72 }); pbtn(b, t, d, "Export", { v: "primary", icon: "download", x: 452, y: 402, w: 92 });
  }),
  mk("J2", "Export audio · rendering", "While rendering: the sentence count, a note that closing is safe, Cancel export and Run in background.", (b, t, c) => {
    home(b, t, c, "127.0.0.1:48157", "9c1d", { pill: true }); dim(b, t, c);
    const d = xdlg(b, c, 295, 206, "Exporting audio");
    tx(b, d, "Rendering sentence 1 of 3", 16, 59, { size: 14, c: INK2, lh: 18 }); rr(b, d, 16, 81, 240, 4, { r: 2, fill: "#F0F0F0" });
    tx(b, d, "You can close this window; the export keeps running and you get a notification", 16, 95, { size: 14, c: INK3, lh: 20 }); tx(b, d, "when it is done.", 16, 115, { size: 14, c: INK3, lh: 20 });
    pbtn(b, t, d, "Cancel export", { v: "danger", x: 16, y: 158, w: 113 }); pbtn(b, t, d, "Run in background", { v: "primary", x: 400, y: 158, w: 144 });
  }),
  mk("J3", "Export audio · done", "Finished: file name, size and duration, the full path with Copy, Show in folder, Close, Open file.", (b, t, c) => {
    home(b, t, c, "127.0.0.1:48158", "98ad"); dim(b, t, c);
    const d = xdlg(b, c, 308.5, 182, "Export finished");
    tx(b, d, "My note.wav · 237 KB · 5 s", 16, 59, { size: 14, c: INK2, lh: 18 });
    pathText(b, d, "C:\\Users\\noure\\AppData\\Local\\Temp\\sk-visual-export-0lfsBc\\My \u2026", 16, 96); pbtn(b, t, d, "Copy", { sz: "sm", icon: "copy", x: 466, y: 82, w: 78 });
    pbtn(b, t, d, "Show in folder", { icon: "folder", x: 16, y: 129.5, w: 138 }); pbtn(b, t, d, "Close", { x: 365, y: 129.5, w: 63 }); pbtn(b, t, d, "Open file", { v: "primary", icon: "play", x: 437, y: 129.5, w: 107 });
  }),
  mk("J5", "Export audio · file exists", "The target name is taken: Choose another name, Keep both or Replace.", (b, t, c) => {
    home(b, t, c, "127.0.0.1:48153", "97f7", { h: 798 }); dim(b, t, c, 798);
    const d = xdlg(b, c, 322.5, 153, "Export audio");
    tx(b, d, "A file named", 16, 59, { size: 14, c: INK3, lh: 18 }); tx(b, d, "My note.wav", 99, 59, { size: 14, weight: "SemiBold", c: INK2, lh: 18 }); tx(b, d, "already exists in this folder.", 183, 59, { size: 14, c: INK3, lh: 18 });
    pbtn(b, t, d, "Choose another name", { x: 16, y: 101.5, w: 164 }); pbtn(b, t, d, "Keep both", { x: 365.5, y: 101.5, w: 91 }); pbtn(b, t, d, "Replace", { v: "danger", x: 466, y: 101.5, w: 78 });
  }, 798),
  mk("J6", "Export audio · running in the background", "The export keeps going from the sidebar: a pill with the file name and a thin progress line above the engine card.", (b, t, c) => {
    home(b, t, c, "127.0.0.1:48159", "2f5b", { pill: true });
  }),
  mk("J7", "Notifications · with entries", "The bell opens the activity list: title, message and time for each export.", (b, t, c) => {
    home(b, t, c, "127.0.0.1:48154", "51c1", { dot: false, h: 798 });
    const p = popCard(b, c, 801, 38, 340, 191); tx(b, p, "Notifications", 13, 22.5, { size: 14, weight: "SemiBold", lh: 18 });
    tx(b, p, "Export finished", 13, 60.5, { size: 14, weight: "SemiBold", lh: 18 }); tx(b, p, "My note.wav is saved. Click to show it in its folder.", 13, 81, { size: 13, c: INK3, lh: 18 }); tx(b, p, "4:37:42 PM", 13, 102.5, { size: 13, c: INK3, lh: 18 });
    rr(b, p, 13, 121, 314, 1, { fill: "#EBEBEB" }); tx(b, p, "Export finished", 13, 140, { size: 14, weight: "SemiBold", lh: 18 }); tx(b, p, "My note.wav is saved. 4:37:42 PM", 13, 160.5, { size: 13, c: INK3, lh: 18 });
  }, 798),
];
