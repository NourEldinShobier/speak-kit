import { B, Ref, O } from "./lib";

// Lumen components (spec: docs/lumen-components.md, extracted from the Lumen .figcraft). Geometry, strokes, states and icon sizes follow the file.
export type T = {
  bg: string; surface: string; surface2: string; border: string; text: string; text2: string; text3: string;
  accent: string; accentText: string; accentSoft: string; hlSent: string; hlWord: string; hlWordText: string;
  ok: string; okSoft: string; warn: string; warnSoft: string; err: string; errSoft: string; info: string; infoSoft: string; overlay: string; chrome: string; chrome2: string;
  // Lockix tokens: surface-panel/raised/input, stroke-control, fill-hover/selected/pressed, accent-subtle, tag-purple/yellow
  editor: string; raised: string; input: string; control: string; hover: string; selected: string; subtle: string; purple: string; yellow: string;
  // Lockix additions: cta (the near-black primary), ctaText, stroke-field (off switch, checkbox, radio), tray, well, pressed, destructive, dots, chip grey, track, icon
  cta: string; ctaText: string; field: string; tray: string; well: string; pressed: string; destructive: string; dotGreen: string; dotOrange: string; dotRed: string; dotBlue: string; chipGray: string; track: string; icon: string; iconQuiet: string; placeholder: string; focusField: string;
};
// Palette from docs/lockix-design-system.md (Lockix light values). bg = surface-window, surface = surface-card (white), border = stroke-divider.
export const LIGHT: T = {
  bg: "#F0F0F0", surface: "#FFFFFF", surface2: "#F5F5F5", border: "#EBEBEB", text: "#1B2230", text2: "#475467", text3: "#5F6A7D",
  accent: "#0069CC", accentText: "#FFFFFF", accentSoft: "#E0EDF9", hlSent: "#FFF1C2", hlWord: "#FFD24D", hlWordText: "#1B2230",
  ok: "#17693D", okSoft: "#D5F3E0", warn: "#9A5200", warnSoft: "#FFEBCF", err: "#A61B1B", errSoft: "#FFE4E5", info: "#0B5CAD", infoSoft: "#DAEFFE", overlay: "#1B223052",
  chrome: "#DEE1E6", chrome2: "#F1F3F4",
  editor: "#FFFFFF", raised: "#FFFFFF", input: "#FFFFFF", control: "#E5E5E5", hover: "#0000000A", selected: "#F0F0F0", subtle: "#0069CC1F", purple: "#7A4CD9", yellow: "#B8860B",
  cta: "#201E25", ctaText: "#FAFAFA", field: "#C3C6CC", tray: "#F4F4F4", well: "#F5F5F5", pressed: "#00000012", destructive: "#C62828",
  dotGreen: "#05C283", dotOrange: "#FD9812", dotRed: "#F24349", dotBlue: "#2E9FF1", chipGray: "#F0F0F0", track: "#F0F0F0", icon: "#667085", iconQuiet: "#737373", placeholder: "#6B7280", focusField: "#171717",
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

// ---------- button (Lockix): 36 px default, 28 sm, 24 xs, 40 xl (dialog footers); r8 (xs r6), pad 0/14 (sm 12, xs 8, xl 18), gap 6, Inter Medium 13, 16 px icon (sm 14, xs 12) ----------
// primary = cta (#201E25 fill, no border, cta shadow); secondary = outline (white, 1 px stroke-control, control shadow); ghost; danger = destructive (10% red tint, red text; hover 20%).
export const btn = (b: B, t: T, p: Ref | undefined, label: string, o: { v?: "primary" | "secondary" | "ghost" | "danger" | "dangerOutline" | "soft"; icon?: string; sz?: "xs" | "sm" | "md" | "dlg" | "lg" | "xl"; w?: number | "fill"; iconRight?: string; disabled?: boolean; state?: St } = {}) => {
  const { v: v0 = "secondary", sz = "md", icon, iconRight, w, disabled } = o;
  const st: St = disabled ? "disabled" : o.state ?? "rest";
  const v = v0 === "soft" ? "secondary" : v0 === "dangerOutline" ? "danger" : v0;
  const { h, fs, ic, px } = { xs: { h: 24, fs: 12, ic: 12, px: 8 }, sm: { h: 28, fs: 13, ic: 14, px: 12 }, md: { h: 36, fs: 13, ic: 16, px: 14 }, dlg: { h: 40, fs: 13, ic: 16, px: 18 }, xl: { h: 40, fs: 13, ic: 16, px: 18 }, lg: { h: 36, fs: 13, ic: 16, px: 14 } }[sz];
  const hov = st === "hover", prs = st === "pressed";
  const fill = v === "primary" ? (hov ? tint(t.cta, 0.9) : prs ? tint(t.cta, 0.8) : t.cta)
    : v === "secondary" ? (hov ? "#F7F8FA" : prs ? "#F0F0F0" : "#FFFFFF")
    : v === "danger" ? tint(t.destructive, hov || prs ? 0.2 : 0.1)
    : hov ? t.hover : prs ? t.pressed : "none";
  const fg = v === "primary" ? t.ctaText : v === "secondary" ? "#171717" : v === "ghost" ? (hov || prs ? t.text : t.text2) : t.destructive;
  const ifg = v === "primary" ? t.ctaText : v === "danger" ? t.destructive : t.text2;
  const focus = st === "focus";
  const stroke = focus && v !== "primary" ? (v === "danger" ? tint(t.destructive, 0.4) : t.accent) : v === "secondary" ? t.control : undefined;
  const shadow = focus && v === "primary" ? "focusCta" : v === "primary" ? "cta" : v === "secondary" ? "ctl" : undefined;
  const f = b.row(p, { h, w: w ?? "hug", pad: [0, px], gap: 6, r: sz === "xs" ? 6 : 8, fill, justify: "center", stroke, sw: 1, sa: "inside", opacity: st === "disabled" ? 0.5 : undefined, shadow });
  const lead = st === "loading" ? "loader" : icon;
  if (lead) b.icon(f, lead, ic, ifg);
  b.text(f, label, { size: fs, weight: "Medium", c: fg, ls: -0.13 });
  if (iconRight) b.icon(f, iconRight, ic, ifg);
  return f;
};
// ---------- icon button: 36 / 28 / 24 square r8 (24: r6), ghost; icon 16 (14 below 28) in text-secondary ----------
export const iconBtn = (b: B, t: T, p: Ref | undefined, icon: string, o: { size?: number; bg?: string; c?: string; r?: number; ring?: boolean; sw?: number; state?: St } = {}) => {
  const { size = 32, c = t.text2, ring } = o;
  const st = o.state ?? "rest";
  const r = o.r ?? (size <= 24 ? 6 : 8);
  const bg = o.bg && o.bg !== "none" ? o.bg : st === "hover" ? t.hover : st === "pressed" ? t.pressed : "none";
  const f = b.frame(p, { w: size, h: size, r, fill: bg, layout: "horizontal", align: "center", justify: "center", stroke: st === "focus" ? t.accent : ring ? t.control : undefined, sw: 1, sa: "inside", opacity: st === "disabled" ? 0.5 : undefined });
  b.icon(f, st === "loading" ? "loader" : icon, icoFor(size), c);
  return f;
};
export const skip = (b: B, p: Ref | undefined, dir: "back" | "fwd", size: number, color: string) => b.icon(p, dir === "back" ? "back10" : "fwd10", size, color);
// ---------- status pill (Lockix): 20 px, pad 0/7, gap 4, pill, 12 px icon, Inter Medium 12 (11.5 in Lockix); fill chip-*, text tag-*; red adds a 1 px inset ring at 55%; grey = chip-gray / text-secondary ----------
export const badge = (b: B, t: T, p: Ref | undefined, label: string, k: Tone = "neutral", icon?: string) => {
  const [bgc, fg] = k === "neutral" || k === "accent" ? [t.chipGray, t.text2] : tone(t, k);
  const f = b.row(p, { h: 20, pad: [0, 7], gap: 4, r: 999, fill: bgc, stroke: k === "err" ? tint(t.err, 0.55) : undefined, sw: 1, sa: "inside" });
  if (icon) b.icon(f, icon, 12, fg);
  b.text(f, label, { size: 12, weight: "Medium", c: fg });
  return f;
};
// ---------- chip: 22 px, pad 0/8, gap 5, pill, 1 px stroke-control, 12 px icon, Inter 12 text-secondary; active = fill-selected ----------
export const chip = (b: B, t: T, p: Ref | undefined, label: string, active = false, icon?: string) => {
  const f = b.row(p, { h: 22, pad: [0, 8], gap: 5, r: 999, fill: active ? t.selected : "none", stroke: t.control, sw: 1, sa: "inside" });
  if (icon) b.icon(f, icon, 12, active ? t.text : t.text2);
  b.text(f, label, { size: 12, weight: active ? "Medium" : "Regular", c: active ? t.text : t.text2 });
  return f;
};
// ---------- switch (Lockix): 32x20, pad 2, knob 16 white with control shadow. Off: track stroke-control with an inset 1 px stroke-field ring; on: cta. Disabled is opaque: off #ECEDEF + knob #C9CCD2, on #B7B9BF ----------
export const toggle = (b: B, t: T, p: Ref | undefined, on: boolean, o: { disabled?: boolean } = {}) => {
  const d = o.disabled;
  const f = b.row(p, { w: 32, h: 20, r: 999, fill: d ? (on ? "#B7B9BF" : "#ECEDEF") : on ? t.cta : t.control, stroke: on || d ? undefined : t.field, sw: 1, sa: "inside", pad: 2, gap: 0, justify: on ? "max" : "min", align: "center" });
  b.ellipse(f, { w: 16, h: 16, fill: d && !on ? "#C9CCD2" : "#FFFFFF", shadow: d ? undefined : "ctl" });
  return f;
};
// ---------- checkbox / radio (Lockix): 16 px, 1 px stroke-field, checkbox r5; checked = cta fill and border with a #FAFAFA glyph (check 12 px, stroke 2; radio dot 8 px). Disabled: off border #D5D7DB, on fill #B7B9BF ----------
export const checkbox = (b: B, t: T, p: Ref | undefined, v: boolean | "mixed", o: { disabled?: boolean } = {}) => {
  const d = o.disabled;
  const f = b.frame(p, { w: 16, h: 16, r: 5, fill: v ? (d ? "#B7B9BF" : t.cta) : "none", stroke: v ? (d ? undefined : t.cta) : d ? "#D5D7DB" : t.field, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
  if (v) b.icon(f, v === "mixed" ? "minus" : "check", 12, t.ctaText, { sw: 2 });
  return f;
};
export const radio = (b: B, t: T, p: Ref | undefined, on: boolean, o: { disabled?: boolean } = {}) => {
  const d = o.disabled;
  const f = b.frame(p, { w: 16, h: 16, r: 999, fill: on ? (d ? "#B7B9BF" : t.cta) : "none", stroke: on ? (d ? undefined : t.cta) : d ? "#D5D7DB" : t.field, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
  if (on) b.ellipse(f, { w: 8, h: 8, fill: t.ctaText });
  return f;
};
// ---------- progress: 4 px track (Lockix track #F0F0F0), fill accent ----------
export const progress = (b: B, t: T, p: Ref | undefined, v: number, o: { w?: number | "fill"; h?: number; c?: string } = {}) => {
  const { w = "fill", h = 4, c = t.accent } = o;
  const tr = b.frame(p, { w, h, r: 999, fill: t.track, clip: true });
  const width = typeof w === "number" ? w * v : 300 * v;
  if (typeof w === "number") b.rect(tr, { x: 0, y: 0, w: width, h, fill: c });
  else b.rect(tr, { x: 0, y: 0, w: `${Math.round(v * 100)}%` as any, h, fill: c });
  return tr;
};
/** scrubber / slider: track 5 px #F0F0F0, accent range, 14 px thumb white with a stroke-field ring and the control shadow. */
export const bar = (b: B, t: T, p: Ref | undefined, v: number, w: number, o: { h?: number; c?: string; knob?: boolean; track?: string } = {}) => {
  const { h = 5, c = t.accent, knob = true } = o; const track = o.track ?? t.track;
  const H = knob ? 14 : h;
  const tr = b.frame(p, { w, h: H, layout: undefined });
  b.rect(tr, { x: 0, y: (H - h) / 2, w, h, r: 999, fill: track });
  b.rect(tr, { x: 0, y: (H - h) / 2, w: Math.max(h, w * v), h, r: 999, fill: c });
  if (knob) b.ellipse(tr, { x: Math.min(w - 14, Math.max(0, w * v - 7)), y: 0, w: 14, h: 14, fill: "#FFFFFF", stroke: t.field, sw: 1, sa: "inside", shadow: "ctl" });
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
// ---------- text input (Lockix): 36 px, pad 0/12, gap 8, r8, white, 1 px stroke-control + control shadow, placeholder #6B7280; focus = 2 px #171717 inside, no halo; error = destructive; disabled = control fill at 50% ----------
export const input = (b: B, t: T, p: Ref | undefined, o: { value?: string; placeholder?: string; icon?: string; w?: number | "fill"; state?: "default" | "hover" | "focus" | "error" | "disabled"; h?: number; right?: string; msg?: string } = {}) => {
  const { value, placeholder, icon, w = "fill", state = "default", h = 36, right, msg } = o;
  const host = msg ? b.col(p, { w, gap: 8 }) : p;
  const f = b.row(host, { w: msg ? "fill" : w, h, pad: [0, 12], gap: 8, r: 8, fill: state === "disabled" ? t.control : t.input, stroke: state === "focus" ? t.focusField : state === "error" ? t.destructive : state === "hover" ? t.field : t.control, sw: state === "focus" ? 2 : 1, sa: "inside", opacity: state === "disabled" ? 0.5 : undefined, shadow: state === "focus" ? undefined : "ctl" });
  if (icon) b.icon(f, icon, 16, t.text3);
  b.text(f, value ?? placeholder ?? "", { size: 13, c: value ? t.text : t.placeholder, w: "fill", ls: -0.13 });
  if (right) b.text(f, right, { size: 12, c: t.text3 });
  if (msg) b.text(host, msg, { size: 11, c: t.err });
  return msg ? host! : f;
};
// ---------- select trigger (Lockix): 36 px (sm 28), hug, pad 0/12, gap 6, r8, white, 1 px stroke-control + control shadow, value Inter 13, chevron 16 text-tertiary ----------
export const select = (b: B, t: T, p: Ref | undefined, value: string, w: number | "fill" | "hug" = "hug") => {
  const f = b.row(p, { w, h: 36, pad: [0, 12], gap: 6, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", justify: w === "hug" ? "min" : "spaceBetween", shadow: "ctl" });
  b.text(f, value, { size: 13, c: t.text, ls: -0.13 });
  b.icon(f, "down", 16, t.text3);
  return f;
};
// ---------- segmented (Lockix md): track 36 (sm 28), r8, pad 2, gap 2, fill #F0F0F0; items 32 (sm 24) r6, pad 0/12, Inter 14 (sm 13) #5F6A7D; selected = white, 1 px stroke-control, control shadow, #171717 weight 500 ----------
export const seg = (b: B, t: T, p: Ref | undefined, items: string[], active: number, sm = false) => {
  const f = b.row(p, { h: sm ? 28 : 36, pad: 2, gap: sm ? 0 : 2, r: 8, fill: t.selected });
  items.forEach((s, i) => {
    const on = i === active;
    const c = b.row(f, { h: sm ? 24 : 32, pad: [0, sm ? 10 : 12], r: 6, fill: on ? "#FFFFFF" : "none", stroke: on ? t.control : undefined, sw: 1, sa: "inside", justify: "center", shadow: on ? "ctl" : undefined });
    b.text(c, s, { size: sm ? 13 : 14, weight: on ? "Medium" : "Regular", c: on ? "#171717" : t.text3 });
  });
  return f;
};
// ---------- tabs (underline): label + 2 px underline 8 px below, gap 20; active Inter SemiBold 13 text/primary + accent underline (selection stays accent) ----------
export const tabs = (b: B, t: T, p: Ref | undefined, items: string[], active: number) => {
  const f = b.row(p, { gap: 20, align: "start" });
  items.forEach((s, i) => { const c = b.col(f, { gap: 8, align: "start" }); b.text(c, s, { size: 13, weight: i === active ? "SemiBold" : "Regular", c: i === active ? t.text : t.text3 }); b.rect(c, { w: "fill", h: 2, fill: i === active ? t.accent : "none" }); });
  return f;
};
// ---------- keyboard key: 19 px high, pad 2/6, r4, 1 px stroke-control, no fill, Inter 11 text-tertiary, 4 px between keys ----------
// onAccent (key chip inside a primary button): cta text colour and a 45% white border.
export const kbd = (b: B, t: T, p: Ref | undefined, keys: string[], onAccent = false) => {
  const f = b.row(p, { gap: 4 });
  keys.forEach((k) => { const c = b.row(f, { h: 19, pad: [0, 6], r: 4, stroke: onAccent ? "#FFFFFF73" : t.control, sw: 1, sa: "inside", justify: "center" }); b.text(c, k, { size: 11, c: onAccent ? t.ctaText : t.text3 }); });
  return f;
};
export const divider = (b: B, t: T, p: Ref | undefined, vertical = false) => b.rect(p, vertical ? { w: 1, h: "fill", fill: t.border } : { w: "fill", h: 1, fill: t.border });
/** list card (Lockix): r10, white, card-ring shadow (1 px #EBEBEB + 0 1 2 5%); rows divide with 1 px #F0F0F0. */
export const card = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { fill: t.surface, r: 10, shadow: "ring", pad: 16, gap: 12, ...o });
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
// ---------- toast (Lockix): pad 10/12, gap 10, r12, white, popover shadow (ring + 0 2 6), 16 px icon text-secondary, Inter 13, optional 28 px ghost action ----------
export const toast = (b: B, t: T, p: Ref | undefined, msg: string, k: Tone = "neutral", o: O & { action?: string; icon?: string } = {}) => {
  const { action, icon, ...rest } = o;
  const f = b.row(p, { pad: [10, 12], gap: 10, r: 12, fill: t.raised, shadow: "lg", ...rest });
  b.icon(f, icon ?? (k === "err" ? "alertCircle" : k === "ok" ? "circleCheck" : "info"), 16, k === "err" ? t.destructive : t.text2);
  b.text(f, msg, { size: 13, weight: "Medium", c: t.text, w: typeof rest.w === "number" ? "fill" : undefined });
  if (action) btn(b, t, f, action, { sz: "sm", v: "ghost" });
  return f;
};
// ---------- tooltip (Lockix): fill #1B2230, text #F0F0F0, r6, pad 6/12, gap 6, Inter 12 (28 high), optional shortcut key ----------
export const tooltip = (b: B, t: T, p: Ref | undefined, label: string, keys?: string, o: O = {}) => {
  const f = b.row(p, { pad: [6, 12], gap: 6, r: 6, fill: "#1B2230", ...o });
  b.text(f, label, { size: 12, c: "#F0F0F0", w: typeof o.w === "number" ? "fill" : undefined, lh: typeof o.w === "number" ? 16 : undefined });
  if (keys) { const k = b.row(f, { h: 16, pad: [0, 5], r: 4, stroke: "#FFFFFF40", sw: 1, sa: "inside" }); b.text(k, keys, { size: 10, c: "#D0D5DD" }); }
  return f;
};
// ---------- menu (Lockix): pad 4, r10, white, 1 px stroke-control, menu shadow 0 1 2; item 28 px, pad 0/6, gap 6, r8, 16 px icon #667085, Inter 14; hover/selected fill-hover; destructive #C62828 with a 10% red highlight ----------
export const menu = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { pad: 4, gap: 0, r: 10, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "md", ...o });
export const menuItem = (b: B, t: T, p: Ref | undefined, label: string, o: { icon?: string; shortcut?: string; selected?: boolean; hover?: boolean; destructive?: boolean; disabled?: boolean; h?: number } = {}) => {
  const f = b.row(p, { w: "fill", h: o.h ?? 28, pad: [0, 6], gap: 6, r: 8, fill: o.selected || o.hover ? (o.destructive ? tint(t.destructive, 0.1) : t.hover) : "none", opacity: o.disabled ? 0.5 : undefined });
  if (o.icon) b.icon(f, o.icon, 16, o.destructive ? t.destructive : t.icon);
  b.text(f, label, { size: 14, c: o.destructive ? t.destructive : t.text, w: "fill" });
  if (o.shortcut) b.text(f, o.shortcut, { size: 12, c: t.text3 });
  if (o.selected) b.icon(f, "check", 14, t.text);
  return f;
};
// ---------- nav item (Lockix): 36 px, pad 0/10, gap 10, r8, 18 px icon, Inter 13; selected = #F0F0F0 + text Medium, rest text-secondary ----------
export const navItem = (b: B, t: T, p: Ref | undefined, label: string, icon: string, o: { selected?: boolean; badge?: string } = {}) => {
  const f = b.row(p, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 8, fill: o.selected ? t.selected : "none" });
  b.icon(f, icon, 18, o.selected ? t.text : t.text2);
  b.text(f, label, { size: 13, weight: o.selected ? "Medium" : "Regular", c: o.selected ? t.text : t.text2, w: "fill" });
  if (o.badge) { const g = b.row(f, { h: 20, pad: [0, 7], r: 999, fill: t.chipGray }); b.text(g, o.badge, { size: 12, c: t.text3 }); }
  return f;
};
/** popover (Lockix): r12, pad 16, gap 12, white, popover shadow (1 px ring + 0 2 6). */
export const popover = (b: B, t: T, p: Ref | undefined, o: O = {}) => b.col(p, { pad: 16, gap: 12, r: 12, fill: t.raised, shadow: "lg", ...o });
/** dialog (Lockix): r16, pad 16, gap 14, white, dialog shadow (ring + 0 4 12). Pass scrim to dim the window (scrim rgb(27 34 48 / .32)). */
export const modal = (b: B, t: T, win: Ref, w: number, h: number | "hug", W = 1280, H = 800, scrim = false) => {
  if (scrim) b.rect(win, { abs: true, x: 0, y: 0, w: W, h: H, fill: t.overlay });
  return b.col(win, { abs: true, x: Math.round((W - w) / 2), y: 0, w, h: h === "hug" ? "hug" : h, fill: t.raised, r: 16, shadow: "dlg", gap: 14, pad: 16 } as any);
};

/** dialog shell used by the screens: r16, white, dialog shadow; head and foot carry the 16 px padding. */
export const dialogBox = (b: B, t: T, win: Ref, w: number, y: number, o: O = {}, W = 1280) =>
  b.col(win, { abs: true, x: Math.round((W - w) / 2), y, w, fill: t.raised, r: 16, shadow: "dlg", gap: 0, clip: true, ...o } as any);
/** dialog header: Inter SemiBold 15 title, optional 13/19 text-tertiary body line, 24 px ghost close button. */
export const dialogHead = (b: B, t: T, d: Ref, title: string, sub?: string, close = true) => {
  const h = b.row(d, { w: "fill", pad: [16, 16, 8, 16], gap: 12, justify: "spaceBetween", align: "start" });
  const l = b.col(h, { gap: 6, w: "fill" });
  b.text(l, title, { size: 15, weight: "SemiBold", c: t.text });
  if (sub) b.text(l, sub, { size: 13, c: t.text3, w: "fill", lh: 19 });
  if (close) iconBtn(b, t, h, "x", { size: 24 });
  return h;
};
/** dialog footer: right-aligned buttons (xl 40 px, gap 8); optional note on the left. */
export const dialogFoot = (b: B, t: T, d: Ref, left: string | undefined, fn: (r: Ref) => void) => {
  const f = b.row(d, { w: "fill", pad: [8, 16, 16, 16], gap: 12, justify: "spaceBetween", clip: false });
  b.text(f, left ?? "", { size: 12, c: t.text3 });
  const r = b.row(f, { gap: 8, clip: false }); fn(r);
  return f;
};

// ---------- window / browser shells ----------
// Desktop shell (Lumen X15/X16): title bar 40 px (no logo or name; sidebar toggle, back/forward, centered search 420x30 with Ctrl K chip, status pill, bell, window buttons),
// sidebar 248 px on the window surface (New reading, nav 32 px, RECENT, engine card, Settings), content = inset card (8 px, r10, surface/editor, 1 px divider).
export const SETTINGS_NAV: [string, string, string, string][] = [
  ["general", "General", "grid", "GENERAL"], ["playback", "Playback", "play", ""], ["pron", "Pronunciation", "type", ""],
  ["memory", "Memory and performance", "cpu", "ENGINE"], ["storage", "Storage and models", "hardDrive", ""],
  ["browser", "Browser integration", "globe", "BROWSER"], ["keys", "Shortcuts", "keyboard", ""],
  ["notify", "Notifications", "bell", "APP"], ["appearance", "Appearance", "palette", ""], ["startup", "Startup and tray", "power", ""], ["about", "About and updates", "info", ""],
];
export type Pill = { label: string; tone?: "ok" | "warn" | "err" | "info" | "neutral"; spinner?: boolean; icon?: string };
const titleBar = (b: B, t: T, win: Ref, w: number, o: { search: string; pill?: Pill; sidebarToggle?: boolean; bell?: boolean | "dot"; update?: boolean }) => {
  const tb = b.row(win, { w: "fill", h: 36, pad: [0, 0, 0, 8], gap: 6, justify: "spaceBetween", fill: t.bg });
  const l = b.row(tb, { gap: 8 });
  if (o.sidebarToggle !== false) { iconBtn(b, t, l, "sidebar", { size: 28, c: t.text2 }); iconBtn(b, t, l, "arrowLeft", { size: 28, c: t.text2 }); iconBtn(b, t, l, "arrowRight", { size: 28, c: t.text2 }); }
  const sf = b.row(tb, { abs: true, x: Math.round((w - 420) / 2), y: 4, w: 420, h: 28, pad: [0, 10], gap: 8, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", shadow: "ctl" });
  b.icon(sf, "search", 14, t.text3); b.text(sf, o.search, { size: 12, c: t.placeholder, w: "fill" });
  const kc = b.row(sf, { h: 18, pad: [0, 6], r: 4, stroke: t.control, sw: 1, sa: "inside" }); b.text(kc, o.search.startsWith("Search settings") ? "Ctrl F" : "Ctrl K", { size: 10, c: t.text3 });
  const r = b.row(tb, { gap: 0, h: 36 });
  const g = b.row(r, { gap: 8, pad: [0, 6, 0, 0] });
  if (o.update) { const u = b.row(g, { h: 20, pad: [0, 8], gap: 6, r: 999, fill: t.okSoft }); b.icon(u, "download", 12, t.ok); b.text(u, "Update ready · 1.1.0", { size: 11, weight: "Medium", c: t.ok }); }
  if (o.pill) { const p = o.pill; const k = p.tone ?? "neutral"; const fg = k === "ok" ? t.ok : k === "warn" ? t.warn : k === "err" ? t.err : k === "info" ? t.info : t.text2;
    const pl = b.row(g, { h: 20, pad: [0, 8], gap: 6, r: 999, fill: k === "ok" ? t.okSoft : k === "warn" ? t.warnSoft : k === "err" ? t.errSoft : k === "info" ? t.infoSoft : t.chipGray });
    if (p.spinner) b.icon(pl, "loader", 12, fg); else if (p.icon) b.icon(pl, p.icon, 12, fg); else b.ellipse(pl, { w: 6, h: 6, fill: fg });
    b.text(pl, p.label, { size: 11, weight: "Medium", c: fg }); }
  if (o.bell !== false) { const bl = iconBtn(b, t, g, "bell", { size: 28, c: t.text3 }); if (o.bell === "dot") b.ellipse(bl, { abs: true, x: 17, y: 5, w: 7, h: 7, fill: t.dotOrange, stroke: t.bg, sw: 1.5 }); }
  const wbtn = (draw: (f: Ref) => void) => { const c = b.frame(r, { w: 36, h: 36, layout: "horizontal", align: "center", justify: "center" }); draw(c); };
  wbtn((c) => b.icon(c, "minus", 12, t.text2));
  wbtn((c) => b.frame(c, { w: 10, h: 10, r: 1, stroke: t.text2, sw: 1, sa: "inside" }));
  wbtn((c) => b.icon(c, "x", 12, t.text2));
  return tb;
};
export const desktopWindow = (b: B, t: T, root: Ref, o: { nav?: "home" | "library" | "voices" | "engines" | "settings" | "none"; w?: number; h?: number; status?: { label: string; sub: string; tone: "ok" | "warn" | "err" | "neutral" }; pill?: Pill | false; search?: string; update?: boolean; settingsKey?: string; settingsDot?: string; inset?: boolean; bell?: boolean | "dot"; rail?: boolean } = {}) => {
  const { nav = "library", w = 1280, h = 800 } = o;
  const win = b.col(root, { x: 0, y: 0, w, h, fill: t.bg, gap: 0, clip: true, r: 8, stroke: t.control, sw: 1, sa: "inside" });
  const isSet = nav === "settings";
  titleBar(b, t, win, w, { search: o.search ?? (isSet ? "Search settings" : "Search readings, voices and commands"), pill: o.pill === false ? undefined : o.pill ?? (o.status ? { label: o.status.label.split(" · ")[1] ?? o.status.label, tone: o.status.tone } : { label: "Kokoro ready", tone: "ok" }), update: o.update, bell: o.bell });
  b.rect(win, { w: "fill", h: 1, fill: t.bg });
  // Lockix: the panel is 8 px from the right edge, 4 from the left and ends on a 28 px footer band (bottom 0 here).
  const body = b.row(win, { w: "fill", h: "fill", gap: 8, align: "stretch", pad: [0, 8, 0, 4] });
  if (nav !== "none" && o.rail) {
    const sb = b.col(body, { w: 56, h: "fill", pad: [8, 10, 12, 10], gap: 4, align: "center", fill: t.surface, r: 14, shadow: "card" });
    iconBtn(b, t, sb, "plus", { size: 36, bg: t.cta, c: t.ctaText });
    b.frame(sb, { w: 1, h: 6 });
    [["home", "home"], ["library", "book"], ["voices", "mic"], ["engines", "cpu"]].forEach(([k2, ic]) => { const it = b.frame(sb, { w: 36, h: 36, r: 8, fill: k2 === nav ? t.selected : "none", layout: "horizontal", align: "center", justify: "center" }); b.icon(it, ic, 18, k2 === nav ? t.text : t.text2); });
    b.frame(sb, { w: 1, h: "fill" });
    const it = b.frame(sb, { w: 36, h: 36, r: 8, layout: "horizontal", align: "center", justify: "center" }); b.icon(it, "settings", 18, t.text2);
  } else if (nav !== "none") {
    const sb = b.col(body, { w: 250, h: "fill", pad: [12, 12, 12, 12], gap: 2, fill: t.surface, r: 14, shadow: "card" });
    if (isSet) {
      const bk = b.row(sb, { w: "fill", h: 32, pad: [0, 4], gap: 8 }); b.icon(bk, "arrowLeft", 18, t.text2); b.text(bk, "Settings", { size: 18, weight: "SemiBold", c: t.text });
      SETTINGS_NAV.forEach(([k, l, ic, grp]) => {
        if (grp) { const gl = b.row(sb, { w: "fill", h: 26, pad: [8, 10, 0, 10] }); b.text(gl, grp, { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5 }); }
        const it = b.row(sb, { w: "fill", h: 32, pad: [0, 10], gap: 10, r: 8, fill: (o.settingsKey ?? "general") === k ? t.selected : "none" });
        b.icon(it, ic, 16, (o.settingsKey ?? "general") === k ? t.text : t.text2);
        b.text(it, l, { size: 13, weight: (o.settingsKey ?? "general") === k ? "Medium" : "Regular", c: (o.settingsKey ?? "general") === k ? t.text : t.text2, w: "fill" });
        if (o.settingsDot === k) b.ellipse(it, { w: 8, h: 8, fill: t.dotBlue });
      });
    } else {
      const nw = b.row(sb, { w: "fill", h: 36, pad: [0, 12], gap: 6, r: 8, fill: t.cta, justify: "center", shadow: "cta" });
      b.icon(nw, "plus", 16, t.ctaText); b.text(nw, "New reading", { size: 13, weight: "Medium", c: t.ctaText, w: "fill" }); kbd(b, t, nw, ["Ctrl N"], true);
      b.frame(sb, { w: 1, h: 8 });
      const items: [string, string, string][] = [["home", "Home", "home"], ["library", "Library", "book"], ["voices", "Voices", "mic"], ["engines", "Engines", "cpu"]];
      items.forEach(([k, label, ic]) => navItem(b, t, sb, label, ic, { selected: k === nav }));
      const rl = b.row(sb, { w: "fill", h: 26, pad: [10, 10, 0, 10] }); b.text(rl, "RECENT", { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5 });
      ["The quiet return of local-first software", "Attention Is All You Need.pdf", "Meeting notes: Q4 planning", "Why on-device voices sound human"].forEach((s) => { const rr = b.row(sb, { w: "fill", h: 28, pad: [0, 10], r: 8 }); b.text(rr, s, { size: 13, c: t.text2, w: "fill", maxLines: 1 }); });
    }
    b.frame(sb, { w: "fill", h: "fill" });
    if (!isSet) {
      const st = card(b, t, sb, { pad: 12, gap: 6, r: 10, fill: t.well, shadow: undefined });
      const sv = o.status ?? { label: "Kokoro-82M · Ready", sub: "CPU · 0.4x real time", tone: "ok" as const };
      const tc = sv.tone === "ok" ? t.ok : sv.tone === "warn" ? t.warn : sv.tone === "neutral" ? t.text3 : t.err;
      const r1 = b.row(st, { gap: 8 }); b.icon(r1, sv.tone === "ok" ? "circleCheck" : sv.tone === "neutral" ? "zzz" : "alertCircle", 16, tc); b.text(r1, sv.label, { size: 13, weight: "Medium", c: t.text });
      b.text(st, sv.sub, { size: 12, c: t.text2 });
      const r2 = b.row(st, { gap: 6 }); b.icon(r2, "lock", 12, t.ok); b.text(r2, "100% on this device", { size: 12, c: t.ok, weight: "Medium" });
      navItem(b, t, sb, "Settings", "settings");
    }
  }
  const main = b.col(body, { w: "fill", h: "fill", gap: 0, fill: t.editor, r: 14, shadow: "card", clip: true });
  // Footer band 28 px: right-aligned status line, 12 px muted, 1 px dividers (code: Footer.tsx).
  const ft = b.row(win, { w: "fill", h: 28, pad: [0, 14], gap: 10, align: "center", justify: "max" });
  const sv = o.status;
  const eng = !sv || sv.tone === "ok" ? "Kokoro ready" : sv.tone === "neutral" ? "Voice engine asleep" : sv.label.split(" · ").pop()!;
  ["" + eng, "Voice: Heart", "3 readings"].forEach((s, i) => { if (i) b.rect(ft, { w: 1, h: 12, fill: t.field }); b.text(ft, s, { size: 12, c: t.text3 }); });
  return { win, main };
};

export const popupCanvas = (b: B, t: T, root: Ref, h: number, w = 520) => {
  const cv = b.frame(root, { x: 0, y: 0, w, h: h + 76, fill: "#E9E5DE", clip: true, r: 12 });
  const bar = b.row(cv, { x: 0, y: 0, w, h: 44, fill: t.chrome, pad: [0, 12], gap: 8, justify: "max" });
  b.row(bar, { w: "fill", h: 28, pad: [0, 12], r: 14, fill: t.chrome2, gap: 6 });
  const ext = b.frame(bar, { w: 30, h: 30, r: 8, fill: "#C9CCD2", layout: "horizontal", align: "center", justify: "center" });
  logo(b, t, ext, 20);
  b.icon(bar, "moreV", 16, t.text3);
  const pop = b.col(cv, { x: w - 16 - 360, y: 52, w: 360, fill: t.raised, r: 12, shadow: "lg", gap: 0, clip: true });
  return pop;
};

export const browser = (b: B, t: T, root: Ref, o: { url?: string; title?: string; w?: number; h?: number; ext?: boolean; reader?: boolean; dark?: boolean } = {}) => {
  // o.dark: the browser shows a dark WEBSITE (host page, not a Speak Kit theme); the Chrome frame stays light, only the page body turns dark.
  const { url = "reader.example.com/essays/local-first", title = "The quiet return of local-first software", w = 1280, h = 800, ext = true } = o;
  const win = b.col(root, { x: 0, y: 0, w, h, fill: t.surface, gap: 0, clip: true, r: 12, stroke: t.border, sw: 1 });
  const tabs = b.row(win, { w: "fill", h: 38, fill: t.chrome, pad: [8, 0, 0, 10], gap: 6, align: "end", justify: "spaceBetween" });
  const left = b.row(tabs, { gap: 6, align: "end" });
  const tab = b.row(left, { h: 30, w: 220, pad: [0, 12], gap: 8, r: [8, 8, 0, 0], fill: t.chrome2 });
  b.icon(tab, "globe", 14, t.text3); b.text(tab, title.slice(0, 24) + "...", { size: 12, c: "#202124", w: "fill" }); b.icon(tab, "x", 12, t.text3);
  const plus = b.frame(left, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(plus, "plus", 14, t.text3);
  const caps = b.row(tabs, { h: 30, gap: 0, align: "center" });
  [["minus", 12], ["square", 12], ["x", 12]].forEach(([ic, sz]) => { const c = b.frame(caps, { w: 46, h: 30, layout: "horizontal", align: "center", justify: "center" }); b.icon(c, ic as string, sz as number, "#3C4043"); });
  const tool = b.row(win, { w: "fill", h: 42, fill: t.chrome2, pad: [0, 12], gap: 12 });
  b.icon(tool, "arrowLeft", 16, t.text3); b.icon(tool, "arrowRight", 16, t.text3); b.icon(tool, "refresh", 16, t.text3);
  const addr = b.row(tool, { w: "fill", h: 30, r: 15, fill: "#FFFFFF", pad: [0, 14], gap: 8 });
  b.icon(addr, "lock", 12, t.text3); b.text(addr, url, { size: 12, c: "#3C4043", w: "fill" });
  if (o.reader !== undefined) { const rb = b.frame(addr, { w: 24, h: 24, r: 6, fill: o.reader ? "#0000001C" : "none", layout: "horizontal", align: "center", justify: "center" }); b.icon(rb, "file", 16, "#3C4043"); b.icon(addr, "star", 16, "#3C4043"); }
  b.icon(tool, "puzzle", 16, t.text3);
  if (ext) { const e = b.frame(tool, { w: 30, h: 30, r: 8, fill: "none", layout: "horizontal", align: "center", justify: "center" }); logo(b, t, e, 20); }
  b.ellipse(tool, { w: 22, h: 22, fill: "#9AA0A6" });
  b.icon(tool, "moreV", 16, t.text3);
  return b.frame(win, { w: "fill", h: "fill", fill: o.dark ? "#17161A" : "#FFFFFF", clip: true });
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
    const wrap = b.frame(a, { layout: "horizontal", w, h: "hug", gap: 0, align: "start", clip: false, fill: hover === i ? t.hover : "none", r: 8 });
    if (hover === i) {
      const g = b.frame(wrap, { abs: true, x: -36, y: 4, w: 24, h: 24, r: 6, fill: t.surface, layout: "horizontal", align: "center", justify: "center", shadow: "lg" });
      b.icon(g, "play", 14, t.text);
      tooltip(b, t, wrap, "Read from here", undefined, { abs: true, x: -48, y: 36 });
    }
    if (selection && i === 0) {
      const sw = b.frame(wrap, { layout: "vertical", w, h: "hug" });
      const row = b.frame(sw, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w, align: "start" });
      splitSentences(tx).forEach((s, si) => s.trim().split(/\s+/).forEach((word) => {
        const f = b.row(row, { h: 30, pad: [0, 5, 0, 0], fill: si === 1 || si === 2 ? "#B8D4FF" : "none" });
        b.text(f, word, { size: 18, lh: 30, c: t.text });
      }));
    } else para(b, t, wrap, tx, w, { hl: hl && hl.para === i ? hl : undefined });
  });
  return col;
};

// Read-aloud pill (Lumen F5 geometry, Lockix look): 649x52, pill, white, popover shadow (1 px ring + 0 2 6). White stays readable over a dark host page.
// previous (34) | play/pause 40 cta (black circle, #FAFAFA glyph, cta shadow) | next (34) | text 220 (11 px text-tertiary over a 4 px track) | speed pill 54x30 | voice pill 151x30 | close 30.
export type DockState = "idle" | "playing" | "paused" | "loading" | "error" | "done" | "unloaded" | "waking";
export const PILL = { fill: "#FFFFFF", line: "#E5E5E5", text: "#1B2230", dim: "#5F6A7D", hover: "#0000000A", track: "#F0F0F0", accent: "#0069CC", err: "#A61B1B" };
export const dock = (b: B, t: T, p: Ref | undefined, state: DockState, o: O & { para?: string; speed?: string; voice?: string; pct?: number } = {}) => {
  const { para, speed = "1.25×", voice = "Heart · on device", pct, ...rest } = o;
  const f = b.row(p, { h: 52, pad: [0, 11, 0, 15], gap: 10, r: 999, fill: PILL.fill, shadow: "lg", ...rest });
  const ib = (ic: string, size: number, dimmed = false) => { const x = b.frame(f, { w: size, h: size, r: 999, layout: "horizontal", align: "center", justify: "center", opacity: dimmed ? 0.5 : undefined }); b.icon(x, ic, 16, PILL.dim); return x; };
  if (state === "error") {
    b.icon(f, "alertCircle", 16, PILL.err);
    const x = b.col(f, { gap: 1 }); b.text(x, "Speak Kit isn't running", { size: 12, weight: "Medium", c: PILL.text }); b.text(x, "Your page is untouched. Start the app to read it.", { size: 11, c: PILL.dim });
    const sp = b.frame(f, { w: 24, h: 1 });
    btn(b, t, f, "Open Speak Kit", { v: "primary", sz: "sm" });
    const rt = b.row(f, { h: 28, pad: [0, 12], r: 8, stroke: PILL.line, sw: 1, sa: "inside", justify: "center", shadow: "ctl" }); b.text(rt, "Retry", { size: 12, weight: "Medium", c: PILL.text });
    ib("x", 30);
    return f;
  }
  const off = state === "loading" || state === "waking";
  ib("undo", 34, off);
  const pb = b.frame(f, { w: 40, h: 40, r: 999, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" });
  b.icon(pb, off ? "loader" : state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 16, t.ctaText);
  ib("arrowRight", 34, off || state === "done");
  const mid = b.col(f, { gap: 6, w: 220 });
  const label = { idle: "Read this page · 14 paragraphs · 9 min", playing: para ?? "Paragraph 2 of 14 · 9 min left", paused: "Paused · Paragraph 2 of 14", loading: "Preparing paragraph 2…", done: "Done · 14 of 14 · Read again", unloaded: "Engine asleep · wakes on play", waking: "Waking the engine · about 2 s" }[state];
  const lr = b.row(mid, { gap: 5 });
  if (state === "unloaded") b.icon(lr, "zzz", 12, PILL.dim);
  b.text(lr, label, { size: 11, c: PILL.dim });
  const v = pct ?? { idle: 0, playing: 0.14, paused: 0.14, loading: 0.1, done: 1, unloaded: 0, waking: 0 }[state];
  const tr = b.frame(mid, { w: 220, h: 4, r: 999, fill: PILL.track, clip: true });
  if (state === "loading" || state === "waking") b.rect(tr, { x: 70, y: 0, w: 80, h: 4, r: 999, fill: PILL.accent });
  else if (v > 0) b.rect(tr, { x: 0, y: 0, w: 220 * v, h: 4, fill: PILL.accent });
  const sp = b.row(f, { w: 54, h: 30, r: 8, stroke: PILL.line, sw: 1, sa: "inside", justify: "center", shadow: "ctl" }); b.text(sp, speed, { size: 12, weight: "Medium", c: PILL.text });
  const vc = b.row(f, { h: 30, pad: [0, 10], gap: 6, r: 8 }); b.icon(vc, "volume", 16, PILL.dim); b.text(vc, voice, { size: 12, c: PILL.text }); b.icon(vc, "down", 14, PILL.dim);
  ib("x", 30);
  return f;
};
/** Reading popover (F5 "Reader options"): 236 wide, r12, pad 15, white popover, header 12 semibold text-tertiary, segmented 28 px (Lockix sm), rows 12 px, switch row. */
export const readingPopover = (b: B, t: T, p: Ref | undefined, o: O & { font?: number; theme?: string; width?: string; size?: string; highlight?: boolean } = {}) => {
  const { font = 1, theme = "Paper", width = "Medium", size = "19", highlight = true, ...rest } = o;
  const f = b.col(p, { w: 236, pad: 15, gap: 10, r: 12, fill: PILL.fill, shadow: "lg", ...rest });
  b.text(f, "Reading", { size: 12, weight: "SemiBold", c: PILL.dim });
  const sg = b.row(f, { w: "fill", h: 28, pad: 2, gap: 0, r: 8, fill: t.selected });
  ["Sans", "Serif", "Dyslexic"].forEach((s, i) => { const x = b.row(sg, { w: "fill", h: 24, r: 6, fill: i === font ? "#FFFFFF" : "none", stroke: i === font ? t.control : undefined, sw: 1, sa: "inside", justify: "center", shadow: i === font ? "ctl" : undefined }); b.text(x, s, { size: 12, weight: i === font ? "Medium" : "Regular", c: i === font ? "#171717" : PILL.dim }); });
  ([["Size", size], ["Width", width], ["Theme", theme]] as const).forEach(([a, v]) => { const r = b.row(f, { w: "fill", justify: "spaceBetween" }); b.text(r, a, { size: 12, c: PILL.dim }); b.text(r, v, { size: 12, c: PILL.text }); });
  const tr = b.row(f, { w: "fill", justify: "spaceBetween", gap: 6 });
  const tl = b.row(tr, { gap: 6 }); b.icon(tl, "wave", 14, PILL.dim); b.text(tl, "Highlight sentence", { size: 12, c: PILL.text });
  toggle(b, t, tr, highlight);
  return f;
};

export const playerBar = (b: B, t: T, p: Ref | undefined, state: "playing" | "paused" | "loading" | "done" = "playing", o: { title?: string; sub?: string; elapsed?: string; total?: string; pct?: number; disabled?: boolean; sleep?: string } = {}) => {
  const { title = "The quiet return of local-first software", sub = "Heart · Kokoro-82M", elapsed = "2:27", total = "6:48", pct = 0.36, disabled = false, sleep } = o;
  const f = b.row(p, { w: "fill", h: 84, pad: [0, 24], gap: 24, fill: t.surface, justify: "spaceBetween", opacity: disabled ? 0.5 : undefined });
  const l = b.row(f, { gap: 12, w: 320 });
  const cov = b.frame(l, { w: 44, h: 44, r: 10, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(cov, "headphones", 18, t.iconQuiet);
  const lt = b.col(l, { gap: 2, w: "fill" }); b.text(lt, title, { size: 13, weight: "Medium", c: t.text, w: "fill", maxLines: 1 }); b.text(lt, sub, { size: 12, c: t.text3 });
  const c = b.col(f, { gap: 8, align: "center", w: 520 });
  const ctr = b.row(c, { gap: 12 });
  iconBtn(b, t, ctr, "skipBack", { size: 32, c: t.text2 }); iconBtn(b, t, ctr, "back10", { size: 32, c: t.text });
  const pb = b.frame(ctr, { w: 44, h: 44, r: 22, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" });
  b.icon(pb, state === "loading" ? "loader" : state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 18, t.ctaText);
  iconBtn(b, t, ctr, "fwd10", { size: 32, c: t.text }); iconBtn(b, t, ctr, "skipFwd", { size: 32, c: t.text2 });
  const tl = b.row(c, { gap: 10, w: "fill" });
  b.text(tl, state === "done" ? total : elapsed, { size: 12, c: t.text3, mono: true }); bar(b, t, tl, state === "done" ? 1 : pct, 400, { knob: true }); b.text(tl, total, { size: 12, c: t.text3, mono: true });
  const r = b.row(f, { gap: 4, w: 320, justify: "max" });
  const sp = b.row(r, { h: 32, pad: [0, 12], r: 8, fill: t.chipGray }); b.text(sp, "1.2x", { size: 13, weight: "Medium", c: t.text });
  if (sleep) { const sl = b.row(r, { h: 32, pad: [0, 10], gap: 6, r: 8, fill: t.chipGray }); b.icon(sl, "moon", 16, t.text); b.text(sl, sleep, { size: 12, weight: "Medium", c: t.text, mono: true }); } else iconBtn(b, t, r, "moon", { size: 32, c: t.text2 });
  iconBtn(b, t, r, "volume", { size: 32, c: t.text2 }); iconBtn(b, t, r, "playlist", { size: 32, c: t.text2 });
  return f;
};
export const pageHeader = (b: B, t: T, p: Ref, title: string, sub?: string, right?: (f: Ref) => void) => {
  const f = b.row(p, { w: "fill", pad: [28, 32, 8, 32], justify: "spaceBetween", align: "end" });
  const l = b.col(f, { gap: 4 }); b.text(l, title, { size: 22, weight: "SemiBold", c: t.text }); if (sub) b.text(l, sub, { size: 13, c: t.text3 });
  if (right) right(b.row(f, { gap: 8 }));
  return f;
};
