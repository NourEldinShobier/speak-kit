// d-options: extension options page (C*) and side panel, drawn in a real Chrome window (kit3.chromeWin) on a Windows desktop.
// The client area (1278x718 viewport) copies designs/built/shots/C*-light.png: same text, sizes, colors, radii, icons.
import { readFileSync } from "fs";
import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import { chromeWin, skLogo } from "./kit3";

const TABLER = `${import.meta.dir}/../../code/node_modules/.pnpm/@tabler+icons@3.50.0/node_modules/@tabler/icons/icons/outline`.replace(/\\/g, "/");
/** Tabler outline icons that tabler.json does not carry (path-only svgs), drawn as editable vectors; 1.5 px stroke on screen like b.icon. */
const ico = (b: B, p: Ref | undefined, name: string, size: number, color: string) => {
  const ds = [...readFileSync(`${TABLER}/${name}.svg`, "utf8").matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]).filter((d) => d !== "M0 0h24v24H0z");
  const k = size / 24; const w = b.frame(p, { w: size, h: size });
  const g = b.frame(w, { x: 0, y: 0, w: 24, h: 24 });
  for (const d of ds) b.add("node.create", { type: "vector", path: d, parent: g, x: 0, y: 0, props: { fill: "none", stroke: color, strokeWeight: 1.5 / k, strokeCap: "round", strokeJoin: "round" } });
  b.add("transform.scale", { ids: [g], factor: k });
  return w;
};
const icon = (b: B, p: Ref | undefined, name: string, size: number, color: string) => (name === "adjustments" || name === "highlight" ? ico(b, p, name, size, color) : b.icon(p, name, size, color));

/** b.text rounds sizes; Lumen rows use 13.5 / 12.5, so the exact size is set after creation. */
const fx = (b: B, p: Ref | undefined, s: string, o: Record<string, any> = {}) => { const r = b.text(p, s, { ...o, size: Math.round(o.size ?? 13) }); if (o.size % 1) b.add("node.set", { ids: [r], fontSize: o.size }); return r; };
const PAPER = { bg: "#F4ECD8", sent: "#E3D09B", text: "#2B2A28" };
const DARKP = { bg: "#1B1B1E", sent: "#433921", word: "#F2C04E", text: "#ECECF0" };
const LINE = "#EBEBEB";

type Sec = "general" | "launcher" | "voice" | "highlight" | "reader" | "shortcuts" | "sites";
const NAV: [Sec, string, string][] = [["general", "General", "adjustments"], ["launcher", "Edge launcher", "sidebarRight"], ["voice", "Voice and speed", "mic"], ["highlight", "Highlighting", "highlight"], ["reader", "Reader view", "book"], ["shortcuts", "Shortcuts", "keyboard"], ["sites", "Sites and filters", "globe"]];

// ---------------------------------------------------------------- small parts
const card = (b: B, p: Ref | undefined, o: Record<string, any> = {}) => b.col(p, { w: "fill", gap: 0, fill: "#FFFFFF", r: 10, shadow: "card", clip: true, ...o });
const cardTitle = (b: B, t: T, p: Ref, s: string, desc?: string) => {
  const c = b.col(p, { w: "fill", pad: [14, 14, 0, 14], gap: 0 });
  b.text(c, s, { size: 14, weight: "SemiBold", c: t.text, lh: 17 });
  if (desc) { b.frame(c, { w: 1, h: 4 }); b.text(c, desc, { size: 12, c: t.text2, w: "fill", lh: 16 }); }
  return c;
};
const hair = (b: B, p: Ref | undefined, c = LINE) => b.rect(p, { w: "fill", h: 1, fill: c });
/** lm-row: title 13 medium, description 12, control right; 58 px (one description line) or 73 px (two). Divider above unless first. */
const row = (b: B, t: T, p: Ref, title: string, desc: string | undefined, ctrl: (f: Ref) => void, o: { first?: boolean; h?: number; padX?: number; w?: number | "fill" } = {}) => {
  if (!o.first) hair(b, p, "#F0F0F0");
  const f = b.row(p, { w: o.w ?? "fill", h: o.h ?? (desc ? 58 : 42), pad: [0, o.padX ?? 16], gap: 16, justify: "spaceBetween", align: "center" });
  const l = b.col(f, { w: "fill", gap: 1 });
  fx(b, l, title, { size: 13.5, weight: "Medium", c: t.text, lh: 16 });
  if (desc) fx(b, l, desc, { size: 12.5, c: t.text3, w: "fill", lh: 17 });
  ctrl(f);
  return f;
};
const toggle = (b: B, t: T, on: boolean) => (f: Ref) => K.toggle(b, t, f, on);
/** Two-column toggle grid (op-grid2): hs = row heights; hairline column divider runs the full height. */
const grid2 = (b: B, t: T, c: Ref, items: [string, string | undefined, boolean][], hs: number[], colW: number) => {
  const H = hs.reduce((a, x) => a + x, 0);
  const g = b.row(c, { w: "fill", gap: 0, align: "start" });
  const cols = [0, 1].map(() => b.col(g, { w: "fill", gap: 0 }));
  hs.forEach((h, i) => [0, 1].forEach((k) => {
    const it = items[i * 2 + k];
    if (it) row(b, t, cols[k], it[0], it[1], toggle(b, t, it[2]), { first: true, h });
    else b.frame(cols[k], { w: "fill", h });
  }));
  b.rect(g, { abs: true, x: colW - 1, y: 0, w: 1, h: H, fill: LINE });
};
const link = (b: B, t: T, p: Ref, label: string, ic?: string, size = 12) => { const r = b.row(p, { gap: 4 }); b.text(r, label, { size, weight: "SemiBold", c: t.accent }); if (ic) b.icon(r, ic, 12, t.accent); return r; };
const sel = (b: B, t: T, p: Ref, value: string, o: { w?: number | "fill"; h?: number; dot?: string; avatar?: string } = {}) => {
  const h = o.h ?? 36;
  const f = b.row(p, { w: o.w ?? "hug", h, pad: [0, 12], gap: 8, r: 8, fill: "#FFFFFF", stroke: t.control, sw: 1, sa: "inside", shadow: "ctl", justify: o.w ? "spaceBetween" : "min" });
  const l = b.row(f, { gap: 8 });
  if (o.avatar) { const a = b.frame(l, { w: 20, h: 20, r: 10, fill: t.cta, layout: "horizontal", align: "center", justify: "center" }); b.text(a, o.avatar, { size: 10, weight: "SemiBold", c: "#FFFFFF" }); }
  if (o.dot) b.ellipse(l, { w: 6, h: 6, fill: o.dot });
  b.text(l, value, { size: 13, c: t.text, ls: -0.13 });
  b.icon(f, "down", 16, t.text3);
  return f;
};
const slider = (b: B, t: T, p: Ref, v: number, w: number, label: string) => {
  const r = b.row(p, { gap: 12 });
  const tr = b.frame(r, { w, h: 18 });
  b.rect(tr, { x: 0, y: 6.5, w, h: 5, r: 3, fill: t.track });
  b.rect(tr, { x: 0, y: 6.5, w: Math.max(5, w * v), h: 5, r: 3, fill: t.accent });
  b.ellipse(tr, { x: Math.min(w - 18, Math.max(0, w * v - 9)), y: 0, w: 18, h: 18, fill: "#FFFFFF", stroke: "#C0C5CC", sw: 1, sa: "inside", shadow: "ctl" });
  b.text(r, label, { size: 13, weight: "SemiBold", c: t.text, w: 44, ta: "right" });
  return r;
};
const badge = (b: B, p: Ref, label: string, bg: string, fg: string) => { const f = b.row(p, { h: 20, pad: [0, 8], r: 999, fill: bg }); b.text(f, label, { size: 12, weight: "Medium", c: fg }); return f; };
const iconBtn = (b: B, t: T, p: Ref, ic: string, c: string, size = 28) => K.iconBtn(b, t, p, ic, { size, c });

// ---------------------------------------------------------------- shell: nav + header
const nav = (b: B, t: T, vp: Ref, sec: Sec) => {
  const n = b.frame(vp, { name: "Options nav", x: 4, y: 4, w: 248, h: 710, fill: "#FFFFFF", r: 8, shadow: "card", clip: true });
  skLogo(b, n, 26, { x: 20, y: 20 });
  b.text(n, "Speak Kit", { x: 54, y: 24, size: 15, weight: "SemiBold", c: t.text, lh: 18 });
  const items = b.col(n, { x: 12, y: 64, w: 224, gap: 2 });
  NAV.forEach(([id, label, ic]) => {
    const on = id === sec;
    const f = b.row(items, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 4, fill: on ? t.selected : "none" });
    icon(b, f, ic, 18, on ? t.text : t.text2);
    b.text(f, label, { size: 13, weight: on ? "Medium" : "Regular", c: on ? t.text : t.text2, ls: -0.13 });
  });
  const as = b.row(n, { x: 20, y: 648, gap: 6 }); b.icon(as, "circleCheck", 14, t.text3); b.text(as, "Changes save automatically", { size: 12, c: t.text3 });
  b.text(n, "Speak Kit extension 0.4.0", { x: 20, y: 674, size: 11, c: t.text3 });
};
const head = (b: B, t: T, p: Ref, title: string, desc: string, reset: boolean) => {
  const h = b.row(p, { w: "fill", justify: "spaceBetween", align: "start" });
  const l = b.col(h, { gap: 4 });
  b.text(l, title, { size: 22, weight: "SemiBold", c: t.text, lh: 26 });
  b.text(l, desc, { size: 13, c: t.text2, lh: 17 });
  if (reset) link(b, t, h, "Reset section", "refresh");
};
const page = (b: B, t: T, vp: Ref, sec: Sec, title: string, desc: string, reset: boolean, body: (m: Ref) => void) => {
  b.rect(vp, { x: 0, y: 0, w: 1278, h: 718, fill: t.bg });
  nav(b, t, vp, sec);
  const m = b.col(vp, { name: "Main column", x: 351, y: 22, w: 824, gap: 16 });
  head(b, t, m, title, desc, reset);
  body(m);
};

// ---------------------------------------------------------------- sections
type Conn = "ok" | "offline" | "token" | "pair";
const bannerWarn = (b: B, t: T, p: Ref, s: string) => {
  const f = b.row(p, { w: "fill", h: 36, pad: [0, 14], gap: 10, r: 10, fill: t.warnSoft });
  b.icon(f, "alert", 16, t.warn); b.text(f, s, { size: 13, c: t.text, w: "fill" });
};
const connection = (b: B, t: T, m: Ref, st: Conn, narrow = false) => {
  const c = card(b, m);
  cardTitle(b, t, c, "Desktop app connection");
  const bad = st !== "ok";
  const r = b.row(c, { w: "fill", pad: [14, 16], gap: 16, justify: "spaceBetween" });
  const l = b.row(r, { gap: 12 });
  const ic = b.frame(l, { w: 36, h: 36, r: 18, fill: bad ? t.errSoft : t.okSoft, layout: "horizontal", align: "center", justify: "center" });
  b.icon(ic, bad ? "x" : "check", 20, bad ? t.err : t.ok);
  const tx = b.col(l, { gap: 2 });
  const [title, sub] = st === "ok" ? ["Connected to Speak Kit 0.0.0", "Kokoro-82M is ready · answered in 3 ms"] : st === "token" ? ["Pairing token rejected", "This browser's token doesn't match the app."] : ["Speak Kit isn't running", "Nothing is answering on this computer."];
  b.text(tx, title, { size: 14, weight: "SemiBold", c: t.text, lh: 17 });
  b.text(tx, sub, { size: 12, c: t.text2, lh: 15 });
  const bt = b.row(r, { gap: 8 });
  K.btn(b, t, bt, "Test connection", { v: bad ? "ghost" : "secondary", icon: "refresh" });
  if (st === "ok") K.btn(b, t, bt, "Re-pair", { icon: "link" });
  else if (st === "token") { K.btn(b, t, bt, "Re-pair", { icon: "link" }); K.btn(b, t, bt, "Paste new token", { v: "primary", icon: "clipboard" }); }
  else { K.btn(b, t, bt, "Download app", { icon: "download" }); K.btn(b, t, bt, "Open Speak Kit", { v: "primary", icon: "external" }); }
  if (bad) {
    hair(b, c);
    const a = b.col(c, { w: "fill", pad: [10, 14], gap: 6 });
    bannerWarn(b, t, a, st === "token" ? "Speak Kit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch." : "Open Speak Kit and this page reconnects by itself. If it doesn't, download the app first.");
    const d = b.row(a, { gap: 4 }); b.text(d, "Details", { size: 12, weight: "Medium", c: t.accent }); b.icon(d, "down", 12, t.accent);
  }
  hair(b, c);
  const two = b.frame(c, { w: "fill", layout: narrow ? "vertical" : "horizontal", gap: 16, pad: 14, align: "start" });
  const field = (label: string, d: string) => { const f = b.col(two, { w: "fill", gap: 6 }); b.text(f, label, { size: 12, weight: "Medium", c: t.text2, lh: 15 }); b.text(f, d, { size: 12, c: t.text3, w: "fill", lh: 16 }); return f; };
  const f1 = field("Port", "Must match the desktop app. Loopback only; nothing leaves your computer.");
  K.input(b, t, f1, { value: st === "offline" || st === "pair" ? "51999" : "29060", w: "fill" });
  const f2 = field("Pairing token", "Sent with every request so other websites can't use your voice engine.");
  const bad2 = st === "token";
  const inp = b.row(f2, { w: "fill", h: 36, pad: [0, bad2 ? 12 : 12], gap: 4, r: 8, fill: "#FFFFFF", stroke: bad2 ? t.focusField : t.control, sw: bad2 ? 2 : 1, sa: "inside", shadow: bad2 ? undefined : "ctl" });
  if (bad2) {
    b.rect(inp, { abs: true, x: -2, y: -2, w: "fill", h: 36, r: 9, stroke: t.destructive, sw: 1, sa: "outside", fill: "none" } as any);
    const fi = b.row(inp, { w: "fill", h: 26, pad: [0, 0, 0, 0], stroke: t.accent, sw: 2, sa: "inside", fill: "#FFFFFF" });
    b.text(fi, "Paste the new token here", { size: 13, c: t.placeholder, w: "fill", ls: -0.13 });
  } else {
    b.text(inp, st === "pair" ? "Paste the new token here" : "sk_local_••••••••c42e", { size: 13, c: st === "pair" ? t.placeholder : t.text, w: "fill", ls: -0.13 });
    iconBtn(b, t, inp, "eye", t.text, 28); iconBtn(b, t, inp, "copy", t.text, 28);
  }
  if (bad2) b.text(f2, "Token rejected. Copy a new one from Speak Kit > Settings > Browser integration.", { size: 11, c: t.err, w: "fill", lh: 13 });
};
const appears = (b: B, t: T, m: Ref, narrow = false) => {
  const c = card(b, m); cardTitle(b, t, c, "Where it appears");
  grid2(b, t, c, [
    ["Selection bubble", "Show Listen when you select text.", true], ["Floating dock", narrow ? "Compact player at the bottom of the page\nwhile reading." : "Compact player at the bottom of the page while\nreading.", true],
    ["Edge launcher", narrow ? "A tab at the page edge. Hover to open, click\nListen." : "A tab at the page edge. Hover to open, click Listen.", true], ["Paragraph play button", narrow ? "A play button in the margin when you hover a\nparagraph." : "A play button in the margin when you hover a\nparagraph.", true],
    ["Auto-scroll while reading", "Keep the current sentence in view.", true], ["Right-click menu entries", "Read selection, read from here, add to queue.", true],
  ], [73, 73, 58], narrow ? 359 : 412);
};
const general = (b: B, t: T, vp: Ref, st: Conn) => page(b, t, vp, "general", "General", "How the extension talks to the Speak Kit desktop app and where it shows up.", false, (m) => { connection(b, t, m, st); appears(b, t, m); });

const launcher = (b: B, t: T, vp: Ref, on: boolean) => page(b, t, vp, "launcher", "Edge launcher", "A small tab at the edge of the page. Hover to open it, then click Play to start reading.", true, (m) => {
  const c = card(b, m); cardTitle(b, t, c, "Launcher");
  row(b, t, c, "Show the edge launcher", "Works on every page, including pages where the dock is hidden.", toggle(b, t, on), { first: true });
  row(b, t, c, "Side of the page", "Drag the tab up or down on any page to move it. Saved per site.", (f) => K.seg(b, t, f, ["Left", "Right"], 1));
  row(b, t, c, "When idle", "Peek keeps a thin 14 px tab at the edge; Hidden shows nothing until you move the pointer there.", (f) => K.seg(b, t, f, ["Peek", "Hidden", "Always open"], 0), { h: 73 });
  row(b, t, c, "Open on", "Hover opens after 150 ms. Click suits touch screens and trackpads.", (f) => K.seg(b, t, f, ["Hover", "Click"], 0));
  row(b, t, c, "Close after the pointer leaves", "1.5 s. Longer gives more time to reach the buttons.", (f) => slider(b, t, f, 0.24, 220, "1.5 s"));
  row(b, t, c, "Keep a wider tab while reading", "Shows pause and a thin progress line without opening the card.", toggle(b, t, true));
});

const voice = (b: B, t: T, vp: Ref) => page(b, t, vp, "voice", "Voice and speed", "Defaults for every page. You can still change them from the popup.", true, (m) => {
  const c = card(b, m); cardTitle(b, t, c, "Engine");
  const g = b.row(c, { w: "fill", pad: 14, gap: 12, align: "start" });
  const eng = (name: string, bad: string, on: boolean, text: string) => {
    const e = b.col(g, { w: "fill", h: 106, pad: 12, gap: 8, r: 10, fill: on ? t.selected : "#FFFFFF", stroke: on ? t.focusField : t.control, sw: 1, sa: "inside" });
    const h = b.row(e, { gap: 8 }); b.text(h, name, { size: 13, weight: "SemiBold", c: t.text }); badge(b, h, bad, on ? t.okSoft : t.chipGray, on ? t.ok : t.text2);
    b.text(e, text, { size: 12, c: t.text2, w: "fill", lh: 16 });
    if (!on) K.btn(b, t, e, "Install in the app", { sz: "sm", w: "fill", icon: "external" });
  };
  eng("Kokoro-82M", "Installed", true, "Fast, runs on any computer. 28 voices. The model loads when you press play and is released when idle.");
  eng("Chatterbox", "Not installed", false, "Expressive voices and voice cloning. Needs an NVIDIA GPU.");
  const v = card(b, m); cardTitle(b, t, v, "Voice and playback");
  row(b, t, v, "Default voice", "American English · Quality A", (f) => sel(b, t, f, "Heart (US English)", { avatar: "H" }), { first: true });
  row(b, t, v, "Speed", "1.2x · about 190 words per minute. Arrow keys change it by 0.1x.", (f) => slider(b, t, f, 0.28, 280, "1.2x"));
  row(b, t, v, "Pause between paragraphs", "Short, 0.4 s", (f) => K.seg(b, t, f, ["None", "Short", "Long"], 1));
  const pv = card(b, m); cardTitle(b, t, pv, "Preview");
  const r = b.row(pv, { w: "fill", pad: 14, gap: 8 });
  K.input(b, t, r, { value: "Notes, documents and even voices lived on someone else's server.", w: "fill" });
  K.btn(b, t, r, "Play sample", { v: "primary", icon: "play" });
});

const words = (b: B, p: Ref, text: string, w: number, o: { ff: string; size: number; lh: number; c: string; sentBg: string; wordBg?: string; sent: number; word: number; pad?: number }) => {
  const rowf = b.frame(p, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w, h: "hug", align: "start" });
  (text.match(/[^.!?]+[.!?]+\s*/g) ?? [text]).forEach((s, si) => s.trim().split(/\s+/).forEach((wd, wi) => {
    const inS = si === o.sent, cur = inS && wi === o.word;
    const f = b.row(rowf, { h: o.lh, pad: [0, o.pad ?? 4, 0, 0], fill: inS ? o.sentBg : "none" });
    const g = b.row(f, { h: o.lh, fill: cur && o.wordBg ? o.wordBg : "none" });
    b.text(g, wd, { size: o.size, ff: o.ff, c: o.c, lh: o.lh });
  }));
};
const SENT = "For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server, rented back to us by the month. Lately that answer has started to wobble.";
const swatch = (b: B, t: T, p: Ref, hex: string | null, name: string, on: boolean) => {
  const col = b.col(p, { gap: 4, align: "center", w: hex ? 32 : 40 });
  const o = b.frame(col, { w: 32, h: 32, r: 16, layout: "horizontal", align: "center", justify: "center", stroke: on ? t.accent : undefined, sw: 2, sa: "inside" });
  const d = b.frame(o, { w: 24, h: 24, r: 12, fill: hex ?? t.hover, stroke: hex ? "#0000001A" : undefined, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
  if (on) b.icon(d, "check", 14, "#1E1F20"); if (!hex) b.icon(d, "plus", 14, t.text2);
  b.text(col, name, { size: 11, c: t.text2, lh: 13 });
};
const highlight = (b: B, t: T, vp: Ref, dark: boolean) => page(b, t, vp, "highlight", "Highlighting", "How the sentence and the current word are marked while Speak Kit reads.", true, (m) => {
  const c = card(b, m);
  const h = b.row(c, { w: "fill", pad: [14, 14, 0, 14], gap: 12 });
  b.text(h, "Preview", { size: 14, weight: "SemiBold", c: t.text, w: "fill" });
  K.seg(b, t, h, ["Light page", "Dark page"], dark ? 1 : 0);
  b.text(h, dark ? "Text on sentence 9.7:1" : "Text on sentence 14.6:1", { size: 11, c: t.text3 }); b.text(h, dark ? "Text on word 9.8:1" : "Text on word 11.5:1", { size: 11, c: t.text3 });
  const wr = b.col(c, { w: "fill", pad: 14, gap: 0 });
  const box = b.col(wr, { w: "fill", h: 110, r: 10, fill: dark ? DARKP.bg : "none", pad: 16, gap: 0 });
  words(b, box, SENT.split(". Lately")[0] + ". Lately that answer has started to wobble.", 764, { ff: "Georgia", size: 16, lh: 26, c: dark ? DARKP.text : "#1E1F20", sentBg: dark ? DARKP.sent : "#FFF1C2", wordBg: dark ? DARKP.word : "#FFD24D", sent: 1, word: 0, pad: 4 });
  const s = card(b, m); cardTitle(b, t, s, "Style");
  row(b, t, s, "Highlight", "Sentence gives context; word helps you follow along.", (f) => K.seg(b, t, f, ["Sentence + word", "Sentence", "Word", "Off"], 0), { first: true });
  const sw = (list: [string, string][]) => (f: Ref) => { const r = b.row(f, { gap: 8, align: "start" }); list.forEach(([hx, n], i) => swatch(b, t, r, hx, n, i === 0)); swatch(b, t, r, null, "Custom", false); };
  row(b, t, s, "Sentence color", "Marks the sentence being read.", sw([["#FFF1C2", "Yellow"], ["#DDEFFF", "Sky"], ["#E1F4DC", "Mint"], ["#FFE0EA", "Rose"], ["#E8DEFF", "Lilac"]]), { h: 74 });
  row(b, t, s, "Word color", "Marks the word being spoken.", sw([["#FFD24D", "Amber"], ["#7CC0F7", "Blue"], ["#8FD97A", "Green"], ["#FF8FB5", "Pink"], ["#B9A0FF", "Violet"]]), { h: 74 });
  row(b, t, s, "Match page theme", "Use dark variants on dark pages.", toggle(b, t, true));
});

const reader = (b: B, t: T, vp: Ref) => page(b, t, vp, "reader", "Reader view", "A distraction-free page for the article you are listening to. Open it from the launcher, the popup or the dock.", true, (m) => {
  const c = card(b, m); cardTitle(b, t, c, "Appearance");
  row(b, t, c, "Font", "Dyslexic uses OpenDyslexic or Lexend when installed, with wider spacing.", (f) => K.seg(b, t, f, ["Sans", "Serif", "Dyslexic"], 0), { first: true });
  row(b, t, c, "Text size", "18 px", (f) => slider(b, t, f, 0.27, 220, "18px"));
  row(b, t, c, "Page width", "680 px", (f) => slider(b, t, f, 0.42, 220, "680px"));
  row(b, t, c, "Theme", "Paper is a warm sand page; Light follows the extension colours.", (f) => K.seg(b, t, f, ["Paper", "Light"], 0));
  row(b, t, c, "Highlight as it reads", "Marks the paragraph, the sentence and the word being spoken.", toggle(b, t, true));
  const p = card(b, m, { pad: 14 });
  const bx = b.col(p, { w: "fill", h: 126, pad: 16, r: 10, fill: PAPER.bg });
  words(b, bx, "For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server. Lately that answer has started to wobble.", 762, { ff: "Inter", size: 19, lh: 30, c: PAPER.text, sentBg: PAPER.sent, sent: 1, word: -1, pad: 5 });
});

const kbd = (b: B, t: T, p: Ref, keys: string[]) => K.kbd(b, t, p, keys);
const shortcuts = (b: B, t: T, vp: Ref, unassigned: boolean) => page(b, t, vp, "shortcuts", "Shortcuts", "Browser-wide keys are managed by Chrome. Keys that work on the page are listed here.", false, (m) => {
  if (unassigned) {
    const f = b.row(m, { w: "fill", h: 68, pad: [0, 14], gap: 12, r: 10, fill: t.warnSoft });
    b.icon(f, "alert", 16, t.warn);
    const x = b.col(f, { w: "fill", gap: 2 });
    b.text(x, "A shortcut is not assigned", { size: 13, weight: "SemiBold", c: t.text, lh: 16 });
    b.text(x, "Chrome leaves a key unassigned when another extension or Chrome already uses it, or when it was removed. Choose a free key in Chrome.", { size: 12, c: t.text2, w: "fill", lh: 15 });
    K.btn(b, t, f, "Choose keys in Chrome", { v: "primary", sz: "sm" });
  }
  const c = card(b, m);
  const h = b.row(c, { w: "fill", pad: 14, gap: 12, justify: "spaceBetween", align: "start" });
  const hl = b.col(h, { gap: 4 }); b.text(hl, "Browser-wide (Chrome shortcuts)", { size: 14, weight: "SemiBold", c: t.text, lh: 17 }); b.text(hl, "Work on any tab, even when the page has no focus. Chrome allows four per extension.", { size: 12, c: t.text2, lh: 16 });
  K.btn(b, t, h, "Edit in Chrome", { sz: "sm", icon: "external" });
  const keyRow = (title: string, keys: string[] | null) => {
    hair(b, c);
    const r = b.row(c, { w: "fill", h: 58, pad: [0, 18, 0, 14], justify: "spaceBetween" });
    b.text(r, title, { size: 13, weight: "Medium", c: t.text, ls: -0.13 });
    if (keys) kbd(b, t, r, keys); else { const x = b.row(r, { h: 20, pad: [0, 8], gap: 4, r: 999, fill: t.warnSoft }); b.icon(x, "alert", 12, t.warn); b.text(x, "Not assigned", { size: 12, weight: "Medium", c: t.warn }); }
    iconBtn(b, t, r, "edit", t.text, 28);
  };
  keyRow("Read selection", unassigned ? null : ["Ctrl", "Shift", "S"]); keyRow("Play / pause", ["Ctrl", "Shift", "Y"]); keyRow("Stop and close dock", ["Ctrl", "Shift", "X"]);
  const c2 = card(b, m);
  const h2 = b.col(c2, { w: "fill", pad: [14, 14, 0, 14], gap: 4 }); b.text(h2, "On this page", { size: 14, weight: "SemiBold", c: t.text, lh: 17 }); b.text(h2, "Active while you read and no text field has focus.", { size: 12, c: t.text2, lh: 16 });
  const cell = (p: Ref, title: string, keys: string[]) => { const r = b.row(p, { w: "fill", h: 58, pad: [0, 18, 0, 14], justify: "spaceBetween" }); b.text(r, title, { size: 13, weight: "Medium", c: t.text, ls: -0.13 }); kbd(b, t, r, keys); iconBtn(b, t, r, "edit", t.icon, 28); };
  [[["Next paragraph", ["→"]], ["Previous paragraph", ["←"]]], [["Faster / slower", ["↑", "↓"]], ["Stop and close dock", ["Esc"]]]].forEach((pair) => {
    hair(b, c2);
    const g = b.row(c2, { w: "fill", gap: 0 });
    pair.forEach(([n, k]) => cell(b.col(g, { w: "fill", gap: 0 }), n as string, k as string[]));
  });
});

type Rule = [string, string, string, string?];
const RULES: Record<string, Rule> = { bank: ["bank.example.com", "Never read", "#A61B1B", "Nothing on this site is sent to the voice engine."], docs: ["docs.google.com", "Always show dock", "#17693D"], mail: ["mail.google.com", "Hide controls", "#5F6A7D"] };
const sites = (b: B, t: T, vp: Ref, rules: Rule[], defaultVal: string) => page(b, t, vp, "sites", "Sites and filters", "Choose where Speak Kit appears and what it skips when it reads.", true, (m) => {
  const c = card(b, m); cardTitle(b, t, c, "What to skip");
  grid2(b, t, c, [["Navigation, menus and footers", undefined, true], ["Footnote numbers and citations [12]", undefined, true], ["Code blocks", undefined, true], ["Long URLs (say “link” instead)", undefined, true], ["Image captions", undefined, false]], [42, 42, 42], 412);
  const s = card(b, m);
  const hd = b.row(s, { w: "fill", pad: 14, justify: "spaceBetween", align: "start" });
  const hl = b.col(hd, { gap: 4 }); b.text(hl, "Site permissions", { size: 14, weight: "SemiBold", c: t.text, lh: 17 }); b.text(hl, "Applies to the site and its subdomains.", { size: 12, c: t.text2, lh: 16 });
  if (rules.length) { const si = b.row(hd, { w: 228, h: 28, pad: [0, 10], gap: 8, r: 8, fill: "#FFFFFF", stroke: t.control, sw: 1, sa: "inside", shadow: "ctl" }); b.icon(si, "search", 14, t.text3); b.text(si, `Search ${rules.length} ${rules.length === 1 ? "rule" : "rules"}`, { size: 13, c: t.placeholder }); }
  const ad = b.row(s, { w: "fill", pad: 14, gap: 8 });
  K.input(b, t, ad, { placeholder: "Add a site, e.g. news.example.com", icon: "globe", w: "fill" });
  sel(b, t, ad, "Always show dock"); K.btn(b, t, ad, "Add", { v: "primary", icon: "plus" }); K.btn(b, t, ad, "Use this tab's site", { v: "ghost" });
  hair(b, s);
  if (!rules.length) { const e = b.row(s, { w: "fill", h: 37, pad: [0, 14] }); b.text(e, "No site rules yet. Sites you add here override the defaults above.", { size: 13, c: t.text3 }); }
  rules.forEach(([d, v, dot, cap], i) => {
    if (i) hair(b, s);
    const r = b.row(s, { w: "fill", h: 56, pad: [0, 18, 0, 14], gap: 12, justify: "spaceBetween" });
    const l = b.row(r, { gap: 12 }); b.icon(l, "globe", 16, t.text);
    const x = b.col(l, { gap: 1 }); b.text(x, d, { size: 13, weight: "Medium", c: t.text, ls: -0.13 }); if (cap) b.text(x, cap, { size: 11, c: t.text3, lh: 13 });
    const rr = b.row(r, { gap: 16 }); sel(b, t, rr, v, { h: 28, dot }); iconBtn(b, t, rr, "trash", t.text, 28);
  });
  const d = card(b, m);
  const dh = b.col(d, { w: "fill", pad: [14, 14, 0, 14], gap: 0 }); b.text(dh, "Sites not in the list", { size: 14, weight: "SemiBold", c: t.text, lh: 17 });
  b.text(dh, "Ask each time shows the controls but reads nothing until you press play. Never read keeps Speak Kit off every site you did not add above.", { size: 13, c: t.text2, w: "fill", lh: 16 });
  row(b, t, d, "Default for other sites", undefined, (f) => sel(b, t, f, defaultVal, { w: 160 }), { first: true });
});

// ---------------------------------------------------------------- narrow layout (C18)
const narrow = (b: B, t: T, vp: Ref) => {
  b.rect(vp, { x: 0, y: 0, w: 758, h: 718, fill: t.bg });
  const top = b.row(vp, { x: 20, y: 20, w: 718, h: 36, justify: "spaceBetween" });
  const l = b.row(top, { gap: 8 }); skLogo(b, l, 26); b.text(l, "Speak Kit", { size: 15, weight: "SemiBold", c: t.text });
  sel(b, t, top, "General", { w: 160, h: 36 });
  const m = b.col(vp, { x: 20, y: 76, w: 718, gap: 16 });
  head(b, t, m, "General", "How the extension talks to the Speak Kit desktop app and where it shows up.", false);
  connection(b, t, m, "ok", true); appears(b, t, m, true);
};

// ---------------------------------------------------------------- side panel
const panel = (b: B, t: T, vp: Ref, st: "queue" | "outline" | "empty") => {
  const pg = b.frame(vp, { x: 0, y: 0, w: 879, h: 718, clip: true, fill: "#FFFFFF" });
  const inner = b.frame(pg, { x: -200, y: 0, w: 1280, h: 718 });
  K.article(b, t, inner, { w: 720, hl: st === "queue" ? { para: 0, sent: 1, word: 3 } : st === "outline" ? { para: 2, sent: 0, word: -1 } : undefined });
  const p = b.frame(vp, { name: "Side panel", x: 879, y: 0, w: 399, h: 718, fill: "#FFFFFF", clip: true });
  b.rect(p, { x: 0, y: 51, w: 399, h: 1, fill: LINE });
  skLogo(b, p, 24, { x: 16, y: 14 }); b.text(p, "Speak Kit queue", { x: 50, y: 14, size: 16, weight: "SemiBold", c: t.text, lh: 24 });
  const x = b.frame(p, { x: 351, y: 8, w: 36, h: 36, r: 8, layout: "horizontal", align: "center", justify: "center" }); b.icon(x, "x", 18, t.text);
  if (st === "empty") {
    const e = b.col(p, { x: 0, y: 243, w: 399, h: 282, gap: 12, align: "center", justify: "center", fill: "#FFFFFF", r: 10, shadow: "card", pad: [0, 26] });
    const ic = b.frame(e, { w: 52, h: 52, r: 10, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "list", 24, t.text2);
    b.text(e, "Nothing queued", { size: 16, weight: "SemiBold", c: t.text, lh: 20 });
    b.text(e, "Line up several articles. Add this page now, or right-click a page or selection and choose Speak Kit, then Add to queue.", { size: 13, c: t.text2, ta: "center", w: "fill", lh: 19 });
    K.btn(b, t, e, "Add this page", { v: "primary" });
    return;
  }
  const lbl = (s: string, y: number) => b.text(p, s, { x: 16, y, size: 12, weight: "SemiBold", c: t.text3, ls: 0.5, lh: 15 });
  lbl("NOW PLAYING", 72);
  const n = b.frame(p, { x: 16, y: 95, w: 367, h: 182, r: 12, fill: t.selected, clip: false });
  b.text(n, "The quiet return of local-first software", { x: 20, y: 20, size: 16, weight: "SemiBold", c: t.text, lh: 20 });
  b.text(n, `reader.example.com · paragraph ${st === "queue" ? 1 : 3} of 3`, { x: 20, y: 49, size: 13, c: t.text2, lh: 16 });
  const tr = b.frame(n, { x: 20, y: 74, w: 327, h: 18 });
  b.rect(tr, { x: 0, y: 6.5, w: 327, h: 5, r: 3, fill: "#FFFFFF" }); b.rect(tr, { x: 0, y: 6.5, w: 119, h: 5, r: 3, fill: t.accent });
  b.ellipse(tr, { x: 110, y: 0, w: 18, h: 18, fill: "#FFFFFF", stroke: "#C0C5CC", sw: 1, sa: "inside", shadow: "ctl" });
  b.text(n, "2:27", { x: 20, y: 100, size: 12, c: t.text2, lh: 16 }); b.text(n, "4:21 left", { x: 247, y: 100, w: 100, ta: "right", size: 12, c: t.text2, lh: 16 });
  const cb = (ic: string, cx: number) => { const f = b.frame(n, { x: cx - 14, y: 134, w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(f, ic, 16, t.text); };
  cb("skipBack", 33); cb("back10", 66); cb("fwd10", 142); cb("skipFwd", 173);
  const pb = b.frame(n, { x: 84, y: 122, w: 40, h: 40, r: 20, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, st === "queue" ? "pause" : "play", 16, t.ctaText);
  const sp = b.frame(n, { x: 297, y: 135, w: 50, h: 26, layout: "horizontal" }); K.btn(b, t, sp, "1.2x", { sz: "sm" });
  lbl("THIS PAGE · 3 PARAGRAPHS", 290);
  const ol = b.col(p, { x: 16, y: 313, w: 367, gap: 2 });
  const OUT = st === "queue" ? ["For a decade, the default answer to every…", "The appeal is simple. When the work happen…", "None of this is nostalgia. It is a bet that the be…"] : ["For a decade, the default answer to every sof…", "The appeal is simple. When the work happen…", "None of this is nostalgia. It is a bet that the b…"];
  const cur = st === "queue" ? 0 : 2;
  OUT.forEach((s, i) => { const r = b.row(ol, { w: "fill", h: 36, pad: [0, 12, 0, 20], gap: 4, r: 4, fill: i === cur ? t.selected : "none" }); b.text(r, `${i + 1}`, { size: 12, c: t.text2, w: 16, ta: "center" }); b.text(r, s, { size: 14, weight: i === cur ? "Medium" : "Regular", c: i === cur ? t.text : t.text2, w: "fill" }); if (i === cur && st === "queue") b.icon(r, "volume", 14, t.text); });
  if (st === "queue") {
    lbl("UP NEXT · 2 · 9 MIN", 436); const cl = b.frame(p, { x: 337, y: 434, layout: "horizontal" }); b.text(cl, "Clear all", { size: 13, weight: "Medium", c: t.accent });
    [["How small speech models got good", "blog.example.org · 6 min", 459], ["Privacy by default", "docs.example.com · 3 min", 525]].forEach(([a, d, y]) => {
      const c = b.frame(p, { x: 16, y: y as number, w: 367, h: 57, r: 10, fill: "#FFFFFF", stroke: LINE, sw: 1, sa: "inside" });
      const tile = b.frame(c, { x: 8, y: 8, w: 40, h: 40, r: 8, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, "play", 16, t.text);
      b.text(c, a as string, { x: 61, y: 12, size: 13, weight: "Medium", c: t.text, lh: 16 }); b.text(c, d as string, { x: 61, y: 29, size: 12, c: t.text2, lh: 15 });
      const xb = b.frame(c, { x: 325, y: 14, w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(xb, "x", 16, t.text);
    });
  }
  b.rect(p, { x: 0, y: 672, w: 399, h: 1, fill: LINE });
  b.text(p, "Play next item automatically", { x: 16, y: 688, size: 13, weight: "Medium", c: t.text, lh: 16 });
  const tg = b.frame(p, { x: 351, y: 686, w: 32, h: 20, layout: "horizontal" }); K.toggle(b, t, tg, true);
};

// ---------------------------------------------------------------- frames
type Draw = (b: B, t: T, vp: Ref) => void;
const URL_OPT = (h: string) => `chrome-extension://hmpjlkcnbdoefgakpbqcnmjdhgieflao/options.html#${h}`;
const opt = (id: string, title: string, note: string, secId: string, tab: string, draw: Draw, o: { w?: number; rule?: string } = {}): S => ({
  id, group: "C", title, note, w: 1440, h: 900,
  build: (b, t, root) => {
    const w = o.w ?? 1278;
    const c = chromeWin(b, root, { w, h: 799, url: URL_OPT(secId), tabTitle: `${tab} · Speak Kit`, favicon: "S", backdrop: { w: 1440, h: 900 }, x: Math.round((1440 - w) / 2), y: 40 });
    draw(b, t, c.viewport.ref);
  },
});
const side = (id: string, title: string, note: string, st: "queue" | "outline" | "empty"): S => ({
  id, group: "C", title, note, w: 1440, h: 900,
  build: (b, t, root) => {
    const c = chromeWin(b, root, { w: 1278, h: 799, url: "reader.example.com/essays/local-first", tabTitle: "The quiet return of local-first software", backdrop: { w: 1440, h: 900 }, x: 81, y: 40 });
    panel(b, t, c.viewport.ref, st);
  },
});

export const VOPT: S[] = [
  opt("C1", "Options · General (connected)", "Connection status with response time, port, pairing token and where the extension shows UI.", "general", "General", (b, t, vp) => general(b, t, vp, "ok")),
  opt("C2", "Options · General (app not running)", "Same layout as connected; only the status card changes. Primary action launches the app, the error code sits behind Details.", "general", "General", (b, t, vp) => general(b, t, vp, "offline")),
  opt("C3", "Options · General (token rejected)", "Pairing token mismatch: paste a new token into the focused field, with Re-pair as the fallback.", "general", "General", (b, t, vp) => general(b, t, vp, "token")),
  opt("C13", "Options · Pair this browser (no token yet)", "No token saved yet: the field shows its placeholder, and Open Speak Kit is the easy path.", "general", "General", (b, t, vp) => general(b, t, vp, "pair")),
  opt("C4", "Options · Voice and speed", "Engine cards, default voice, speed slider with live value, paragraph pause, preview.", "voice", "Voice and speed", (b, t, vp) => voice(b, t, vp)),
  opt("C21", "Options · Voice and speed (app not running)", "The voice section reads the same when the app is not running.", "voice", "Voice and speed", (b, t, vp) => voice(b, t, vp)),
  opt("C5", "Options · Highlighting", "Preview on a light or a dark page with contrast readout, named color swatches with a custom option.", "highlight", "Highlighting", (b, t, vp) => highlight(b, t, vp, false)),
  opt("C22", "Options · Highlighting (dark page preview)", "The dark page preview shows the dark highlight palette and its contrast.", "highlight", "Highlighting", (b, t, vp) => highlight(b, t, vp, true)),
  opt("C19", "Options · Reader view", "Font, text size, page width, theme and highlight for the paper reader, with a live preview.", "reader", "Reader view", (b, t, vp) => reader(b, t, vp)),
  opt("C6", "Options · Shortcuts", "Browser-wide Chrome shortcuts (edited in Chrome) and in-page keys.", "shortcuts", "Shortcuts", (b, t, vp) => shortcuts(b, t, vp, false)),
  opt("C16", "Options · Shortcut not assigned by Chrome", "A key Chrome left unassigned shows Not assigned and a banner with the way out.", "shortcuts", "Shortcuts", (b, t, vp) => shortcuts(b, t, vp, true)),
  opt("C7", "Options · Sites and filters", "Skip rules, per-site permissions and the default for sites not in the list.", "sites", "Sites and filters", (b, t, vp) => sites(b, t, vp, [RULES.bank, RULES.docs, RULES.mail], "Ask each time")),
  opt("C15", "Options · Sites not in the list (default for other sites)", "Default for other sites set to Never read, with one rule.", "sites", "Sites and filters", (b, t, vp) => sites(b, t, vp, [RULES.docs], "Never read")),
  opt("C20", "Options · Sites and filters (no rules yet)", "Empty permissions list explains that added sites override the defaults.", "sites", "Sites and filters", (b, t, vp) => sites(b, t, vp, [], "Ask each time")),
  opt("C12", "Options · Edge launcher", "Turn the edge launcher on or off, choose its side, how it hides, when it opens and how long it stays open.", "launcher", "Edge launcher", (b, t, vp) => launcher(b, t, vp, true)),
  opt("C23", "Options · Edge launcher (turned off)", "With the launcher off the master switch is off; the other rows stay editable.", "launcher", "Edge launcher", (b, t, vp) => launcher(b, t, vp, false)),
  opt("C18", "Options · Narrow layout", "Below 1025 px the nav collapses to a select at the top; rows stack in one column.", "general", "General", (b, t, vp) => narrow(b, t, vp), { w: 758 }),
  side("C9", "Side panel · queue and outline", "Chrome side panel: now playing with transport, paragraph outline, up-next queue with Play now, Remove and Clear all.", "queue"),
  side("C24", "Side panel · outline without a queue", "Paused on paragraph 3: the outline stays, the queue list and Clear all are gone.", "outline"),
  side("C10", "Side panel · empty queue", "Empty state explains how to add pages; the same panel shows when the app is offline or the token is rejected.", "empty"),
];
