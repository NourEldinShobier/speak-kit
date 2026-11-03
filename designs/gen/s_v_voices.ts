// d-voices: Voices, Engines and engine states (G*, O*) as accurate copies of the built desktop app, inside the real Windows window (kit3 winApp).
// Built from the React code: TitleBar.tsx, Sidebar.tsx, Footer.tsx, shell.css, pages.css, features/voices, features/engines, shared/engines.ts, lumen.css.
// Light only. Units: 1 design px = 1 CSS px of designs/built/shots (client 1278 x 799).
import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import { winApp } from "./kit3";

const CW = 1278, CH = 799, SW = 1440, SH = 900;
export const C = { win: "#F0F0F0", text: "#1B2230", t2: "#475467", t3: "#5F6A7D", ph: "#6B7280", icon: "#667085", quiet: "#737373", ctl: "#E5E5E5", div: "#EBEBEB", field: "#C3C6CC", cta: "#201E25", ok: "#17693D", well: "#F5F5F5", dis: "#9AA0AB" };

// ---------------------------------------------------------------- small parts
export type PT = "green" | "blue" | "orange" | "red" | "neutral";
const PILL: Record<PT, [string, string, string?]> = { green: ["#D5F3E0", "#17693D"], blue: ["#DAEFFE", "#0B5CAD"], orange: ["#FFEBCF", "#9A5200"], red: ["#FFE4E5", "#A61B1B", "#A61B1B8C"], neutral: ["#F0F0F0", "#475467"] };
/** lm-pill: 20 px, tinted fill, 11.5 px / 500 */
export const pill = (b: B, p: Ref | undefined, label: string, tone: PT, icon?: string) => {
  const [bg, fg, st] = PILL[tone];
  const f = b.row(p, { h: 20, pad: [0, 7], gap: 4, r: 999, fill: bg, stroke: st, sw: 1, sa: "inside" });
  if (icon) b.icon(f, icon, 12, fg);
  b.text(f, label, { size: 12, weight: "Medium", c: fg });
  return f;
};
const kbd = (b: B, p: Ref | undefined, label: string, onCta = false) => {
  const f = b.row(p, { h: 16, pad: [0, 4], r: 4, stroke: onCta ? "#FAFAFA73" : C.ctl, sw: 1, sa: "inside", justify: "center" });
  b.text(f, label, { size: 10, c: onCta ? "#FAFAFA" : C.t3 });
  return f;
};
export const slot = (b: B, p: Ref, x: number, y: number, w: number, h: number, name?: string) => b.frame(p, { name, x, y, w, h, layout: "horizontal", align: "center", justify: "center" });

// ---------------------------------------------------------------- engine state of the shell
export type EngState = "ready" | "error" | "unloaded" | "loading";
const ENG: Record<EngState, { pill: { label: string; tone: PT; icon?: string }; card: { label: string; hint?: string }; foot: string }> = {
  ready: { pill: { label: "Ready", tone: "green" }, card: { label: "Ready" }, foot: "Kokoro ready" },
  error: { pill: { label: "Error", tone: "red" }, card: { label: "Error" }, foot: "Voice engine error" },
  unloaded: { pill: { label: "Unloaded · Wakes on play", tone: "neutral", icon: "moon" }, card: { label: "Unloaded", hint: "Wakes on play" }, foot: "Voice engine asleep" },
  loading: { pill: { label: "Loading", tone: "blue", icon: "loader" }, card: { label: "Loading" }, foot: "Loading the voice engine" },
};

/** The app shell the way TitleBar / Sidebar / Footer draw it. Draws into the 1278 x 799 client `c` and returns the white content panel (252,36 1018 x 735). */
export const shell = (b: B, t: T, c: Ref, o: { nav: "home" | "library" | "voices" | "engines" | "browser" | "settings"; eng?: EngState; docs?: string }) => {
  const eng = ENG[o.eng ?? "ready"];
  b.rect(c, { name: "Window background", x: 0, y: 0, w: CW, h: CH, fill: C.win });
  // title bar (36)
  const tb = b.frame(c, { name: "Title bar", x: 0, y: 0, w: CW, h: 36 });
  [["sidebar", 8, C.text], ["left", 41, C.text], ["right", 73, C.dis]].forEach(([ic, x, col]) => { const s = slot(b, tb, x as number, 4, 28, 28); b.icon(s, ic as string, 16, col as string); });
  const se = b.row(tb, { name: "Search", x: 434, y: 4, w: 420, h: 28, pad: [0, 8, 0, 10], gap: 8, r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" });
  b.icon(se, "search", 16, C.t3);
  b.text(se, "Search readings, voices and commands", { size: 13, c: C.t3, w: "fill" });
  kbd(b, se, "Ctrl K");
  const pr = b.row(tb, { name: "Engine pill", x: 860, y: 8, w: 245, h: 20, justify: "max" });
  pill(b, pr, eng.pill.label, eng.pill.tone, eng.pill.icon);
  b.icon(slot(b, tb, 1113, 4, 28, 28), "bell", 16, C.text);
  // sidebar 248
  const sb = b.col(c, { name: "Sidebar", x: 8, y: 38, w: 236, h: 731, gap: 2 });
  const nw = b.row(sb, { w: "fill", h: 36, pad: [0, 14], gap: 8, r: 8, fill: C.cta, shadow: "cta" });
  b.icon(nw, "plus", 16, "#FAFAFA"); b.text(nw, "New reading", { size: 13, weight: "Medium", c: "#FAFAFA", w: "fill" }); kbd(b, nw, "Ctrl N", true);
  b.frame(sb, { w: "fill", h: 8 });
  const nav: [string, string, string][] = [["home", "Home", "home"], ["library", "Library", "book"], ["voices", "Voices", "mic"], ["engines", "Engines", "cpu"], ["browser", "Browser", "globe"]];
  nav.forEach(([k, l, ic]) => {
    const sel = o.nav === k;
    const it = b.row(sb, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 8, fill: sel ? "#F0F0F0" : "none" });
    b.icon(it, ic, 18, C.icon); b.text(it, l, { size: 13, weight: sel ? "Medium" : "Regular", c: sel ? C.text : C.t2, w: "fill" });
  });
  const sec = b.row(sb, { w: "fill", pad: [16, 10, 6, 10] }); b.text(sec, "Recent", { size: 11, weight: "SemiBold", c: C.t3 });
  const em = b.row(sb, { w: "fill", pad: [4, 10] }); b.text(em, "Readings you start appear here.", { size: 12, c: C.t3 });
  b.frame(sb, { w: "fill", h: "fill" });
  const ec = b.frame(sb, { w: "fill", pad: [0, 0, 4, 0], layout: "vertical" });
  const card = b.col(ec, { w: "fill", pad: [10, 12], gap: 1, r: 10, fill: "#FFFFFF", shadow: "card" });
  b.text(card, `Kokoro-82M · ${eng.card.label}`, { size: 13, weight: "Medium", c: C.text });
  if (eng.card.hint) b.text(card, eng.card.hint, { size: 12, c: C.t3 });
  const ok = b.row(card, { gap: 6 }); b.icon(ok, "lock", 12, C.ok); b.text(ok, "100% on this device", { size: 12, c: C.ok });
  const st = b.row(sb, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 8 }); b.icon(st, "settings", 18, C.icon); b.text(st, "Settings", { size: 13, c: C.t2, w: "fill" });
  // panel 1018 x 735 (radius-panel 14, shadow-card)
  const panel = b.frame(c, { name: "Content panel", x: 252, y: 36, w: 1018, h: 735, fill: "#FFFFFF", r: 14, shadow: "card", clip: true });
  // footer band 28
  const ft = b.row(c, { name: "Footer", x: 0, y: 771, w: CW, h: 28, pad: [0, 14], gap: 10, justify: "max" });
  [eng.foot, "Voice: Heart", o.docs ?? "0 readings"].forEach((s, i) => { if (i) b.rect(ft, { w: 1, h: 12, fill: C.field }); b.text(ft, s, { size: 12, c: C.t3 }); });
  return panel;
};

/** sk-page: 760 (or 820 wide) column centred in the panel, padding 22 / 28 / 24, gap 16, head h1 22 + lead 13. */
export const page = (b: B, panel: Ref, o: { title: string; lead?: string; wide?: boolean; scroll?: boolean; action?: (r: Ref) => void }) => {
  const avail = 1018 - (o.scroll ? 10 : 0), box = Math.min(avail, o.wide ? 820 : 760);
  const col = b.col(panel, { clip: false, name: "Page", x: Math.round((avail - box) / 2), y: 0, w: box, pad: [22, 28, 24, 28], gap: 16 });
  const top = o.action ? b.row(col, { w: "fill", justify: "spaceBetween", clip: false }) : col;
  const hd = b.col(top, { w: o.action ? "hug" : "fill", gap: 4 });
  b.text(hd, o.title, { size: 22, weight: "SemiBold", c: C.text, lh: 26 });
  if (o.lead) b.text(hd, o.lead, { size: 13, c: C.t2, lh: 17, w: o.action ? undefined : "fill" });
  if (o.action) o.action(top);
  return col;
};
const scrollbar = (b: B, panel: Ref, y: number, h: number) => b.rect(panel, { name: "Scrollbar thumb", x: 1008, y, w: 4, h, r: 2, fill: "#0000002E" });

// ---------------------------------------------------------------- voices page (VoicesPage.tsx)
export type V = [string, "US" | "UK", "Female" | "Male", "A" | "B" | "C" | "D", string?];
export const VOICES: V[] = [
  ["Heart", "US", "Female", "A", "❤️"], ["Bella", "US", "Female", "A", "🔥"], ["Nicole", "US", "Female", "B", "🎧"], ["Aoede", "US", "Female", "C"], ["Kore", "US", "Female", "C"], ["Sarah", "US", "Female", "C"],
  ["Alloy", "US", "Female", "C"], ["Nova", "US", "Female", "C"], ["Sky", "US", "Female", "C"], ["Jessica", "US", "Female", "D"], ["River", "US", "Female", "D"], ["Fenrir", "US", "Male", "C"],
  ["Michael", "US", "Male", "C"], ["Puck", "US", "Male", "C"], ["Echo", "US", "Male", "D"], ["Eric", "US", "Male", "D"], ["Liam", "US", "Male", "D"], ["Onyx", "US", "Male", "D"],
  ["Santa", "US", "Male", "D"], ["Adam", "US", "Male", "D"], ["Emma", "UK", "Female", "B", "🚺"], ["Isabella", "UK", "Female", "C"], ["Alice", "UK", "Female", "D", "🚺"], ["Lily", "UK", "Female", "D", "🚺"],
  ["George", "UK", "Male", "C"], ["Fable", "UK", "Male", "C", "🚹"], ["Lewis", "UK", "Male", "D"], ["Daniel", "UK", "Male", "D", "🚹"],
];
export const AV = ["#0B5CAD", "#9A5200", "#17693D", "#7A4CD9", "#A61B1B", "#B8860B"];
export const GT: Record<string, PT> = { A: "green", B: "blue", C: "orange", D: "red" };
export const avatar = (b: B, p: Ref | undefined, name: string, size: number, color: string) => {
  const f = b.frame(p, { w: size, h: size, r: 999, fill: color, layout: "horizontal", align: "center", justify: "center" });
  b.text(f, name.slice(0, 1).toUpperCase(), { size: size * 0.42, weight: "SemiBold", c: "#FFFFFF" });
  return f;
};
export const voiceCard = (b: B, t: T, p: Ref, v: V, i: number, h: number, o: { def?: boolean; playing?: boolean } = {}) => {
  const [n, a, g, gr, tr] = v;
  const x = b.col(p, { w: "fill", h, pad: 14, gap: 8, r: 10, fill: "#FFFFFF", shadow: "ring" });
  const hd = b.row(x, { w: "fill", h: o.def ? 36 : 34, gap: 10 });
  avatar(b, hd, n, 32, AV[i % 6]);
  const q = b.col(hd, { gap: 0, w: "fill" });
  const nr = b.row(q, { gap: 6 }); b.text(nr, n, { size: 14, weight: "SemiBold", c: C.text }); if (o.def) pill(b, nr, "Default", "neutral");
  b.text(q, `${a === "US" ? "US English" : "UK English"} · ${g}`, { size: 12, c: C.t2 });
  const tz = b.row(x, { w: "fill", h: 32 });
  if (tr) b.text(tz, tr, { size: 13, c: C.t2, ff: "Segoe UI Emoji" });
  const ft = b.row(x, { w: "fill", justify: "spaceBetween" });
  K.btn(b, t, ft, o.playing ? "Stop" : "Preview", { v: o.playing ? "primary" : "secondary", sz: "sm", icon: o.playing ? "stop" : "play" });
  pill(b, ft, `Grade ${gr}`, GT[gr]);
  return x;
};
export const segmented = (b: B, p: Ref, items: string[], active: number) => {
  const f = b.row(p, { h: 36, pad: 2, gap: 2, r: 8, fill: "#F0F0F0" });
  items.forEach((s, i) => { const on = i === active; const o = b.row(f, { h: 32, pad: [0, 12], r: 6, justify: "center", fill: on ? "#FFFFFF" : "none", stroke: on ? C.ctl : undefined, sw: 1, sa: "inside", shadow: on ? "ctl" : undefined }); b.text(o, s, { size: 14, weight: on ? "Medium" : "Regular", c: on ? "#171717" : C.t3 }); });
  return f;
};
export const voicesTools = (b: B, t: T, col: Ref, active = 0) => {
  const tl = b.row(col, { w: "fill", gap: 12, clip: false });
  K.input(b, t, tl, { placeholder: "Search voices", icon: "search", w: 260, h: 28 });
  segmented(b, tl, ["All", "US English", "UK English", "Female", "Male"], active);
};
export const voicesPage = (b: B, t: T, panel: Ref) => {
  const col = page(b, panel, { title: "Voices", lead: "28 Kokoro voices. Press Preview to hear one.", wide: true, scroll: true });
  voicesTools(b, t, col);
  const g = b.col(col, { w: "fill", gap: 12, clip: false });
  const H = [141, 137, 136, 137];
  for (let r = 0; r < 4; r++) { const row = b.row(g, { w: "fill", gap: 12, align: "start", clip: false }); for (let k = 0; k < 3; k++) { const i = r * 3 + k; voiceCard(b, t, row, VOICES[i], i, H[r], { def: i === 0 }); } }
  scrollbar(b, panel, 2, 324);
};

// ---------------------------------------------------------------- engines page (EnginesPage.tsx, EngineRow.tsx, shared/engines.ts)
export type ER = { name: string; icon: string; active?: boolean; blurb: string; extra?: string; note?: string; progress?: number; pill: { label: string; tone: PT; spin?: boolean }; actions: { label: string; danger?: boolean }[] };
export const BLURB = { kokoro: "Natural English voices, runs on the CPU, about one second to the first word.", chatterbox: "Expressive voices with emotion control and voice cloning. Needs a GPU and about 2.4 GB." };
export const engineRow = (b: B, t: T, p: Ref, e: ER) => {
  const r = b.row(p, { w: "fill", pad: [14, 16], gap: 14, align: "start" });
  const tile = b.frame(r, { w: 32, h: 32, r: 8, fill: C.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, e.icon, 18, C.quiet);
  const body = b.col(r, { w: "fill", gap: 4 });
  const ti = b.row(body, { gap: 0 }); b.text(ti, e.name, { size: 14, weight: "SemiBold", c: C.text, lh: 17 }); if (e.active) b.text(ti, " · In use", { size: 14, c: C.t2, lh: 17 });
  const line = (s: string) => b.text(body, s, { size: 13, c: C.t2, lh: 16, w: "fill" });
  line(e.blurb); if (e.extra) line(e.extra); if (e.note) line(e.note);
  if (e.progress !== undefined) { const tr = b.frame(body, { w: "fill", h: 3, r: 2, fill: "#F0F0F0", clip: true }); b.rect(tr, { x: 0, y: 0, w: Math.round(e.progress * 560), h: 3, r: 2, fill: "#0069CC" }); }
  const ac = b.row(r, { gap: 8 });
  pill(b, ac, e.pill.label, e.pill.tone, e.pill.spin ? "loader" : undefined);
  e.actions.forEach((a) => K.btn(b, t, ac, a.label, { v: a.danger ? "danger" : "secondary", sz: "sm" }));
  return r;
};
export const KOKORO = (o: Partial<ER> = {}): ER => ({ name: "Kokoro", icon: "cpu", active: true, blurb: BLURB.kokoro, pill: { label: "Ready", tone: "green" }, actions: [], ...o });
export const enginesPage = (b: B, t: T, panel: Ref, rows: ER[], extra?: (col: Ref) => void) => {
  const col = page(b, panel, { title: "Engines", lead: "One heavy engine sits in memory at a time, and only while you need it." });
  if (extra) extra(col);
  const card = b.col(col, { w: "fill", r: 10, fill: "#FFFFFF", shadow: "ring", gap: 0 });
  rows.forEach((e, i) => { if (i) b.rect(card, { w: "fill", h: 1, fill: "#F0F0F0" }); engineRow(b, t, card, e); });
  return col;
};

// ---------------------------------------------------------------- frames
export const win = (id: string, title: string, note: string, fn: (b: B, t: T, c: Ref) => void): S => ({
  id, group: "G", title, note, w: SW, h: SH,
  build: (b, t, root) => {
    const a = winApp(b, root, { w: CW, h: CH, backdrop: { w: SW, h: SH } });
    console.log(`[client] ${id} at ${a.x},${a.y} in ${SW}x${SH}`);
    fn(b, t, a.ref);
  },
});

export const GV: S[] = [
  win("G1", "Voices · library", "The Voices page: search field and filter segments, then 28 Kokoro voices as cards with avatar, accent and gender, a trait emoji, Preview and the grade pill. Heart is the default voice.", (b, t, c) => voicesPage(b, t, shell(b, t, c, { nav: "voices" }))),
  win("G8", "Engines · overview", "Kokoro is the engine in use and Ready. One row per engine: tile, name, blurb, state pill and the actions that fit the state.", (b, t, c) => enginesPage(b, t, shell(b, t, c, { nav: "engines" }), [KOKORO()])),
  win("G10", "Engines · error", "A failed engine shows the Error pill, the server's reason under the blurb and a Retry button. The title bar pill and the footer say the same.", (b, t, c) =>
    enginesPage(b, t, shell(b, t, c, { nav: "engines", eng: "error" }), [KOKORO({ note: "huggingface.co, connection reset (ECONNRESET)", pill: { label: "Error", tone: "red" }, actions: [{ label: "Retry" }] })])),
  win("O2", "Engine · Unloaded", "Idle unload: the engine is not in memory (0 MB). Pill Unloaded, Load now button, title bar says Wakes on play and the footer says Voice engine asleep.", (b, t, c) =>
    enginesPage(b, t, shell(b, t, c, { nav: "engines", eng: "unloaded" }), [KOKORO({ note: "Not in memory (0 MB). It loads when you press play.", pill: { label: "Unloaded", tone: "neutral" }, actions: [{ label: "Load now" }] })])),
  win("O3", "Engine · Loading", "The engine is loading into memory: blue Loading pill with a spinner in the row, the title bar and the sidebar card.", (b, t, c) =>
    enginesPage(b, t, shell(b, t, c, { nav: "engines", eng: "loading" }), [KOKORO({ note: "Loading into memory.", pill: { label: "Loading", tone: "blue", spin: true } })])),
];
