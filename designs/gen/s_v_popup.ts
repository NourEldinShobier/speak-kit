// Extension toolbar popup (A*): the built popup (apps/extension/src/app/popup + compose.css + lumen.css) drawn pixel-for-pixel in an editable
// vector build, then placed in its real context: a Windows 11 Chrome window with the popup hanging under the Speak Kit toolbar icon.
// Light only. Every value below comes from compose.css / lumen.css (px, Inter); the shots in designs/built/shots/A*-light.png are the reference.
import { B, Ref, ICONS, TABLER_NAME } from "./lib";
import tablerBounds from "./tabler-bounds.json";
import { S } from "./types";
import { chromeWin, skLogo } from "./kit3";

// "adjustments" (vertical sliders, the popup's settings button) is not in the shared icon set yet: register it here (Tabler outline, bbox 4,4 16x16).
(TABLER_NAME as Record<string, string>).adjustments = "adjustments";
(ICONS as Record<string, string>).adjustments = "M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M6 4v4 M6 12v8 M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M12 4v10 M12 18v2 M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0 M18 4v1 M18 9v11";
(tablerBounds as Record<string, number[]>).adjustments = [4, 4, 16, 16];

// ---- Lumen tokens used by the popup
const C = {
  text: "#1B2230", text2: "#475467", text3: "#5F6A7D", label: "#171717", ph: "#6B7280", icon: "#667085",
  divider: "#EBEBEB", control: "#E5E5E5", field: "#C3C6CC", well: "#F5F5F5", track: "#F0F0F0", window: "#F0F0F0", selected: "#F0F0F0",
  hover: "#0000000A", cta: "#201E25", onCta: "#FAFAFA", accent: "#0069CC", link: "#0B5CAD", white: "#FFFFFF", raisedHover: "#F7F8FA",
};
const PILL = { green: ["#D5F3E0", "#17693D"], orange: ["#FFEBCF", "#9A5200"], red: ["#FFE4E5", "#A61B1B"], neutral: ["#F0F0F0", "#475467"] } as const;
type Tone = keyof typeof PILL;
type Node = Ref | undefined;

// ---- primitives (same as lib.ts, but exact sizes: no rounding of 11.5 px text or 13 px icons)
type TO = { size?: number; weight?: string; c?: string; lh?: number; ta?: string; ls?: number; w?: number | "fill"; ff?: string; maxLines?: number };
const T = (b: B, p: Node, s: string, o: TO = {}) => {
  const { size = 13, weight = "Regular", c = C.text, lh = 16, ta, ls, w, ff = "Inter", maxLines } = o;
  const props: any = { fontFamily: ff, fontStyle: weight, fontSize: size, fill: c, lineHeight: lh };
  if (ta) props.textAlign = ta;
  if (ls !== undefined) props.letterSpacing = ls;
  if (maxLines) props.maxLines = maxLines;
  if (w !== undefined) props.w = w;
  const r = b.node("text", p, props, { text: s });
  if (w === "fill") b.add("node.set", { ids: [r], textAutoResize: "height" });
  return r;
};
const SOLID: Record<string, number> = { play: 2.25, stop: 2.25, pause: 2.75 };
const ic = (b: B, p: Node, name: string, size: number, color: string): Ref => {
  const d = ICONS[name]; if (!d) throw new Error("missing icon " + name);
  const props = name in SOLID ? { fill: color, stroke: color, strokeWeight: SOLID[name], strokeCap: "round", strokeJoin: "round" } : { fill: "none", stroke: color, strokeWeight: 1.5, strokeCap: "round", strokeJoin: "round" };
  const [x0, y0, w0, h0] = (tablerBounds as Record<string, number[]>)[TABLER_NAME[name]];
  const k = size / 24;
  const wrap = b.frame(p, { w: size, h: size, clip: false });
  const v: any = { type: "vector", path: d, x: x0 * k - x0, y: y0 * k - y0, parent: wrap, props };
  if (w0 > 0) v.width = w0 * k;
  if (h0 > 0) v.height = h0 * k;
  b.add("node.create", v);
  return wrap;
};
const hr = (b: B, p: Node) => b.rect(p, { w: "fill", h: 1, fill: C.divider });

// ---- Lumen components
type Btn = { v?: "primary" | "secondary" | "ghost"; sz?: "md" | "sm"; icon?: string; iconRight?: string; disabled?: boolean; w?: number | "fill"; pressed?: boolean; expanded?: boolean };
const btn = (b: B, p: Node, label: string, o: Btn = {}): Ref => {
  const { v = "secondary", sz = "md", icon, iconRight, disabled, w = "hug" } = o;
  const h = sz === "sm" ? 28 : 36; const g = sz === "sm" ? 14 : 16;
  const col = v === "primary" ? C.onCta : v === "ghost" ? C.text2 : C.label;
  const f = b.row(p, {
    h, w, gap: sz === "sm" ? 6 : 6, justify: "center", r: 8, opacity: disabled ? 0.5 : undefined,
    pad: [0, v === "primary" ? (sz === "sm" ? 12 : 15) : sz === "sm" ? 12 : 14],
    fill: v === "primary" ? C.cta : v === "secondary" ? (o.expanded ? C.raisedHover : C.white) : "none",
    ...(v === "secondary" ? { stroke: C.control, sw: 1, sa: "inside", shadow: "ctl" } : {}), ...(v === "primary" ? { shadow: "cta" } : {}),
  });
  if (icon) ic(b, f, icon, g, v === "secondary" ? C.text2 : col);
  T(b, f, label, { size: 13, weight: "Medium", c: col, lh: 16, ls: -0.13 });
  if (iconRight) ic(b, f, iconRight, g, C.text3);
  return f;
};
/** IconButton: transparent, 36 (glyph 16) or 28 (glyph 14), colour text-primary. */
const ibtn = (b: B, p: Node, name: string, size: 36 | 28, o: { disabled?: boolean; c?: string } = {}) => {
  const f = b.row(p, { w: size, h: size, justify: "center", r: 8, opacity: o.disabled ? 0.5 : undefined });
  ic(b, f, name, size === 28 ? 14 : 16, o.c ?? C.text);
  return f;
};
const pill = (b: B, p: Node, label: string, tone: Tone) => {
  const [bg, fg] = PILL[tone];
  const f = b.row(p, { h: 20, pad: [2, 7, 0, 7], r: 999, fill: bg, justify: "center" });
  T(b, f, label, { size: 11.5, weight: "Medium", c: fg, lh: 14 });
  return f;
};
const kbd = (b: B, p: Node, k: string) => { const f = b.row(p, { h: 16, pad: [0, 4], r: 4, stroke: C.control, sw: 1, sa: "inside", justify: "center" }); T(b, f, k, { size: 10, c: C.text3, lh: 12 }); return f; };
const avatar = (b: B, p: Node, letter: string, size: number, tone: "accent" | "purple") => {
  const f = b.row(p, { w: size, h: size, r: 999, justify: "center", fill: tone === "accent" ? C.cta : "#7A4CD9" });
  T(b, f, letter, { size: size * 0.42, weight: "SemiBold", c: tone === "accent" ? C.onCta : "#FFFFFF", lh: size * 0.42 * 1.2, ta: "center" });
  return f;
};
const slider = (b: B, p: Node, w: number, pct: number) => {
  const f = b.frame(p, { w, h: 16, clip: false });
  b.rect(f, { x: 0, y: 5.5, w, h: 5, r: 999, fill: C.track });
  b.rect(f, { x: 0, y: 5.5, w: Math.max(0.01, w * pct), h: 5, r: 999, fill: C.accent });
  b.ellipse(f, { x: pct * (w - 16), y: 0, w: 16, h: 16, fill: "#FFFFFF", stroke: C.field, sw: 1, sa: "outside", shadow: "sm" });
  return f;
};
const progress = (b: B, p: Node, o: { pct?: number; thin?: boolean } = {}) => {
  const h = o.thin ? 3 : 4;
  const f = b.frame(p, { w: "fill", h, r: 999, fill: C.track, clip: true });
  if (o.pct === undefined) b.rect(f, { x: 188, y: 0, w: 131, h, r: 999, fill: C.accent });
  else if (o.pct > 0) b.rect(f, { x: 0, y: 0, w: (328 * o.pct) / 100, h, r: 999, fill: C.accent });
  return f;
};

// ---- popup chrome (parts.tsx)
const header = (b: B, p: Node, label: string, tone: Tone) => {
  const f = b.row(p, { w: "fill", h: 52, pad: [0, 12, 1, 16], gap: 10 });
  const br = b.row(f, { w: "fill", gap: 8 });
  skLogo(b, br, 24);
  T(b, br, "Speak Kit", { size: 14, weight: "SemiBold", lh: 17 });
  pill(b, f, label, tone);
  ibtn(b, f, "adjustments", 36);
  b.rect(f, { abs: true, x: 0, y: 51, w: 360, h: 1, fill: C.divider });
  return f;
};
const foot = (b: B, p: Node, left = "Runs on this computer", right = "Open app") => {
  const f = b.row(p, { w: "fill", h: 40, pad: [1, 16, 0, 16], fill: C.window, justify: "spaceBetween" });
  b.rect(f, { abs: true, x: 0, y: 0, w: 360, h: 1, fill: C.divider });
  const l = b.row(f, { gap: 6 }); ic(b, l, "lock", 13, C.text3); T(b, l, left, { size: 12, c: C.text3 });
  const r = b.row(f, { gap: 4 }); T(b, r, right, { size: 12, weight: "Medium", c: C.link, lh: 15 }); ic(b, r, "external", 13, C.link);
  return f;
};
const body = (b: B, p: Node) => b.col(p, { w: "fill", pad: 16, gap: 12 });
const nowCard = (b: B, p: Node, title: string, sub: string) => {
  const f = b.row(p, { w: "fill", gap: 12 });
  const tile = b.row(f, { w: 36, h: 36, r: 8, fill: C.hover, justify: "center" }); ic(b, tile, "globe", 18, C.text2);
  const t = b.col(f, { w: "fill", gap: 2 });
  T(b, t, title, { size: 14, weight: "Medium", lh: 17, w: "fill" });
  T(b, t, sub, { size: 12, c: C.text3, lh: 15, w: "fill" });
  return f;
};
const msg = (b: B, p: Node, icon: string, title: string, bodyText: string, primary: string, secondary?: string) => {
  const e = b.col(p, { w: "fill", pad: [4, 0], gap: 12, align: "center", r: 8, fill: C.white, shadow: "card" });
  const tile = b.row(e, { w: 52, h: 52, r: 10, fill: C.well, justify: "center" }); ic(b, tile, icon, 26, C.text2);
  T(b, e, title, { size: 16, weight: "SemiBold", lh: 19, ta: "center", w: "fill" });
  T(b, e, bodyText, { size: 14, c: C.text2, lh: 20, ta: "center", w: "fill" });
  const a = b.col(e, { w: "fill", gap: 8 });
  btn(b, a, primary, { v: "primary", w: "fill" });
  if (secondary) btn(b, a, secondary, { w: "fill" });
  return e;
};

// ---- player views (home.tsx, pickers.tsx)
const hint = (b: B, p: Node, s: string) => T(b, p, s, { size: 12, c: C.text3, lh: 16, ta: "center", w: "fill" });
const idleActions = (b: B, p: Node, hintText: string) => {
  const a = b.col(p, { w: "fill", gap: 10 });
  btn(b, a, "Listen to this page", { v: "primary", icon: "play", w: "fill" });
  const two = b.row(a, { w: "fill", gap: 8 });
  const l = btn(b, two, "From selection", { icon: "scan", disabled: true, w: "fill" });
  btn(b, two, "Reader view", { icon: "book", w: "fill" });
  hint(b, a, hintText);
  return a;
};
const scrubber = (b: B, p: Node, pct: number, left: string, right: string) => {
  const s = b.col(p, { w: "fill", gap: 4 });
  slider(b, s, 328, pct);
  const t = b.row(s, { w: "fill", justify: "spaceBetween" });
  T(b, t, left, { size: 11, c: C.text3, lh: 16 }); T(b, t, right, { size: 11, c: C.text3, lh: 16 });
  return s;
};
const transport = (b: B, p: Node, centre: "pause" | "play" | "refresh" | "busy") => {
  const busy = centre === "busy";
  const t = b.row(p, { gap: 14, justify: "center", w: "fill" });
  ibtn(b, t, "skipBack", 28, { disabled: busy });
  ibtn(b, t, "back10", 36, { disabled: busy });
  const big = b.row(t, { w: 52, h: 52, r: 999, fill: C.cta, justify: "center", shadow: "cta", opacity: busy ? 0.5 : undefined });
  ic(b, big, centre === "busy" ? "loader" : centre, 20, C.onCta);
  ibtn(b, t, "fwd10", 36, { disabled: busy });
  ibtn(b, t, "skipFwd", 28, { disabled: busy });
  return t;
};
const busyControls = (b: B, p: Node, o: { text: string; pct?: number }) => {
  const c = b.col(p, { w: "fill", gap: 10 });
  const pr = b.col(c, { w: "fill", gap: 8 });
  progress(b, pr, { pct: o.pct });
  T(b, pr, o.text, { size: 12, c: C.text2, lh: 16, ta: "center", w: "fill" });
  transport(b, c, "busy");
  const cancel = b.row(c, { w: "fill", justify: "center" });
  btn(b, cancel, "Cancel", { v: "ghost", sz: "sm", icon: "x" });
  return c;
};
const liveControls = (b: B, p: Node, o: { pct: number; left: string; right: string; centre: "pause" | "play" | "refresh"; hint?: string }) => {
  const c = b.col(p, { w: "fill", gap: 10 });
  scrubber(b, c, o.pct, o.left, o.right);
  transport(b, c, o.centre);
  if (o.hint) hint(b, c, o.hint);
  return c;
};
const voiceSpeed = (b: B, p: Node, speedOpen = false) => {
  const r = b.row(p, { w: "fill", gap: 8 });
  const v = b.row(r, { w: "fill", h: 36, pad: [0, 14], gap: 6, r: 8, fill: C.white, stroke: C.control, sw: 1, sa: "inside", shadow: "ctl" });
  avatar(b, v, "H", 20, "accent");
  const g = b.row(v, { w: "fill" }); T(b, g, "Heart · US English", { size: 13, weight: "Medium", c: C.label, ls: -0.13 });
  ic(b, v, "down", 14, C.text3);
  const s = b.row(r, { h: 36, pad: [0, 14], r: 8, fill: speedOpen ? C.raisedHover : C.white, stroke: C.control, sw: 1, sa: "inside", shadow: "ctl", justify: "center" });
  T(b, s, "1.2x", { size: 13, weight: "Medium", c: C.label, ls: -0.13 });
  return r;
};
const shortcuts = (b: B, p: Node) => {
  const c = b.col(p, { w: "fill", gap: 8 });
  for (const [l, ks] of [["Read selection", ["Ctrl", "Shift", "S"]], ["Play / pause", ["Ctrl", "Shift", "Y"]]] as const) {
    const r = b.row(c, { w: "fill", justify: "spaceBetween" });
    T(b, r, l, { size: 12, c: C.text2, lh: 16 });
    const k = b.row(r, { gap: 4 }); ks.forEach((x) => kbd(b, k, x));
  }
  return c;
};
const speedPanel = (b: B, p: Node) => {
  const c = b.col(p, { w: "fill", gap: 10 });
  const r = b.row(c, { w: "fill", gap: 12 });
  const g = b.col(r, { w: "fill", gap: 2 });
  slider(b, g, 252, (1.2 - 0.5) / 2.5);
  const lb = b.row(g, { w: "fill", justify: "spaceBetween" }); T(b, lb, "0.5x", { size: 11, c: C.text3, lh: 16 }); T(b, lb, "3x", { size: 11, c: C.text3, lh: 16 });
  const o = b.row(r, { w: 44, justify: "end" }); T(b, o, "1.2x", { size: 14, weight: "SemiBold", lh: 17, ta: "right" });
  const pr = b.row(c, { w: "fill", gap: 6 });
  for (const s of ["0.5x", "1x", "1.2x", "1.5x", "2x", "3x"]) {
    const on = s === "1.2x";
    const x = b.row(pr, { w: "fill", h: 36, r: 8, justify: "center", ...(on ? { fill: C.white, stroke: C.control, sw: 1, sa: "inside", shadow: "ctl" } : {}) });
    T(b, x, s, { size: 13, weight: "Medium", c: on ? C.label : C.text2, ls: -0.13 });
  }
  const f = b.row(c, { w: "fill", justify: "spaceBetween" });
  btn(b, f, "Reset to 1x", { v: "ghost", sz: "sm", icon: "refresh" });
  T(b, f, "Arrow keys change speed by 0.1x", { size: 12, c: C.text3, lh: 16 });
  return c;
};
const upNext = (b: B, p: Node) => {
  const f = b.row(p, { w: "fill", pad: [10, 12], gap: 12, r: 10, stroke: C.divider, sw: 1, sa: "inside" });
  const d = b.col(f, { w: "fill", gap: 2 });
  T(b, d, "Up next · 1 of 1 queued", { size: 12, c: C.text3, lh: 16, w: "fill" });
  T(b, d, "How small speech models got good", { size: 13, weight: "SemiBold", lh: 16, w: "fill", maxLines: 1 });
  T(b, d, "blog.example.org · 6 min", { size: 12, c: C.text3, lh: 16, w: "fill" });
  btn(b, f, "Play next", { v: "primary", sz: "sm" });
  return f;
};
const VOICES: [string, string, string][] = [["Heart", "US English", "A"], ["Bella", "US English", "A-"], ["Nicole", "US English", "B-"], ["Aoede", "US English", "C"], ["Kore", "US English", "C"]];
const voicePanel = (b: B, p: Node) => {
  const mini = b.row(p, { w: "fill", gap: 10 });
  ibtn(b, mini, "pause", 36);
  const mc = b.col(mini, { w: "fill", gap: 4 });
  progress(b, mc, { pct: 36, thin: true });
  const tr = b.row(mc, { w: "fill", justify: "spaceBetween" }); T(b, tr, "2:27", { size: 11, c: C.text3, lh: 16 }); T(b, tr, "4:21 left", { size: 11, c: C.text3, lh: 16 });
  const hd = b.row(p, { w: "fill", justify: "spaceBetween" });
  T(b, hd, "Voice", { size: 14, weight: "SemiBold", lh: 17 });
  const dn = b.row(hd, { gap: 4 }); T(b, dn, "Done", { size: 12, weight: "Medium", c: C.link, lh: 15 }); ic(b, dn, "up", 14, C.link);
  const vs = b.col(p, { w: "fill", gap: 10 });
  const inp = b.row(vs, { w: "fill", h: 28, pad: [4, 12], gap: 8, r: 8, fill: C.white, stroke: C.control, sw: 1, sa: "inside", shadow: "ctl" });
  ic(b, inp, "search", 16, C.icon); T(b, inp, "Search 28 voices", { size: 13, c: C.ph, ls: -0.13 });
  const fl = b.col(vs, { w: "fill", gap: 6 });
  const fr1 = b.row(fl, { w: "fill", gap: 6 }); const fr2 = b.row(fl, { w: "fill", gap: 6 });
  for (const l of ["Language: English", "Accent: Any", "Voice: Any"]) {
    const s = b.row(l === "Voice: Any" ? fr2 : fr1, { w: 160, h: 28, pad: [4, 12], gap: 8, r: 8, fill: l.startsWith("Lang") ? C.raisedHover : C.white, stroke: C.control, sw: 1, sa: "inside", shadow: "ctl", justify: "spaceBetween" });
    T(b, s, l, { size: 13, c: C.text, ls: -0.13 }); ic(b, s, "down", 14, C.text3);
  }
  const list = b.col(vs, { w: "fill", gap: 2 });
  VOICES.forEach(([n, lang, q], i) => {
    const sel = i === 0;
    const r = b.row(list, { w: "fill", h: 44, pad: [0, 8], gap: 10, r: 8, fill: sel ? C.selected : "none" });
    avatar(b, r, n[0], 28, sel ? "accent" : "purple");
    const t = b.col(r, { w: "fill", gap: 1 });
    T(b, t, n, { size: 13, weight: "SemiBold", lh: 16, w: "fill" });
    T(b, t, `${lang} · Quality ${q}`, { size: 12, c: C.text2, lh: 16, w: "fill" });
    if (sel) ic(b, r, "check", 16, C.text);
    ibtn(b, r, "play", 28);
  });
  const nt = b.row(p, { w: "fill", gap: 8, align: "start" });
  ic(b, nt, "info", 14, C.text3);
  T(b, nt, "Quality is Kokoro's own rating, from A (best) to C. Previewing a voice pauses the reading.", { size: 12, c: C.text3, lh: 15, w: "fill" });
};

// ---- the 22 popup states
const SITE = "reader.example.com";
const TITLE = "The quiet return of local-first software";
type Ctx = "article" | "selection" | "file" | "extensions" | "pdf";
type St = { id: string; title: string; note: string; h: number; pill: [string, Tone]; ctx: Ctx; draw: (b: B, p: Ref) => void };
const home = (sub: string, title = TITLE) => (b: B, p: Ref) => { nowCard(b, p, title, sub); };
const STATES: St[] = [
  { id: "A1", title: "Popup · idle on an article", note: "Nothing playing yet. One big action, selection (disabled until text is selected) and reader view.", h: 393, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); idleActions(b, p, "Select text on the page to read just that part."); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A2", title: "Popup · selection ready", note: "Text is selected on the page; the popup offers to read only that, with a real time estimate.", h: 405, pill: ["Kokoro ready", "green"], ctx: "selection",
    draw: (b, p) => {
      nowCard(b, p, "Selected text", `${SITE} · 1 sentence, about 6 s`);
      const a = b.col(p, { w: "fill", gap: 10 });
      const q = b.col(a, { w: "fill", pad: [10, 12], r: 8, fill: C.selected });
      b.rect(q, { abs: true, x: 0, y: 0, w: 2, h: 74, fill: C.control });
      T(b, q, "“Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.”", { size: 13, c: C.text2, lh: 18, w: "fill" });
      btn(b, a, "Listen to selection", { v: "primary", icon: "play", w: "fill" });
      hr(b, p); voiceSpeed(b, p); shortcuts(b, p);
    } },
  { id: "A3", title: "Popup · preparing audio", note: "First sentence is being synthesized. Indeterminate bar, skip buttons disabled, Cancel available.", h: 413, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); busyControls(b, p, { text: "Preparing the first sentence. This takes a few seconds." }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A4", title: "Popup · playing", note: "Scrubber with time left, 10 s skips, previous/next paragraph.", h: 383, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); liveControls(b, p, { pct: 0.36, left: "2:27", right: "4:21 left", centre: "pause" }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A5", title: "Popup · paused", note: "Same layout, play button instead of pause.", h: 383, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); liveControls(b, p, { pct: 0.36, left: "2:27", right: "4:21 left", centre: "play" }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A6", title: "Popup · voice picker", note: "Searchable voice list with language, accent and voice filters; every row has a preview button.", h: 633, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); voicePanel(b, p); } },
  { id: "A7", title: "Popup · speed picker", note: "Slider with live value plus presets across the 0.5x to 3x range.", h: 461, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); liveControls(b, p, { pct: 0.36, left: "2:27", right: "4:21 left", centre: "play" }); hr(b, p); voiceSpeed(b, p, true); speedPanel(b, p); } },
  { id: "A8", title: "Popup · finished", note: "End of page; main button becomes replay and the next queued item is offered.", h: 495, pill: ["Kokoro ready", "green"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · finished`); liveControls(b, p, { pct: 1, left: "6:48", right: "Finished", centre: "refresh", hint: "Replay from the start" }); upNext(b, p); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A9", title: "Popup · app not running", note: "The desktop app is closed. Launch it, or download it.", h: 379, pill: ["App offline", "red"], ctx: "article",
    draw: (b, p) => msg(b, p, "power", "Speak Kit isn't running", "The extension reads with the Speak Kit desktop app on this computer. Open the app and this popup connects by itself.", "Open Speak Kit", "Download the app") },
  { id: "A10", title: "Popup · model loading", note: "App is up but the voice engine is still starting. Skips disabled, Cancel available.", h: 429, pill: ["Loading model", "orange"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); busyControls(b, p, { text: "Starting the voice engine. The first time takes a few seconds." }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A11", title: "Popup · page not readable", note: "Chrome internal pages and the Web Store block extensions.", h: 335, pill: ["Kokoro ready", "green"], ctx: "extensions",
    draw: (b, p) => msg(b, p, "lockOff", "Can't read this page", "Chrome blocks extensions on its own pages (chrome://, the Web Store). Open a normal website or paste text into the app.", "Paste text in the app") },
  { id: "A13", title: "Popup · app not installed", note: "First run: the app is not on this computer yet, so Download is the primary action.", h: 379, pill: ["Not set up", "neutral"], ctx: "article",
    draw: (b, p) => msg(b, p, "download", "Install Speak Kit to start listening", "Speak Kit reads pages aloud with a voice that runs on this computer. Nothing you read is uploaded.", "Download Speak Kit for Windows", "I already installed it") },
  { id: "A14", title: "Popup · pairing token rejected", note: "App and browser no longer share a token; paste a new one in the extension options.", h: 379, pill: ["Not paired", "orange"], ctx: "article",
    draw: (b, p) => msg(b, p, "link", "Pair Speak Kit with this browser again", "The app and this browser no longer share a pairing token. This usually happens after reinstalling one of them.", "Paste new token", "Open Speak Kit") },
  { id: "A15", title: "Popup · local file needs permission", note: "file:// pages need “Allow access to file URLs” in the extension settings.", h: 379, pill: ["Kokoro ready", "green"], ctx: "file",
    draw: (b, p) => msg(b, p, "file", "Allow access to file URLs", "Chrome needs one more permission to read local files. Turn on “Allow access to file URLs” in the extension settings.", "Open extension settings", "Paste text in the app") },
  { id: "A16", title: "Popup · engine asleep", note: "Idle unload freed the model; play wakes it, about 2 s.", h: 409, pill: ["Wakes on play", "neutral"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); idleActions(b, p, "The voice wakes when you press play. Select text to read just that part."); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A17", title: "Popup · waking the engine", note: "Press play on an unloaded engine: skips disabled, Cancel available.", h: 413, pill: ["Waking up", "orange"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); busyControls(b, p, { text: "Waking the voice engine. This takes a few seconds." }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A18", title: "Popup · app and extension versions differ", note: "The protocol versions no longer match; install the latest app, settings are kept.", h: 379, pill: ["Update needed", "orange"], ctx: "article",
    draw: (b, p) => msg(b, p, "refresh", "Speak Kit needs an update", "The app and this extension no longer speak the same version of the protocol. Install the latest release of both; your settings are kept.", "Download the latest app", "Check again") },
  { id: "A19", title: "Popup · Chrome's PDF viewer", note: "Extensions cannot read text inside Chrome's PDF viewer; paste the text into the app.", h: 335, pill: ["Kokoro ready", "green"], ctx: "pdf",
    draw: (b, p) => msg(b, p, "file", "Chrome's PDF viewer can't be read", "Extensions cannot reach text inside the PDF viewer. Select the text you want, copy it, and paste it into the app.", "Paste text in the app") },
  { id: "A20", title: "Popup · no voice engine installed", note: "The app runs but the Kokoro model is not installed; open the app to download it.", h: 379, pill: ["No voice engine", "orange"], ctx: "article",
    draw: (b, p) => msg(b, p, "alert", "The voice engine isn't ready", "Speak Kit is running but the Kokoro voice model isn't installed or failed to start. Open the app to download or repair it.", "Open Speak Kit", "Check again") },
  { id: "A21", title: "Popup · downloading the voice model", note: "The model downloads on first run; the popup shows the progress and Cancel.", h: 413, pill: ["Loading model", "orange"], ctx: "article",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); busyControls(b, p, { text: "Downloading the voice model, 0%.", pct: 0 }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
  { id: "A22", title: "Popup · voice engine error", note: "The engine failed to start; open the app to repair it.", h: 379, pill: ["No voice engine", "orange"], ctx: "article",
    draw: (b, p) => msg(b, p, "alert", "The voice engine isn't ready", "Speak Kit is running but the Kokoro voice model isn't installed or failed to start. Open the app to download or repair it.", "Open Speak Kit", "Check again") },
  { id: "A23", title: "Popup · playing with a selection on the page", note: "Playback keeps the page title; a selection on the page does not change the player.", h: 383, pill: ["Kokoro ready", "green"], ctx: "selection",
    draw: (b, p) => { nowCard(b, p, TITLE, `${SITE} · 6:48 at 1.2x`); liveControls(b, p, { pct: 0.36, left: "2:27", right: "4:21 left", centre: "pause" }); hr(b, p); voiceSpeed(b, p); shortcuts(b, p); } },
];
const FOOT: Record<string, [string, string]> = { A9: ["Runs on this computer", "Troubleshooting"], A13: ["Free. Works offline.", "Learn more"], A14: ["Runs on this computer", "Extension options"], A18: ["Runs on this computer", "Troubleshooting"] };

// ---- the host pages the popup is opened on (generic, drawn as editable text and frames)
const SEL_BLUE = "#3367D1";
const article = (b: B, vp: Ref, selected: boolean) => {
  const X = 279, W = 720, ink = "#1F1F1F";
  T(b, b.frame(vp, { x: X, y: 56, w: W, h: 16 }), "ESSAY · 8 MIN READ", { size: 12, weight: "SemiBold", c: "#0F62C9", lh: 16, ls: 0.6 });
  const h1 = b.frame(vp, { x: X, y: 87, w: W, h: 94 }); T(b, h1, TITLE, { size: 40, weight: "Bold", c: ink, lh: 47, w: W });
  T(b, b.frame(vp, { x: X, y: 198, w: W, h: 20 }), "Maya Okafor · October 28, 2026", { size: 14, c: "#5F6368", lh: 20 });
  b.rect(vp, { x: X, y: 234, w: W, h: 1, fill: "#E2E2E5" });
  const P1 = ["For a decade, the default answer to every software question was the cloud. Notes,", "documents and even voices lived on someone else's server, rented back to us by", "the month. Lately that answer has started to wobble. Small models now run on an", "ordinary laptop, and they sound good enough that nobody asks where the audio", "came from."];
  const para = (y: number, text: string) => { const f = b.frame(vp, { x: X, y, w: W, h: 30 * Math.ceil(text.length / 78) }); T(b, f, text, { size: 18, c: ink, lh: 30, w: W }); };
  if (!selected) para(253, P1.join(" "));
  else {
    // sentence 3 selected: line 3 from "Small models" (x 451), line 4 whole, line 5 up to "came from."
    const sel = [[0, 0, 0], [0, 0, 0], [451, 720, 2], [0, 720, 3], [0, 97, 4]] as const;
    b.rect(vp, { x: X + 451, y: 253 + 60, w: 269, h: 30, fill: SEL_BLUE });
    b.rect(vp, { x: X, y: 253 + 90, w: 720, h: 30, fill: SEL_BLUE });
    b.rect(vp, { x: X, y: 253 + 120, w: 97, h: 30, fill: SEL_BLUE });
    P1.forEach((ln, i) => {
      const f = b.frame(vp, { x: X, y: 253 + i * 30, w: W, h: 30 });
      if (i === 2) { T(b, f, "the month. Lately that answer has started to wobble. ", { size: 18, c: ink, lh: 30 }); const t = b.frame(f, { x: 451, y: 0, w: 269, h: 30 }); T(b, t, "Small models now run on an", { size: 18, c: "#FFFFFF", lh: 30 }); }
      else T(b, f, ln, { size: 18, c: i > 2 ? "#FFFFFF" : ink, lh: 30 });
    });
  }
  para(421, "The appeal is simple. When the work happens on your own machine, it keeps working on a plane, in a tunnel, and long after a startup has changed its pricing. Nothing leaves the device, so there is nothing to leak. Speed stops depending on a data centre three time zones away.");
  para(559, "None of this is nostalgia. It is a bet that the best software is the kind that disappears into the task, and that it can only do so when it is fast, private and yours to keep.");
};
const filePage = (b: B, vp: Ref) => {
  T(b, b.frame(vp, { x: 8, y: 8, w: 600, h: 40 }), "Reading notes", { size: 32, weight: "Bold", c: "#000000", lh: 38, ff: "Times New Roman" });
  T(b, b.frame(vp, { x: 8, y: 60, w: 760, h: 80 }), "The quiet return of local-first software. Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.", { size: 16, c: "#000000", lh: 24, w: 760, ff: "Times New Roman" });
};
const extensionsPage = (b: B, vp: Ref) => {
  const top = b.row(vp, { x: 0, y: 0, w: 1278, h: 56, pad: [0, 24], gap: 16, fill: "#FFFFFF" });
  ic(b, top, "list", 20, "#5F6368"); T(b, top, "Extensions", { size: 22, c: "#202124", lh: 28, ff: "Segoe UI" });
  b.rect(vp, { x: 0, y: 56, w: 1278, h: 1, fill: "#DADCE0" });
  b.rect(vp, { x: 0, y: 57, w: 1278, h: 661, fill: "#F8F9FA" });
  const c = b.col(vp, { x: 160, y: 88, w: 958, gap: 16 });
  for (const [n, d] of [["Speak Kit", "Read web pages aloud with a voice that runs on this computer."], ["Reader Mode", "Strips pages down to the text."], ["Tab Notes", "Notes that stay with the tab."]]) {
    const r = b.row(c, { w: "fill", h: 112, pad: [16, 20], gap: 16, r: 8, fill: "#FFFFFF", stroke: "#DADCE0", sw: 1, sa: "inside", align: "start" });
    if (n === "Speak Kit") skLogo(b, r, 32); else b.rect(r, { w: 32, h: 32, r: 8, fill: "#E8EAED" });
    const t = b.col(r, { w: "fill", gap: 4 }); T(b, t, n, { size: 14, weight: "SemiBold", c: "#202124", lh: 20, ff: "Segoe UI", w: "fill" }); T(b, t, d, { size: 13, c: "#5F6368", lh: 18, ff: "Segoe UI", w: "fill" });
  }
};
const pdfPage = (b: B, vp: Ref) => {
  b.rect(vp, { x: 0, y: 0, w: 1278, h: 718, fill: "#525659" });
  const bar = b.row(vp, { x: 0, y: 0, w: 1278, h: 56, pad: [0, 16], gap: 16, fill: "#323639", justify: "spaceBetween", shadow: "sm" });
  T(b, bar, "annual-report-2026.pdf", { size: 14, c: "#E8EAED", lh: 20, ff: "Segoe UI" });
  T(b, bar, "1 / 12", { size: 13, c: "#E8EAED", lh: 18, ff: "Segoe UI" });
  const pg = b.col(vp, { x: 319, y: 80, w: 640, h: 900, pad: [48, 56], gap: 14, fill: "#FFFFFF", shadow: "lg" });
  T(b, pg, "Annual report 2026", { size: 28, weight: "SemiBold", c: "#202124", lh: 34, w: "fill" });
  for (let i = 0; i < 12; i++) b.rect(pg, { w: i % 5 === 4 ? 300 : "fill", h: 8, r: 4, fill: "#E8EAED" });
};
const CTX: Record<Ctx, { url: string; tab: string; fav?: string; page: (b: B, vp: Ref) => void }> = {
  article: { url: "reader.example.com/essays/local-first", tab: TITLE, page: (b, v) => article(b, v, false) },
  selection: { url: "reader.example.com/essays/local-first", tab: TITLE, page: (b, v) => article(b, v, true) },
  file: { url: "file:///C:/Users/maya/Documents/notes.html", tab: "notes.html", page: filePage },
  extensions: { url: "chrome://extensions", tab: "Extensions", fav: "E", page: extensionsPage },
  pdf: { url: "reader.example.com/files/annual-report-2026.pdf", tab: "annual-report-2026.pdf", page: pdfPage },
};

const build = (s: St): S => ({
  id: s.id, group: "A", title: s.title, note: s.note, w: 1440, h: 900,
  build: (b, _t, root) => {
    const cx = CTX[s.ctx];
    const c = chromeWin(b, root, { w: 1278, h: 799, x: 81, y: 40, backdrop: { w: 1440, h: 900 }, url: cx.url, tabTitle: cx.tab, favicon: cx.fav, extensionPopup: { h: s.h } });
    cx.page(b, c.viewport.ref);
    const pop = b.col(c.popup!.ref, { x: 0, y: 0, w: 360, h: s.h, gap: 0, fill: C.white });
    header(b, pop, s.pill[0], s.pill[1]);
    const msgView = ["A9", "A11", "A13", "A14", "A15", "A18", "A19", "A20", "A22"].includes(s.id);
    const bd = body(b, pop); b.add("node.set", { ids: [bd], sizingV: "fill" });
    s.draw(b, bd);
    const f = FOOT[s.id] ?? ["Runs on this computer", "Open app"];
    // footer is pinned to the bottom of the popup (pp-body is the only growing part)
    foot(b, pop, f[0], f[1]);
    void msgView;
  },
});

export const A_POPUP: S[] = STATES.map(build);
