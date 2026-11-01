import { B, Ref, O } from "./lib";

// Lumen components (spec: docs/lumen-components.md, extracted from the Lumen .figcraft). Geometry, strokes, states and icon sizes follow the file.
export type T = {
  mode: "light" | "dark"; bg: string; surface: string; surface2: string; border: string; text: string; text2: string; text3: string;
  accent: string; accentText: string; accentSoft: string; hlSent: string; hlWord: string; hlWordText: string;
  ok: string; okSoft: string; warn: string; warnSoft: string; err: string; errSoft: string; info: string; infoSoft: string; overlay: string; chrome: string; chrome2: string;
  // Lumen tokens that carry alpha or were missing: surface/editor, surface/raised, surface/input, stroke/control, fill/hover, fill/selected, accent/subtle, tag/purple, tag/yellow
  editor: string; raised: string; input: string; control: string; hover: string; selected: string; subtle: string; purple: string; yellow: string;
};
// Palette from the Lumen design system (variable collection "Lumen / Color"). bg = surface/window, surface = surface/card, border = stroke/divider.
export const LIGHT: T = {
  mode: "light", bg: "#F3F3F6", surface: "#FAFAFD", surface2: "#EBEBEE", border: "#E2E2E5", text: "#202020", text2: "#3B3B3B", text3: "#606060",
  accent: "#0069CC", accentText: "#FFFFFF", accentSoft: "#DCE9F7", hlSent: "#FFF1C2", hlWord: "#FFD24D", hlWordText: "#202020",
  ok: "#1A7F4B", okSoft: "#DFEBE8", warn: "#B35C00", warnSoft: "#F2E7DF", err: "#C62828", errSoft: "#F4E1E3", info: "#0A6ED1", infoSoft: "#DDE9F8", overlay: "#20202066",
  chrome: "#DEE1E6", chrome2: "#F1F3F4",
  editor: "#FFFFFF", raised: "#FFFFFF", input: "#FFFFFF", control: "#0000001A", hover: "#0000000F", selected: "#0000001C", subtle: "#0069CC1F", purple: "#7A4CD9", yellow: "#B8860B",
};
export const DARK: T = {
  mode: "dark", bg: "#191A1B", surface: "#1E1F20", surface2: "#252627", border: "#2A2B2C", text: "#E6E6E6", text2: "#BFBFBF", text3: "#8C8C8C",
  accent: "#0078D4", accentText: "#FFFFFF", accentSoft: "#124368", hlSent: "#433921", hlWord: "#F2C04E", hlWordText: "#121314",
  ok: "#4CC38A", okSoft: "#253931", warn: "#F5A524", warnSoft: "#403421", err: "#F2555A", errSoft: "#402829", info: "#4A9EFF", infoSoft: "#253344", overlay: "#000000A0",
  chrome: "#202124", chrome2: "#35363A",
  editor: "#121314", raised: "#252627", input: "#191A1B", control: "#FFFFFF14", hover: "#FFFFFF14", selected: "#FFFFFF21", subtle: "#0078D466", purple: "#A77BF3", yellow: "#F2C04E",
};

export type Tone = "ok" | "warn" | "err" | "info" | "neutral" | "accent";
export type St = "rest" | "hover" | "pressed" | "focus" | "disabled" | "loading";
const tone = (t: T, k: Tone) => ({ ok: [t.okSoft, t.ok], warn: [t.warnSoft, t.warn], err: [t.errSoft, t.err], info: [t.infoSoft, t.info], neutral: [t.surface2, t.text2], accent: [t.accentSoft, t.accent] }[k]);
/** token colour at paint opacity a (Lumen tints tag colours at 0.12-0.16) */
export const tint = (c: string, a: number) => c.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
/** icon size inside a square icon button: Lumen draws 16 px icons in 24..40 px buttons (14 below 28) */
const icoFor = (size: number) => (size < 28 ? 14 : 16);

export const logo = (b: B, t: T, p: Ref | undefined, size = 24, o: O = {}) => {
  const f = b.frame(p, { w: size, h: size, r: Math.round(size * 0.29 * 100) / 100, fill: t.accent, layout: "horizontal", align: "center", justify: "center", gap: Math.max(1.5, size * 0.07), ...o });
  [0.28, 0.5, 0.7, 0.42, 0.22].forEach((h) => b.rect(f, { w: Math.max(2, size * 0.08), h: size * h, r: size * 0.04, fill: t.accentText }));
  return f;
};

// ---------- button: 32 px (28 for toast/banner actions, 36 for primary/new-item buttons), pad 0/12, gap 6, r8, Inter Medium 13, 16 px icon ----------
export const btn = (b: B, t: T, p: Ref | undefined, label: string, o: { v?: "primary" | "secondary" | "ghost" | "danger" | "dangerOutline" | "soft"; icon?: string; sz?: "sm" | "md" | "dlg" | "lg"; w?: number | "fill"; iconRight?: string; disabled?: boolean; state?: St } = {}) => {
  const { v: v0 = "secondary", sz = "md", icon, iconRight, w, disabled } = o;
  const st: St = disabled ? "disabled" : o.state ?? "rest";
  const v = v0 === "soft" ? "secondary" : v0;
  const { h, fs, ic } = { sm: { h: 28, fs: 12, ic: 14 }, md: { h: 32, fs: 13, ic: 16 }, dlg: { h: 34, fs: 13, ic: 16 }, lg: { h: 36, fs: 13, ic: 16 } }[sz];
  const solid = v === "primary" || v === "danger";
  const base = v === "primary" ? t.accent : v === "danger" ? t.err : "none";
  const fill = solid ? (v === "primary" && st === "hover" ? t.info : base) : st === "hover" ? t.hover : st === "pressed" ? t.selected : "none";
  const fg = solid ? "#FFFFFF" : v === "secondary" ? t.text : v === "ghost" ? t.text2 : t.err;
  const ifg = solid ? "#FFFFFF" : v === "dangerOutline" ? t.err : t.text2;
  const stroke = st === "focus" ? t.accent : v === "secondary" ? t.control : v === "dangerOutline" ? t.err : undefined;
  const f = b.row(p, { h, w: w ?? "hug", pad: [0, sz === "sm" ? 10 : 12], gap: 6, r: 8, fill, justify: "center", stroke, sw: st === "focus" ? 2 : 1, sa: st === "focus" ? "outside" : "inside", opacity: st === "disabled" ? 0.4 : undefined });
  const lead = st === "loading" ? "loader" : icon;
  if (lead) b.icon(f, lead, ic, ifg);
  b.text(f, label, { size: fs, weight: "Medium", c: fg });
  if (iconRight) b.icon(f, iconRight, ic, ifg);
  return f;
};
// ---------- icon button: 32 square r8 (36/40 are circles in Lumen), 16 px icon centred, no padding ----------
export const iconBtn = (b: B, t: T, p: Ref | undefined, icon: string, o: { size?: number; bg?: string; c?: string; r?: number; ring?: boolean; sw?: number; state?: St } = {}) => {
  const { size = 32, c = t.text2, ring } = o;
  const st = o.state ?? "rest";
  const r = o.r ?? (size >= 36 ? size / 2 : 8);
  const bg = o.bg && o.bg !== "none" ? o.bg : st === "hover" ? t.hover : st === "pressed" ? t.selected : "none";
  const f = b.frame(p, { w: size, h: size, r, fill: bg, layout: "horizontal", align: "center", justify: "center", stroke: st === "focus" ? t.accent : ring ? t.control : undefined, sw: st === "focus" ? 2 : 1, sa: st === "focus" ? "outside" : "inside", opacity: st === "disabled" ? 0.4 : undefined });
  b.icon(f, st === "loading" ? "loader" : icon, icoFor(size), c);
  return f;
};
export const skip = (b: B, p: Ref | undefined, dir: "back" | "fwd", size: number, color: string) => b.icon(p, dir === "back" ? "back10" : "fwd10", size, color);
// ---------- status pill: 17 px, pad 0/8, gap 4, r999, 12 px icon, Inter Medium 11, tone fill at 0.16 ----------
export const badge = (b: B, t: T, p: Ref | undefined, label: string, k: Tone = "neutral", icon?: string) => {
  const [, fg] = tone(t, k);
  const f = b.row(p, { h: 17, pad: [0, 8], gap: 4, r: 999, fill: k === "neutral" ? t.selected : tint(fg, 0.16) });
  if (icon) b.icon(f, icon, 12, fg);
  b.text(f, label, { size: 11, weight: "Medium", c: fg });
  return f;
};
// ---------- chip: 21 px, pad 0/8, gap 5, r999, 1 px stroke/control, 12 px icon, Inter 11 text/secondary ----------
export const chip = (b: B, t: T, p: Ref | undefined, label: string, active = false, icon?: string) => {
  const f = b.row(p, { h: 21, pad: [0, 8], gap: 5, r: 999, fill: active ? t.selected : "none", stroke: t.control, sw: 1, sa: "inside" });
  if (icon) b.icon(f, icon, 12, active ? t.text : t.text2);
  b.text(f, label, { size: 11, weight: active ? "Medium" : "Regular", c: active ? t.text : t.text2 });
  return f;
};
// ---------- toggle (settings rows): 32x18, pad 2, knob 14; off = fill/selected + knob text/secondary, on = accent + white knob. No On/Off label in Lumen. ----------
export const toggle = (b: B, t: T, p: Ref | undefined, on: boolean, o: { disabled?: boolean } = {}) => {
  const f = b.row(p, { w: 32, h: 18, r: 999, fill: on ? t.accent : t.selected, pad: 2, gap: 0, justify: on ? "max" : "min", align: "center", opacity: o.disabled ? 0.4 : undefined });
  b.ellipse(f, { w: 14, h: 14, fill: on ? t.accentText : t.text2 });
  return f;
};
export const checkbox = (b: B, t: T, p: Ref | undefined, v: boolean | "mixed", o: { disabled?: boolean } = {}) => {
  const f = b.frame(p, { w: 18, h: 18, r: 4, fill: v ? t.accent : "none", stroke: v ? undefined : t.text2, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center", opacity: o.disabled ? 0.4 : undefined });
  if (v) b.icon(f, v === "mixed" ? "minus" : "check", 14, t.accentText);
  return f;
};
export const radio = (b: B, t: T, p: Ref | undefined, on: boolean, o: { disabled?: boolean } = {}) =>
  b.frame(p, { w: 18, h: 18, r: 999, stroke: on ? t.accent : t.text2, sw: on ? 5 : 1, sa: "inside", opacity: o.disabled ? 0.4 : undefined });
// ---------- progress: 4 px track r999 fill/hover, fill accent (Lumen has no slider; bar/slider below reuse the same tokens) ----------
export const progress = (b: B, t: T, p: Ref | undefined, v: number, o: { w?: number | "fill"; h?: number; c?: string } = {}) => {
  const { w = "fill", h = 4, c = t.accent } = o;
  const tr = b.frame(p, { w, h, r: 999, fill: t.hover, clip: true });
  const width = typeof w === "number" ? w * v : 300 * v;
  if (typeof w === "number") b.rect(tr, { x: 0, y: 0, w: width, h, fill: c });
  else b.rect(tr, { x: 0, y: 0, w: `${Math.round(v * 100)}%` as any, h, fill: c });
  return tr;
};
/** scrubber: NOT in Lumen (no slider node). Track 4 px like progress but fill/selected so it reads on a card, 12 px thumb. */
export const bar = (b: B, t: T, p: Ref | undefined, v: number, w: number, o: { h?: number; c?: string; knob?: boolean; track?: string } = {}) => {
  const { h = 4, c = t.accent, knob = true } = o; const track = o.track ?? (knob ? t.selected : t.hover);
  const H = knob ? 12 : h;
  const tr = b.frame(p, { w, h: H, layout: undefined });
  b.rect(tr, { x: 0, y: (H - h) / 2, w, h, r: 999, fill: track });
  b.rect(tr, { x: 0, y: (H - h) / 2, w: Math.max(h, w * v), h, r: 999, fill: c });
  if (knob) b.ellipse(tr, { x: Math.min(w - 12, Math.max(0, w * v - 6)), y: 0, w: 12, h: 12, fill: "#FFFFFF", stroke: t.control, sw: 1, shadow: "sm" });
  return tr;
};
export const slider = (b: B, t: T, p: Ref | undefined, v: number, w: number, o: { label?: string; min?: string; max?: string } = {}) => {
  const col = b.col(p, { gap: 4 });
  const tr = b.row(col, { gap: 14, align: "center" });
  bar(b, t, tr, v, w);
  if (o.label) b.text(tr, o.label, { size: 13, weight: "Medium", c: t.text, w: 40, ta: "right" });
  if (o.min || o.max) { const lr = b.row(col, { w, justify: "spaceBetween" }); b.text(lr, o.min ?? "", { size: 11, c: t.text3 }); b.text(lr, o.max ?? "", { size: 11, c: t.text3 }); }
  return col;
};
// ---------- text input: 36 px, pad 0/12, gap 8, r8, fill surface/input, 1 px stroke/control; hover stroke text/tertiary; focus accent 2 inside; error tag/red 1 inside + 11 px message ----------
export const input = (b: B, t: T, p: Ref | undefined, o: { value?: string; placeholder?: string; icon?: string; w?: number | "fill"; state?: "default" | "hover" | "focus" | "error" | "disabled"; h?: number; right?: string; msg?: string } = {}) => {
  const { value, placeholder, icon, w = "fill", state = "default", h = 36, right, msg } = o;
  const host = msg ? b.col(p, { w, gap: 8 }) : p;
  const f = b.row(host, { w: msg ? "fill" : w, h, pad: [0, 12], gap: 8, r: 8, fill: t.input, stroke: state === "focus" ? t.accent : state === "error" ? t.err : state === "hover" ? t.text3 : t.control, sw: state === "focus" ? 2 : 1, sa: "inside", opacity: state === "disabled" ? 0.4 : undefined });
  if (icon) b.icon(f, icon, 16, t.text3);
  b.text(f, value ?? placeholder ?? "", { size: 13, c: value ? t.text : t.text3, w: "fill" });
  if (right) b.text(f, right, { size: 12, c: t.text3 });
  if (msg) b.text(host, msg, { size: 11, c: t.err });
  return msg ? host! : f;
};
// ---------- select: 32 px, hug, pad 0/10, gap 6, r8, fill surface/input, 1 px stroke/control, value Inter 12, chevron-down 14 ----------
export const select = (b: B, t: T, p: Ref | undefined, value: string, w: number | "fill" | "hug" = "hug") => {
  const f = b.row(p, { w, h: 32, pad: [0, 10], gap: 6, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", justify: w === "hug" ? "min" : "spaceBetween" });
  b.text(f, value, { size: 12, c: t.text });
  b.icon(f, "down", 14, t.text3);
  return f;
};
// ---------- segmented (settings): container 34, r8, pad 3, gap 2, 1 px stroke/control; options 26, r6, pad 0/10, Inter Medium 12 ----------
export const seg = (b: B, t: T, p: Ref | undefined, items: string[], active: number) => {
  const f = b.row(p, { h: 34, pad: 3, gap: 2, r: 8, stroke: t.control, sw: 1, sa: "inside" });
  items.forEach((s, i) => {
    const c = b.row(f, { h: 26, pad: [0, 10], r: 6, fill: i === active ? t.selected : "none", justify: "center" });
    b.text(c, s, { size: 12, weight: "Medium", c: i === active ? t.text : t.text2 });
  });
  return f;
};
// ---------- tabs (underline): label + 2 px underline 8 px below, gap 20; active Inter SemiBold 13 text/primary + accent underline ----------
export const tabs = (b: B, t: T, p: Ref | undefined, items: string[], active: number) => {
  const f = b.row(p, { gap: 20, align: "start" });
  items.forEach((s, i) => { const c = b.col(f, { gap: 8, align: "start" }); b.text(c, s, { size: 13, weight: i === active ? "SemiBold" : "Regular", c: i === active ? t.text : t.text3 }); b.rect(c, { w: "fill", h: 2, fill: i === active ? t.accent : "none" }); });
  return f;
};
// ---------- keyboard key: 19 px high, pad 2/6, r4, 1 px stroke/control, no fill, Inter 11 text/tertiary, 4 px between keys ----------
// onAccent (key chip inside a primary button): text-on-accent colour and a 45% white border.
export const kbd = (b: B, t: T, p: Ref | undefined, keys: string[], onAccent = false) => {
  const f = b.row(p, { gap: 4 });
  keys.forEach((k) => { const c = b.row(f, { h: 19, pad: [0, 6], r: 4, stroke: onAccent ? "#FFFFFF73" : t.control, sw: 1, sa: "inside", justify: "center" }); b.text(c, k, { size: 11, c: onAccent ? t.accentText : t.text3 }); });
  return f;
};
export const divider = (b: B, t: T, p: Ref | undefined, vertical = false) => b.rect(p, vertical ? { w: 1, h: "fill", fill: t.border } : { w: "fill", h: 1, fill: t.border });
/** list card (settings): r12, fill surface/card, 1 px stroke/divider. */
export const card = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { fill: t.surface, r: 12, stroke: t.border, sw: 1, sa: "inside", pad: 16, gap: 12, ...o });
// ---------- avatar / favicon: circle in a tag colour, SemiBold initial at 42% (avatar) / 58% (favicon) of the diameter ----------
export const hue = ["#0069CC", "#7A4CD9", "#B35C00", "#1A7F4B", "#0A6ED1", "#C62828", "#B8860B"];
export const avatar = (b: B, t: T, p: Ref | undefined, name: string, size = 36, i = 0) => {
  const tags = [t.accent, t.purple, t.warn, t.ok, t.info, t.err, t.yellow];
  const f = b.frame(p, { w: size, h: size, r: 999, fill: tags[i % tags.length], layout: "horizontal", align: "center", justify: "center" });
  b.text(f, name.slice(0, 1).toUpperCase(), { size: size * 0.42, weight: "SemiBold", c: "#FFFFFF" });
  return f;
};
export const favicon = (b: B, t: T, p: Ref | undefined, letter: string, size = 16, color = t.ok) => {
  const f = b.frame(p, { w: size, h: size, r: 999, fill: color, layout: "horizontal", align: "center", justify: "center" });
  b.text(f, letter.slice(0, 1).toUpperCase(), { size: size * 0.58, weight: "SemiBold", c: "#FFFFFF" });
  return f;
};
export const waveform = (b: B, t: T, p: Ref | undefined, w: number, h: number, v: number, seed = 3) => {
  const f = b.row(p, { w, h, gap: 2, align: "center" });
  const n = Math.floor(w / 5);
  for (let i = 0; i < n; i++) {
    const a = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37 + seed) * Math.cos(i * 0.11 + seed * 2));
    b.rect(f, { w: 3, h: Math.max(3, Math.round(h * a)), r: 1.5, fill: i / n < v ? t.accent : t.selected });
  }
  return f;
};
export const spinner = (b: B, t: T, p: Ref | undefined, size = 16) => b.icon(p, "loader", size, t.accent);
// ---------- settings row: pad 11/0 inside the list card, gap 16; label Inter Medium 13 text/primary, description Inter 12 text/tertiary (17 px when it wraps), control at the right ----------
export const settingRow = (b: B, t: T, p: Ref | undefined, title: string, desc: string | undefined, control: (f: Ref) => void) => {
  const f = b.row(p, { w: "fill", gap: 16, pad: [11, 0], align: "center", justify: "spaceBetween" });
  const l = b.col(f, { gap: 2, w: "fill" });
  b.text(l, title, { size: 13, weight: "Medium", c: t.text });
  if (desc) b.text(l, desc, { size: 12, c: t.text3, w: "fill", lh: 17 });
  control(f);
  return f;
};
// ---------- toast: pad 10/12, gap 10, r10, fill surface/raised, 1 px stroke/control, overlay shadow; 16 px icon text/secondary (tones differ only by icon), Inter 13, optional 28 px action ----------
export const toast = (b: B, t: T, p: Ref | undefined, msg: string, k: Tone = "neutral", o: O & { action?: string; icon?: string } = {}) => {
  const { action, icon, ...rest } = o;
  const f = b.row(p, { pad: [10, 12], gap: 10, r: 10, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "lg", ...rest });
  b.icon(f, icon ?? (k === "err" ? "alertCircle" : k === "ok" ? "circleCheck" : "info"), 16, t.text2);
  b.text(f, msg, { size: 13, c: t.text, w: typeof rest.w === "number" ? "fill" : undefined });
  if (action) btn(b, t, f, action, { sz: "sm" });
  return f;
};
// ---------- tooltip: pad 5/8, gap 6, r6, fill surface/raised, 1 px stroke/control, Inter 12 text/primary, optional shortcut key (16 px, r4, Inter 10 text/tertiary) ----------
export const tooltip = (b: B, t: T, p: Ref | undefined, label: string, keys?: string, o: O = {}) => {
  const f = b.row(p, { pad: [5, 8], gap: 6, r: 6, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", ...o });
  b.text(f, label, { size: 12, c: t.text, w: typeof o.w === "number" ? "fill" : undefined, lh: typeof o.w === "number" ? 17 : undefined });
  if (keys) { const k = b.row(f, { h: 16, pad: [0, 5], r: 4, stroke: t.control, sw: 1, sa: "inside" }); b.text(k, keys, { size: 10, c: t.text3 }); }
  return f;
};
// ---------- menu: container pad 4, r10, fill surface/raised, 1 px stroke/control, menu shadow; item 30 px, pad 0/8, gap 10, r6, 16 px icon, Inter 13; hover/selected fill/hover; selected adds a 14 px check ----------
export const menu = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { pad: 4, gap: 0, r: 10, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "md", ...o });
export const menuItem = (b: B, t: T, p: Ref | undefined, label: string, o: { icon?: string; shortcut?: string; selected?: boolean; hover?: boolean; destructive?: boolean; disabled?: boolean; h?: number } = {}) => {
  const f = b.row(p, { w: "fill", h: o.h ?? 30, pad: [0, 8], gap: 10, r: 6, fill: o.selected || o.hover ? t.hover : "none", opacity: o.disabled ? 0.4 : undefined });
  if (o.icon) b.icon(f, o.icon, 16, o.destructive ? t.err : t.text2);
  b.text(f, label, { size: 13, c: o.destructive ? t.err : t.text, w: "fill" });
  if (o.shortcut) b.text(f, o.shortcut, { size: 11, c: t.text3 });
  if (o.selected) b.icon(f, "check", 14, t.text);
  return f;
};
// ---------- sidebar / settings nav item: 32 px, pad 0/10, gap 10, r6, 18 px icon, Inter 13; selected fill/selected + text/primary Medium, rest text/secondary Regular ----------
export const navItem = (b: B, t: T, p: Ref | undefined, label: string, icon: string, o: { selected?: boolean; badge?: string } = {}) => {
  const f = b.row(p, { w: "fill", h: 32, pad: [0, 10], gap: 10, r: 6, fill: o.selected ? t.selected : "none" });
  b.icon(f, icon, 18, o.selected ? t.text : t.text2);
  b.text(f, label, { size: 13, weight: o.selected ? "Medium" : "Regular", c: o.selected ? t.text : t.text2, w: "fill" });
  if (o.badge) { const g = b.row(f, { h: 15, pad: [0, 6], r: 999, fill: t.subtle }); b.text(g, o.badge, { size: 11, weight: "Medium", c: t.text }); }
  return f;
};
/** popover: r12, pad 16, gap 12, fill surface/raised, 1 px stroke/control, overlay shadow. */
export const popover = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { pad: 16, gap: 12, r: 12, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "lg", ...o });
/** dialog: r14, pad 20, gap 14, fill surface/raised, 1 px stroke/control, overlay shadow. Lumen draws no scrim; pass scrim to dim the window like the screens do. */
export const modal = (b: B, t: T, win: Ref, w: number, h: number | "hug", W = 1280, H = 800, scrim = false) => {
  if (scrim) b.rect(win, { abs: true, x: 0, y: 0, w: W, h: H, fill: t.overlay });
  return b.col(win, { abs: true, x: Math.round((W - w) / 2), y: 0, w, h: h === "hug" ? "hug" : h, fill: t.raised, r: 14, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg", gap: 14, pad: 20 } as any);
};

/** dialog shell used by the screens: r14, fill surface/raised, 1 px stroke/control, overlay shadow; head and foot carry the 20 px padding. */
export const dialogBox = (b: B, t: T, win: Ref, w: number, y: number, o: O = {}, W = 1280) =>
  b.col(win, { abs: true, x: Math.round((W - w) / 2), y, w, fill: t.raised, r: 14, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg", gap: 0, clip: true, ...o } as any);
/** dialog header: Inter SemiBold 16 title, optional 13/19 text/secondary body line, 28 px close button. */
export const dialogHead = (b: B, t: T, d: Ref, title: string, sub?: string, close = true) => {
  const h = b.row(d, { w: "fill", pad: [20, 20, 12, 20], gap: 12, justify: "spaceBetween", align: "start" });
  const l = b.col(h, { gap: 6, w: "fill" });
  b.text(l, title, { size: 16, weight: "SemiBold", c: t.text });
  if (sub) b.text(l, sub, { size: 13, c: t.text2, w: "fill", lh: 19 });
  if (close) iconBtn(b, t, h, "x", { size: 28 });
  return h;
};
/** dialog footer: right-aligned buttons (34 px, gap 8); optional note on the left. */
export const dialogFoot = (b: B, t: T, d: Ref, left: string | undefined, fn: (r: Ref) => void) => {
  const f = b.row(d, { w: "fill", pad: [12, 20, 20, 20], gap: 12, justify: "spaceBetween", clip: false });
  b.text(f, left ?? "", { size: 12, c: t.text3 });
  const r = b.row(f, { gap: 8, clip: false }); fn(r);
  return f;
};

// ---------- window / browser shells ----------
// Desktop shell (Lumen X15/X16): title bar 40 px (logo only, no name; sidebar toggle, back/forward, centered search 420x30 with Ctrl K chip, status pill, bell, window buttons),
// sidebar 248 px on the window surface (New reading, nav 32 px, RECENT, engine card, Settings), content = inset card (8 px, r10, surface/editor, 1 px divider).
export const SETTINGS_NAV: [string, string, string, string][] = [
  ["general", "General", "grid", "GENERAL"], ["playback", "Playback", "play", ""], ["pron", "Pronunciation", "type", ""],
  ["memory", "Memory and performance", "cpu", "ENGINE"], ["storage", "Storage and models", "hardDrive", ""],
  ["browser", "Browser integration", "globe", "BROWSER"], ["keys", "Shortcuts", "keyboard", ""],
  ["notify", "Notifications", "bell", "APP"], ["appearance", "Appearance", "palette", ""], ["startup", "Startup and tray", "power", ""], ["about", "About and updates", "info", ""],
];
export type Pill = { label: string; tone?: "ok" | "warn" | "err" | "info" | "neutral"; spinner?: boolean; icon?: string };
const titleBar = (b: B, t: T, win: Ref, w: number, o: { search: string; pill?: Pill; sidebarToggle?: boolean; bell?: boolean | "dot"; update?: boolean }) => {
  const tb = b.row(win, { w: "fill", h: 40, pad: [0, 0, 0, 12], gap: 6, justify: "spaceBetween", fill: t.bg });
  const l = b.row(tb, { gap: 8 }); logo(b, t, l, 18);
  if (o.sidebarToggle !== false) { iconBtn(b, t, l, "sidebar", { size: 28, c: t.text3 }); iconBtn(b, t, l, "arrowLeft", { size: 28, c: t.text3 }); iconBtn(b, t, l, "arrowRight", { size: 28, c: t.text3 }); }
  const sf = b.row(tb, { abs: true, x: Math.round((w - 420) / 2), y: 5, w: 420, h: 30, pad: [0, 10], gap: 8, r: 6, fill: t.input, stroke: t.control, sw: 1, sa: "inside" });
  b.icon(sf, "search", 14, t.text3); b.text(sf, o.search, { size: 12, c: t.text3, w: "fill" });
  const kc = b.row(sf, { h: 18, pad: [0, 6], r: 4, stroke: t.control, sw: 1, sa: "inside" }); b.text(kc, o.search.startsWith("Search settings") ? "Ctrl F" : "Ctrl K", { size: 10, c: t.text3 });
  const r = b.row(tb, { gap: 0, h: 40 });
  const g = b.row(r, { gap: 8, pad: [0, 6, 0, 0] });
  if (o.update) { const u = b.row(g, { h: 22, pad: [0, 10], gap: 6, r: 999, fill: tint(t.ok, 0.16) }); b.icon(u, "download", 12, t.ok); b.text(u, "Update ready · 1.1.0", { size: 11, weight: "Medium", c: t.ok }); }
  if (o.pill) { const p = o.pill; const k = p.tone ?? "neutral"; const fg = k === "ok" ? t.ok : k === "warn" ? t.warn : k === "err" ? t.err : k === "info" ? t.accent : t.text2;
    const pl = b.row(g, { h: 22, pad: [0, 10], gap: 6, r: 999, fill: k === "neutral" ? t.selected : tint(fg, 0.16) });
    if (p.spinner) b.icon(pl, "loader", 12, fg); else if (p.icon) b.icon(pl, p.icon, 12, fg); else b.ellipse(pl, { w: 6, h: 6, fill: fg });
    b.text(pl, p.label, { size: 11, weight: "Medium", c: fg }); }
  if (o.bell !== false) { const bl = iconBtn(b, t, g, "bell", { size: 28, c: t.text3 }); if (o.bell === "dot") b.ellipse(bl, { abs: true, x: 17, y: 5, w: 7, h: 7, fill: t.warn, stroke: t.bg, sw: 1.5 }); }
  const wbtn = (draw: (f: Ref) => void) => { const c = b.frame(r, { w: 46, h: 40, layout: "horizontal", align: "center", justify: "center" }); draw(c); };
  wbtn((c) => b.icon(c, "minus", 12, t.text2));
  wbtn((c) => b.frame(c, { w: 10, h: 10, r: 1, stroke: t.text2, sw: 1, sa: "inside" }));
  wbtn((c) => b.icon(c, "x", 12, t.text2));
  return tb;
};
export const desktopWindow = (b: B, t: T, root: Ref, o: { nav?: "home" | "library" | "voices" | "engines" | "settings" | "none"; w?: number; h?: number; status?: { label: string; sub: string; tone: "ok" | "warn" | "err" | "neutral" }; pill?: Pill | false; search?: string; update?: boolean; settingsKey?: string; settingsDot?: string; inset?: boolean; bell?: boolean | "dot"; rail?: boolean } = {}) => {
  const { nav = "library", w = 1280, h = 800 } = o;
  const win = b.col(root, { x: 0, y: 0, w, h, fill: t.bg, gap: 0, clip: true, r: 12, stroke: t.border, sw: 1, sa: "inside" });
  const isSet = nav === "settings";
  titleBar(b, t, win, w, { search: o.search ?? (isSet ? "Search settings" : "Search readings, voices and commands"), pill: o.pill === false ? undefined : o.pill ?? (o.status ? { label: o.status.label.split(" · ")[1] ?? o.status.label, tone: o.status.tone } : { label: "Kokoro ready", tone: "ok" }), update: o.update, bell: o.bell });
  b.rect(win, { w: "fill", h: 1, fill: t.bg });
  const body = b.row(win, { w: "fill", h: "fill", gap: 0, align: "stretch", pad: [0, 8, 8, 0] });
  if (nav !== "none" && o.rail) {
    const sb = b.col(body, { w: 60, h: "fill", pad: [4, 8, 12, 8], gap: 4, align: "center" });
    iconBtn(b, t, sb, "plus", { size: 36, bg: t.accent, c: "#FFFFFF" });
    b.frame(sb, { w: 1, h: 6 });
    [["home", "home"], ["library", "book"], ["voices", "mic"], ["engines", "cpu"]].forEach(([k2, ic]) => { const it = b.frame(sb, { w: 36, h: 32, r: 6, fill: k2 === nav ? t.selected : "none", layout: "horizontal", align: "center", justify: "center" }); b.icon(it, ic, 18, k2 === nav ? t.text : t.text2); });
    b.frame(sb, { w: 1, h: "fill" });
    const it = b.frame(sb, { w: 36, h: 32, r: 6, layout: "horizontal", align: "center", justify: "center" }); b.icon(it, "settings", 18, t.text2);
  } else if (nav !== "none") {
    const sb = b.col(body, { w: 248, h: "fill", pad: [4, 12, 12, 12], gap: 2, fill: "none" });
    if (isSet) {
      const bk = b.row(sb, { w: "fill", h: 32, pad: [0, 4], gap: 8 }); b.icon(bk, "arrowLeft", 18, t.text2); b.text(bk, "Settings", { size: 18, weight: "SemiBold", c: t.text });
      SETTINGS_NAV.forEach(([k, l, ic, grp]) => {
        if (grp) { const gl = b.row(sb, { w: "fill", h: 26, pad: [8, 10, 0, 10] }); b.text(gl, grp, { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5 }); }
        const it = b.row(sb, { w: "fill", h: 30, pad: [0, 10], gap: 10, r: 6, fill: (o.settingsKey ?? "general") === k ? t.selected : "none" });
        b.icon(it, ic, 16, (o.settingsKey ?? "general") === k ? t.text : t.text2);
        b.text(it, l, { size: 13, weight: (o.settingsKey ?? "general") === k ? "Medium" : "Regular", c: (o.settingsKey ?? "general") === k ? t.text : t.text2, w: "fill" });
        if (o.settingsDot === k) b.ellipse(it, { w: 8, h: 8, fill: t.accent });
      });
    } else {
      const nw = b.row(sb, { w: "fill", h: 36, pad: [0, 12], gap: 6, r: 8, fill: t.accent, justify: "center" });
      b.icon(nw, "plus", 16, "#FFFFFF"); b.text(nw, "New reading", { size: 13, weight: "Medium", c: "#FFFFFF", w: "fill" }); kbd(b, t, nw, ["Ctrl N"], true);
      b.frame(sb, { w: 1, h: 8 });
      const items: [string, string, string][] = [["home", "Home", "home"], ["library", "Library", "book"], ["voices", "Voices", "mic"], ["engines", "Engines", "cpu"]];
      items.forEach(([k, label, ic]) => navItem(b, t, sb, label, ic, { selected: k === nav }));
      const rl = b.row(sb, { w: "fill", h: 26, pad: [10, 10, 0, 10] }); b.text(rl, "RECENT", { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5 });
      ["The quiet return of local-first software", "Attention Is All You Need.pdf", "Meeting notes: Q4 planning", "Why on-device voices sound human"].forEach((s) => { const rr = b.row(sb, { w: "fill", h: 28, pad: [0, 10], r: 6 }); b.text(rr, s, { size: 13, c: t.text2, w: "fill", maxLines: 1 }); });
    }
    b.frame(sb, { w: "fill", h: "fill" });
    if (!isSet) {
      const st = card(b, t, sb, { pad: 12, gap: 6, r: 10, fill: t.surface, stroke: t.border });
      const sv = o.status ?? { label: "Kokoro-82M · Ready", sub: "CPU · 0.4x real time", tone: "ok" as const };
      const tc = sv.tone === "ok" ? t.ok : sv.tone === "warn" ? t.warn : sv.tone === "neutral" ? t.text3 : t.err;
      const r1 = b.row(st, { gap: 8 }); b.icon(r1, sv.tone === "ok" ? "circleCheck" : sv.tone === "neutral" ? "zzz" : "alertCircle", 16, tc); b.text(r1, sv.label, { size: 13, weight: "Medium", c: t.text });
      b.text(st, sv.sub, { size: 12, c: t.text2 });
      const r2 = b.row(st, { gap: 6 }); b.icon(r2, "lock", 12, t.ok); b.text(r2, "100% on this device", { size: 12, c: t.ok, weight: "Medium" });
      navItem(b, t, sb, "Settings", "settings");
    }
  }
  const main = b.col(body, { w: "fill", h: "fill", gap: 0, fill: t.editor, r: 10, stroke: t.border, sw: 1, sa: "inside", clip: true });
  return { win, main };
};

export const popupCanvas = (b: B, t: T, root: Ref, h: number, w = 520) => {
  const cv = b.frame(root, { x: 0, y: 0, w, h: h + 76, fill: t.mode === "dark" ? "#0B0A0A" : "#E9E5DE", clip: true, r: 12 });
  const bar = b.row(cv, { x: 0, y: 0, w, h: 44, fill: t.chrome, pad: [0, 12], gap: 8, justify: "max" });
  b.row(bar, { w: "fill", h: 28, pad: [0, 12], r: 14, fill: t.chrome2, gap: 6 });
  const ext = b.frame(bar, { w: 30, h: 30, r: 8, fill: t.mode === "dark" ? "#44464B" : "#C9CCD2", layout: "horizontal", align: "center", justify: "center" });
  logo(b, t, ext, 20);
  b.icon(bar, "moreV", 16, t.text3);
  const pop = b.col(cv, { x: w - 16 - 360, y: 52, w: 360, fill: t.raised, r: 12, stroke: t.control, sw: 1, sa: "inside", shadow: "lg", gap: 0, clip: true });
  return pop;
};

export const browser = (b: B, t: T, root: Ref, o: { url?: string; title?: string; w?: number; h?: number; ext?: boolean; reader?: boolean } = {}) => {
  const { url = "reader.example.com/essays/local-first", title = "The quiet return of local-first software", w = 1280, h = 800, ext = true } = o;
  const dk = t.mode === "dark";
  const win = b.col(root, { x: 0, y: 0, w, h, fill: t.surface, gap: 0, clip: true, r: 12, stroke: t.border, sw: 1 });
  const tabs = b.row(win, { w: "fill", h: 38, fill: t.chrome, pad: [8, 0, 0, 10], gap: 6, align: "end", justify: "spaceBetween" });
  const left = b.row(tabs, { gap: 6, align: "end" });
  const tab = b.row(left, { h: 30, w: 220, pad: [0, 12], gap: 8, r: [8, 8, 0, 0], fill: t.chrome2 });
  b.icon(tab, "globe", 14, t.text3); b.text(tab, title.slice(0, 24) + "...", { size: 12, c: dk ? "#E8EAED" : "#202124", w: "fill" }); b.icon(tab, "x", 12, t.text3);
  const plus = b.frame(left, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(plus, "plus", 14, t.text3);
  const caps = b.row(tabs, { h: 30, gap: 0, align: "center" });
  [["minus", 12], ["square", 12], ["x", 12]].forEach(([ic, sz]) => { const c = b.frame(caps, { w: 46, h: 30, layout: "horizontal", align: "center", justify: "center" }); b.icon(c, ic as string, sz as number, dk ? "#E8EAED" : "#3C4043"); });
  const tool = b.row(win, { w: "fill", h: 42, fill: t.chrome2, pad: [0, 12], gap: 12 });
  b.icon(tool, "arrowLeft", 16, t.text3); b.icon(tool, "arrowRight", 16, t.text3); b.icon(tool, "refresh", 16, t.text3);
  const addr = b.row(tool, { w: "fill", h: 30, r: 15, fill: dk ? "#202124" : "#FFFFFF", pad: [0, 14], gap: 8 });
  b.icon(addr, "lock", 12, t.text3); b.text(addr, url, { size: 12, c: dk ? "#E8EAED" : "#3C4043", w: "fill" });
  if (o.reader !== undefined) { const rb = b.frame(addr, { w: 24, h: 24, r: 6, fill: o.reader ? (dk ? "#FFFFFF21" : "#0000001C") : "none", layout: "horizontal", align: "center", justify: "center" }); b.icon(rb, "file", 16, dk ? "#E8EAED" : "#3C4043"); b.icon(addr, "star", 16, dk ? "#E8EAED" : "#3C4043"); }
  b.icon(tool, "puzzle", 16, t.text3);
  if (ext) { const e = b.frame(tool, { w: 30, h: 30, r: 8, fill: "none", layout: "horizontal", align: "center", justify: "center" }); logo(b, t, e, 20); }
  b.ellipse(tool, { w: 22, h: 22, fill: dk ? "#5F6368" : "#9AA0A6" });
  b.icon(tool, "moreV", 16, t.text3);
  return b.frame(win, { w: "fill", h: "fill", fill: dk ? "#17161A" : "#FFFFFF", clip: true });
};
// ---------- mock article with optional read-along highlight ----------
export const ARTICLE = {
  kicker: "ESSAY · 8 MIN READ",
  title: "The quiet return of local-first software",
  by: "Maya Okafor · October 28, 2026",
  paras: [
    "For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server, rented back to us by the month. Lately that answer has started to wobble. Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.",
    "The appeal is simple. When the work happens on your own machine, it keeps working on a plane, in a tunnel, and long after a startup has changed its pricing. Nothing leaves the device, so there is nothing to leak. Speed stops depending on a data centre three time zones away.",
    "None of this is nostalgia. It is a bet that the best software is the kind that disappears into the task, and that it can only do so when it is fast, private and yours to keep.",
  ],
};
const splitSentences = (s: string) => s.match(/[^.!?]+[.!?]+\s*/g) ?? [s];
// paragraph rendered word by word so a sentence and a word can be highlighted. hl = { sent, word }
export const para = (b: B, t: T, p: Ref | undefined, text: string, w: number, o: { size?: number; lh?: number; hl?: { sent: number; word: number } } = {}) => {
  const { size = 18, lh = 30, hl } = o;
  if (!hl) return b.text(p, text, { size, lh, c: t.text, w });
  const row = b.frame(p, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w, h: "hug", align: "start" });
  splitSentences(text).forEach((s, si) => {
    s.trim().split(/\s+/).forEach((word, wi) => {
      const inS = si === hl.sent; const cur = inS && wi === hl.word;
      const f = b.row(row, { h: lh, pad: [0, 5, 0, 0], gap: 0, fill: inS ? t.hlSent : "none", justify: "min" });
      const g = b.row(f, { h: lh - 6, pad: 0, r: 3, fill: cur ? t.hlWord : "none" });
      b.text(g, word, { size, lh: lh - 6, c: cur ? t.hlWordText : t.text });
    });
  });
  return row;
};
export const article = (b: B, t: T, p: Ref, o: { w?: number; hl?: { para: number; sent: number; word: number }; hover?: number; dim?: boolean; selection?: boolean } = {}) => {
  const { w = 720, hl, hover, selection } = o;
  const col = b.col(p, { x: 0, y: 0, w: 1280, h: 720, align: "center", pad: [56, 0], gap: 0, clip: false });
  const a = b.col(col, { w, gap: 18, clip: false });
  b.text(a, ARTICLE.kicker, { size: 12, weight: "SemiBold", c: t.accent, ls: 1 });
  b.text(a, ARTICLE.title, { size: 40, weight: "Bold", lh: 46, c: t.text, w });
  b.text(a, ARTICLE.by, { size: 14, c: t.text3 });
  b.rect(a, { w: "fill", h: 1, fill: t.border });
  ARTICLE.paras.forEach((tx, i) => {
    const wrap = b.frame(a, { layout: "horizontal", w, h: "hug", gap: 0, align: "start", clip: false, fill: hover === i ? t.accent + "12" : "none", r: 8 });
    if (hover === i) {
      const g = b.frame(wrap, { abs: true, x: -48, y: 2, w: 32, h: 32, r: 16, fill: t.accent, layout: "horizontal", align: "center", justify: "center", shadow: "lg" });
      b.icon(g, "play", 16, t.accentText);
      tooltip(b, { ...t, raised: "#1E1F20", text: "#FFFFFF", control: "#FFFFFF14" }, wrap, "Read from here", undefined, { abs: true, x: -48, y: 40 });
    }
    if (selection && i === 0) {
      const sw = b.frame(wrap, { layout: "vertical", w, h: "hug" });
      const row = b.frame(sw, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w, align: "start" });
      splitSentences(tx).forEach((s, si) => s.trim().split(/\s+/).forEach((word) => {
        const f = b.row(row, { h: 30, pad: [0, 5, 0, 0], fill: si === 1 || si === 2 ? "#B8D4FF" : "none" });
        b.text(f, word, { size: 18, lh: 30, c: t.mode === "dark" && (si === 1 || si === 2) ? "#0B1A33" : t.text });
      }));
    } else para(b, t, wrap, tx, w, { hl: hl && hl.para === i ? hl : undefined });
  });
  return col;
};

// Read-aloud pill (Lumen F5, id 46082): 649x52, r999, fill surface/raised dark #252627, 1 px #FFFFFF14, shadow 0 2 6 (6% light / 30% dark).
// previous (34) | play/pause 40 accent | next (34) | text 220 (11 px #BFBFBF over a 4 px track) | speed pill 54x30 | voice pill 151x30 | close 30. Always dark, on light and dark pages.
export type DockState = "idle" | "playing" | "paused" | "loading" | "error" | "done" | "unloaded" | "waking";
export const PILL = { fill: "#252627", line: "#FFFFFF14", text: "#E6E6E6", dim: "#BFBFBF" };
export const dock = (b: B, t: T, p: Ref | undefined, state: DockState, o: O & { para?: string; speed?: string; voice?: string; pct?: number } = {}) => {
  const { para, speed = "1.25×", voice = "Heart · on device", pct, ...rest } = o;
  const f = b.row(p, { h: 52, pad: [0, 11, 0, 15], gap: 10, r: 999, fill: PILL.fill, stroke: PILL.line, sw: 1, sa: "inside", shadow: "lg", ...rest });
  const ib = (ic: string, size: number, dimmed = false) => { const x = b.frame(f, { w: size, h: size, r: 999, layout: "horizontal", align: "center", justify: "center", opacity: dimmed ? 0.4 : undefined }); b.icon(x, ic, 16, PILL.dim); return x; };
  if (state === "error") {
    b.icon(f, "alertCircle", 16, "#FF9A8F");
    const x = b.col(f, { gap: 1 }); b.text(x, "Speak Kit isn't running", { size: 12, weight: "Medium", c: PILL.text }); b.text(x, "Your page is untouched. Start the app to read it.", { size: 11, c: PILL.dim });
    const sp = b.frame(f, { w: 24, h: 1 });
    btn(b, t, f, "Open Speak Kit", { v: "primary", sz: "sm" });
    const rt = b.row(f, { h: 30, pad: [0, 12], r: 999, stroke: PILL.line, sw: 1, sa: "inside" }); b.text(rt, "Retry", { size: 12, weight: "Medium", c: PILL.text });
    ib("x", 30);
    return f;
  }
  const off = state === "loading" || state === "waking";
  ib("undo", 34, off);
  const pb = b.frame(f, { w: 40, h: 40, r: 999, fill: t.mode === "dark" ? "#0078D4" : "#0078D4", layout: "horizontal", align: "center", justify: "center" });
  b.icon(pb, off ? "loader" : state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 16, "#FFFFFF");
  ib("arrowRight", 34, off || state === "done");
  const mid = b.col(f, { gap: 6, w: 220 });
  const label = { idle: "Read this page · 14 paragraphs · 9 min", playing: para ?? "Paragraph 2 of 14 · 9 min left", paused: "Paused · Paragraph 2 of 14", loading: "Preparing paragraph 2…", done: "Done · 14 of 14 · Read again", unloaded: "Engine asleep · wakes on play", waking: "Waking the engine · about 2 s" }[state];
  const lr = b.row(mid, { gap: 5 });
  if (state === "unloaded") b.icon(lr, "zzz", 12, PILL.dim);
  b.text(lr, label, { size: 11, c: PILL.dim });
  const v = pct ?? { idle: 0, playing: 0.14, paused: 0.14, loading: 0.1, done: 1, unloaded: 0, waking: 0 }[state];
  const tr = b.frame(mid, { w: 220, h: 4, r: 999, fill: PILL.line, clip: true });
  if (state === "loading" || state === "waking") b.rect(tr, { x: 70, y: 0, w: 80, h: 4, r: 999, fill: "#0078D4" });
  else if (v > 0) b.rect(tr, { x: 0, y: 0, w: 220 * v, h: 4, fill: "#0078D4" });
  const sp = b.row(f, { w: 54, h: 30, r: 999, stroke: PILL.line, sw: 1, sa: "inside", justify: "center" }); b.text(sp, speed, { size: 12, weight: "Medium", c: PILL.text });
  const vc = b.row(f, { h: 30, pad: [0, 10], gap: 6, r: 999 }); b.icon(vc, "volume", 16, PILL.dim); b.text(vc, voice, { size: 12, c: PILL.text }); b.icon(vc, "down", 14, PILL.dim);
  ib("x", 30);
  return f;
};
/** Reading popover (F5 "Reader options"): 236 wide, r12, pad 15, fill #252627, header 12 semibold #8C8C8C, segmented 28 px, rows 12 px, toggle row. */
export const readingPopover = (b: B, t: T, p: Ref | undefined, o: O & { font?: number; theme?: string; width?: string; size?: string; highlight?: boolean } = {}) => {
  const { font = 1, theme = "Paper", width = "Medium", size = "19", highlight = true, ...rest } = o;
  const f = b.col(p, { w: 236, pad: 15, gap: 10, r: 12, fill: PILL.fill, stroke: PILL.line, sw: 1, sa: "inside", shadow: "lg", ...rest });
  b.text(f, "Reading", { size: 12, weight: "SemiBold", c: "#8C8C8C" });
  const sg = b.row(f, { w: "fill", gap: 6 });
  ["Sans", "Serif", "Dyslexic"].forEach((s, i) => { const x = b.row(sg, { w: "fill", h: 28, r: 6, fill: i === font ? "#FFFFFF21" : "none", stroke: i === font ? undefined : PILL.line, sw: 1, sa: "inside", justify: "center" }); b.text(x, s, { size: 12, c: PILL.text }); });
  ([["Size", size], ["Width", width], ["Theme", theme]] as const).forEach(([a, v]) => { const r = b.row(f, { w: "fill", justify: "spaceBetween" }); b.text(r, a, { size: 12, c: PILL.dim }); b.text(r, v, { size: 12, c: PILL.text }); });
  const tr = b.row(f, { w: "fill", justify: "spaceBetween", gap: 6 });
  const tl = b.row(tr, { gap: 6 }); b.icon(tl, "wave", 14, "#0078D4"); b.text(tl, "Highlight sentence", { size: 12, c: PILL.text });
  const tg = b.row(tr, { w: 30, h: 16, r: 999, fill: highlight ? "#0078D4" : "#FFFFFF21", pad: 2, justify: highlight ? "max" : "min", align: "center" }); b.ellipse(tg, { w: 12, h: 12, fill: "#FFFFFF" });
  return f;
};

export const playerBar = (b: B, t: T, p: Ref | undefined, state: "playing" | "paused" | "loading" | "done" = "playing", o: { title?: string; sub?: string; elapsed?: string; total?: string; pct?: number; disabled?: boolean; sleep?: string } = {}) => {
  const { title = "The quiet return of local-first software", sub = "Heart · Kokoro-82M", elapsed = "2:27", total = "6:48", pct = 0.36, disabled = false, sleep } = o;
  const f = b.row(p, { w: "fill", h: 84, pad: [0, 24], gap: 24, fill: t.surface, justify: "spaceBetween", opacity: disabled ? 0.4 : undefined });
  const l = b.row(f, { gap: 12, w: 320 });
  const cov = b.frame(l, { w: 44, h: 44, r: 10, fill: t.subtle, layout: "horizontal", align: "center", justify: "center" }); b.icon(cov, "headphones", 18, t.accent);
  const lt = b.col(l, { gap: 2, w: "fill" }); b.text(lt, title, { size: 13, weight: "Medium", c: t.text, w: "fill", maxLines: 1 }); b.text(lt, sub, { size: 12, c: t.text3 });
  const c = b.col(f, { gap: 8, align: "center", w: 520 });
  const ctr = b.row(c, { gap: 12 });
  iconBtn(b, t, ctr, "skipBack", { size: 32, c: t.text2 }); iconBtn(b, t, ctr, "back10", { size: 32, c: t.text });
  const pb = b.frame(ctr, { w: 44, h: 44, r: 22, fill: t.accent, layout: "horizontal", align: "center", justify: "center" });
  b.icon(pb, state === "loading" ? "loader" : state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 18, t.accentText);
  iconBtn(b, t, ctr, "fwd10", { size: 32, c: t.text }); iconBtn(b, t, ctr, "skipFwd", { size: 32, c: t.text2 });
  const tl = b.row(c, { gap: 10, w: "fill" });
  b.text(tl, state === "done" ? total : elapsed, { size: 12, c: t.text3, mono: true }); bar(b, t, tl, state === "done" ? 1 : pct, 400, { knob: true }); b.text(tl, total, { size: 12, c: t.text3, mono: true });
  const r = b.row(f, { gap: 4, w: 320, justify: "max" });
  const sp = b.row(r, { h: 32, pad: [0, 12], r: 8, fill: t.selected }); b.text(sp, "1.2x", { size: 13, weight: "Medium", c: t.text });
  if (sleep) { const sl = b.row(r, { h: 32, pad: [0, 10], gap: 6, r: 8, fill: t.subtle }); b.icon(sl, "moon", 16, t.accent); b.text(sl, sleep, { size: 12, weight: "Medium", c: t.accent, mono: true }); } else iconBtn(b, t, r, "moon", { size: 32, c: t.text2 });
  iconBtn(b, t, r, "volume", { size: 32, c: t.text2 }); iconBtn(b, t, r, "playlist", { size: 32, c: t.text2 });
  return f;
};
export const pageHeader = (b: B, t: T, p: Ref, title: string, sub?: string, right?: (f: Ref) => void) => {
  const f = b.row(p, { w: "fill", pad: [28, 32, 8, 32], justify: "spaceBetween", align: "end" });
  const l = b.col(f, { gap: 4 }); b.text(l, title, { size: 22, weight: "SemiBold", c: t.text }); if (sub) b.text(l, sub, { size: 13, c: t.text3 });
  if (right) right(b.row(f, { gap: 8 }));
  return f;
};
