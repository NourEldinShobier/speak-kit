// Group H (settings, Home/Browser pages that belong to it, updates): accurate copies of designs/built/shots/H*-light.png,
// drawn inside the real Windows 11 Electron window (kit3 winApp on a desktop). Light only. Tokens: packages/ui/src/lumen.css, layout: apps/desktop/src/renderer/shell.css + pages.css.
import { B, Ref } from "./lib";
import { LIGHT, T } from "./kit";
import * as K from "./kit";
import * as K3 from "./kit3";
import { S } from "./types";

const C = {
  win: "#F0F0F0", ink: "#1B2230", sec: "#475467", ter: "#5F6A7D", ph: "#6B7280", ctl: "#E5E5E5", fld: "#C3C6CC", div: "#EBEBEB", hair: "#F0F0F0",
  cta: "#201E25", ctaTx: "#FAFAFA", acc: "#0069CC", icon: "#667085", label: "#171717", raised: "#F7F8FA", red: "#C62828",
  green: "#17693D", chipG: "#D5F3E0", blue: "#0B5CAD", chipB: "#DAEFFE", orange: "#9A5200", chipO: "#FFEBCF", chipGray: "#F0F0F0", purple: "#7A4CD9", dotOrange: "#FD9812",
};
type W = "Regular" | "Medium" | "SemiBold";

/** text with Lumen metrics: fractional sizes (13.5, 12.5, 11.5) are set after creation, line height in px */
const tx = (b: B, p: Ref | undefined, s: string, o: { size?: number; w?: W; c?: string; lh?: number; ls?: number; fill?: boolean; ta?: string; mono?: boolean; x?: number; y?: number; abs?: boolean } = {}) => {
  const size = o.size ?? 13;
  const r = b.text(p, s, { size: Math.round(size), weight: o.w ?? "Regular", c: o.c ?? C.ink, lh: o.lh ?? Math.round(size * 1.25), ls: o.ls, w: o.fill ? "fill" : undefined, ta: o.ta, ff: o.mono ? "Cascadia Mono" : "Inter", x: o.x, y: o.y, abs: o.abs });
  if (size % 1) b.add("node.set", { ids: [r], fontSize: size });
  return r;
};

// ------------------------------------------------------------------ components (lumen.css)
const pill = (b: B, p: Ref, label: string, tone: "green" | "neutral" | "blue" | "orange" = "neutral", icon?: string) => {
  const [bg, fg] = { green: [C.chipG, C.green], neutral: [C.chipGray, C.sec], blue: [C.chipB, C.blue], orange: [C.chipO, C.orange] }[tone];
  const f = b.row(p, { h: 20, pad: [2, 7, 0, 7], gap: 4, r: 999, fill: bg });
  if (icon) b.icon(f, icon, 12, fg);
  tx(b, f, label, { size: 11.5, w: "Medium", c: fg, lh: 14 });
  return f;
};
const btn = (b: B, p: Ref, label: string, o: { v?: "secondary" | "primary" | "ghost" | "danger"; sz?: "md" | "sm"; icon?: string; disabled?: boolean; hover?: boolean } = {}) => {
  const { v = "secondary", sz = "md" } = o; const h = sz === "sm" ? 28 : 36;
  const fg = v === "primary" ? C.ctaTx : v === "danger" ? C.red : v === "ghost" ? C.sec : C.label;
  const f = b.row(p, { h, pad: [0, v === "primary" ? (sz === "sm" ? 12 : 15) : sz === "sm" ? 12 : 14, 0, v === "primary" ? (sz === "sm" ? 12 : 15) : sz === "sm" ? 12 : 14], gap: 6, r: 8, justify: "center",
    fill: v === "primary" ? C.cta : v === "secondary" ? (o.hover ? C.raised : "#FFFFFF") : v === "danger" ? "#C6282819" : "none",
    stroke: v === "secondary" ? C.ctl : undefined, sw: 1, sa: "inside", shadow: v === "primary" ? "cta" : v === "secondary" ? "ctl" : undefined, opacity: o.disabled ? 0.5 : undefined });
  if (o.icon) b.icon(f, o.icon, sz === "sm" ? 14 : 16, v === "secondary" ? C.sec : fg);
  tx(b, f, label, { w: "Medium", c: fg, lh: 16, ls: -0.13 });
  return f;
};
const kbd = (b: B, p: Ref, s: string, small = false, onCta = false) => {
  const f = b.row(p, { h: small ? 16 : 19, pad: small ? [0, 4] : [2, 6], r: 4, stroke: onCta ? "#FAFAFA73" : C.ctl, sw: 1, sa: "inside", justify: "center" });
  tx(b, f, s, { size: small ? 10 : 11, c: onCta ? C.ctaTx : C.ter, lh: small ? 12 : 13 });
  return f;
};
const keys = (b: B, p: Ref, ks: string[]) => { const f = b.row(p, { gap: 4 }); ks.forEach((k) => kbd(b, f, k)); return f; };
const select = (b: B, p: Ref, value: string, w = 160) => {
  const f = b.row(p, { w, h: 36, pad: [4, 12], gap: 8, r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", justify: "spaceBetween", shadow: "ctl" });
  tx(b, f, value, { lh: 16, ls: -0.13 }); b.icon(f, "down", 16, C.ter);
  return f;
};
const input = (b: B, p: Ref, value: string, w: number | "fill", o: { h?: number; mono?: boolean } = {}) => {
  const f = b.row(p, { w, h: o.h ?? 28, pad: [4, 12], gap: 8, r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" });
  tx(b, f, value, { size: o.mono ? 12 : 13, lh: 16, mono: o.mono, ls: o.mono ? 0 : -0.13, fill: true });
  return f;
};
const toggle = (b: B, p: Ref, on: boolean) => K.toggle(b, LIGHT, p, on);
const slider = (b: B, p: Ref, v: number, w = 200) => {
  const f = b.frame(p, { w, h: 16 });
  b.rect(f, { x: 0, y: 5.5, w, h: 5, r: 999, fill: C.hair });
  const tw = Math.round((w - 16) * v + 8);
  b.rect(f, { x: 0, y: 5.5, w: tw, h: 5, r: 999, fill: C.acc });
  b.ellipse(f, { x: tw - 8, y: 0, w: 16, h: 16, fill: "#FFFFFF", effects: [{ type: "dropShadow", color: C.fld, offset: [0, 0], radius: 0, spread: 1 }, { type: "dropShadow", color: "#0000001F", offset: [0, 1], radius: 2 }] } as any);
  return f;
};
const banner = (b: B, p: Ref, o: { tone?: "info" | "warning"; icon?: string; title?: string; text: string; action?: (f: Ref) => void; wrap?: boolean; w?: number | "fill" }) => {
  const tone = o.tone ?? "info"; const fg = tone === "info" ? C.blue : C.orange;
  const f = b.col(p, { w: o.w ?? "fill", pad: [10, 14], gap: 10, r: 10, fill: tone === "info" ? C.chipB : C.chipO });
  const top = b.row(f, { w: "fill", gap: 10 });
  b.icon(top, o.icon ?? (tone === "info" ? "info" : "alert"), 16, fg);
  const body = b.col(top, { w: "fill", gap: 2 });
  if (o.title) { tx(b, body, o.title, { w: "SemiBold", lh: 16 }); tx(b, body, o.text, { size: 12, c: C.sec, lh: 15 }); } else tx(b, body, o.text, { lh: 16 });
  if (o.action) { if (o.wrap) { const a = b.row(f, { gap: 8 }); o.action(a); } else { const a = b.row(top, { gap: 8 }); o.action(a); } }
  return f;
};

// ------------------------------------------------------------------ settings page structure (ui/react/settings.tsx)
const section = (b: B, p: Ref, title: string, desc: string | undefined, card: (c: Ref) => void) => {
  const s = b.col(p, { w: "fill", gap: 10, clip: false });
  const hd = b.col(s, { w: "fill", gap: 2 });
  tx(b, hd, title, { size: 15, w: "SemiBold", lh: 18 });
  if (desc) tx(b, hd, desc, { size: 12, c: C.ter, lh: 15 });
  const c = b.col(s, { w: "fill", gap: 0, r: 10, fill: "#FFFFFF", stroke: C.div, sw: 1, sa: "outside", shadow: "ctl" });
  card(c);
  return c;
};
const sep = (b: B, c: Ref) => b.rect(c, { w: "fill", h: 1, fill: C.hair });
/** One setting row: label 13.5/500, description 12.5 (lines given by the shot), control on the right. `lines` = description lines (0 = none). */
const row = (b: B, c: Ref, label: string | ((f: Ref) => void), desc: string | undefined, ctl?: (f: Ref) => void, o: { sep?: boolean; noSep?: boolean } = {}) => {
  if (o.sep) sep(b, c);
  const lines = desc ? desc.split("\n").length : 0;
  const h = desc ? Math.max(58, 22 + 17 + lines * 17 - 0) : o.sep ? 41 : 42;
  const r = b.row(c, { w: "fill", h, pad: [desc ? 11 : 3, 16], gap: 16 });
  const t = b.col(r, { w: "fill", gap: 1 });
  if (typeof label === "string") tx(b, t, label, { size: 13.5, w: "Medium", lh: 16 }); else { const l = b.row(t, { gap: 0 }); label(l); }
  if (desc) tx(b, t, desc, { size: 12.5, c: C.ter, lh: 17 });
  if (ctl) { const k = b.row(r, { gap: 16 }); ctl(k); }
  return r;
};
const acts = (b: B, f: Ref, fn: (a: Ref) => void) => { const a = b.row(f, { gap: 8 }); fn(a); return a; };
const pad = (b: B, c: Ref, h?: number) => b.col(c, { w: "fill", pad: [14, 16], gap: 0, h });
const text = (b: B, p: Ref, s: string, o: { c?: string; mb?: number } = {}) => tx(b, p, s, { c: o.c ?? C.ink, lh: 17 });
const tokenField = (b: B, p: Ref, tail: string, w: number | "fill" = "fill") => {
  const f = b.row(p, { w, gap: 8 });
  const box = b.row(f, { w: "fill", h: 36, pad: [0, 12], r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" });
  tx(b, box, "•••••••••••••••" .slice(1) + "-" + tail, { size: 12, lh: 16, mono: true });
  btn(b, f, "Reveal", { icon: "eye" }); btn(b, f, "Copy", { v: "primary", icon: "copy" }); btn(b, f, "Regenerate", { icon: "refresh" });
  return f;
};

// ------------------------------------------------------------------ app shell (shell.css, TitleBar, Sidebar, Footer)
type Shell = {
  w?: number; h?: number; nav: "settings" | "main"; sel: string; status: { label: string; tone: "green" | "neutral"; icon?: string }; update?: string; bellDot?: boolean;
  fwd?: boolean; back?: boolean; pron?: boolean; footer?: string[]; eng?: { title: string; hint?: string }; popover?: boolean;
};
const SETTINGS_NAV: [string, [string, string, string][]][] = [
  ["General", [["general", "General", "settings"], ["voice", "Voice and playback", "volume"], ["shortcuts", "Shortcuts", "keyboard"], ["notifications", "Notifications", "bell"]]],
  ["Device", [["memory", "Memory", "cpu"], ["storage", "Storage", "folder"]]],
  ["App", [["browser", "Browser integration", "globe"], ["about", "About", "info"]]],
];
const MAIN_NAV: [string, string, string][] = [["home", "Home", "home"], ["library", "Library", "book"], ["voices", "Voices", "mic"], ["engines", "Engines", "cpu"], ["browser", "Browser", "globe"]];

const shell = (b: B, c: Ref, o: Shell) => {
  const W = o.w ?? 1278, H = o.h ?? 799;
  b.rect(c, { x: 0, y: 0, w: W, h: H, fill: C.win });
  // title bar 36
  const ib = (x: number, icon: string, dis = false) => { const f = b.frame(c, { x, y: 4, w: 28, h: 28, layout: "horizontal", align: "center", justify: "center", opacity: dis ? 0.5 : undefined }); b.icon(f, icon, 14, C.ink); };
  ib(8, "sidebar"); ib(40, "left", o.back === false); ib(72, "right", !o.fwd);
  const sf = b.row(c, { x: 433, y: 4, w: 420, h: 28, pad: [0, 8, 0, 10], gap: 8, r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" });
  b.icon(sf, "search", 16, C.ter); tx(b, sf, "Search readings, voices and commands", { c: C.ter, lh: 16, fill: true }); kbd(b, sf, "Ctrl K", true);
  const rg = b.row(c, { x: 741, y: 4, w: 400, h: 28, gap: 8, justify: "max" });
  pill(b, rg, o.status.label, o.status.tone, o.status.icon);
  if (o.update) pill(b, rg, o.update, "green", "circleCheck");
  const bell = b.frame(rg, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(bell, "bell", 14, C.ink);
  if (o.bellDot) b.ellipse(bell, { abs: true, x: 15, y: 6, w: 7, h: 7, fill: C.dotOrange });
  // sidebar
  const sb = b.col(c, { x: 0, y: 36, w: 248, h: H - 36 - 28, pad: [2, 4, 2, 8], gap: 0 });
  if (o.nav === "settings") {
    const hd = b.row(sb, { w: "fill", h: 32, gap: 8 });
    const ab = b.frame(hd, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(ab, "arrowLeft", 14, C.ink);
    tx(b, hd, "Settings", { size: 18, w: "SemiBold", lh: 22 });
    b.frame(sb, { w: 1, h: 6 });
    SETTINGS_NAV.forEach(([g, items]) => {
      const gl = b.row(sb, { w: "fill", pad: [16, 10, 6, 10] }); tx(b, gl, g, { size: 11, w: "SemiBold", c: C.ter, lh: 13 }); b.frame(sb, { w: 1, h: 2 });
      (o.pron && g === "General" ? [items[0], items[1], ["pron", "Pronunciation", "type"] as [string, string, string], ...items.slice(2)] : items).forEach(([id, l, ic], i) => { navItem(b, sb, l, ic, id === o.sel); if (true) b.frame(sb, { w: 1, h: 2 }); });
    });
  } else {
    const nr = b.row(sb, { w: "fill", h: 36, pad: [0, 15], gap: 6, r: 8, fill: C.cta, shadow: "cta" });
    b.icon(nr, "plus", 16, C.ctaTx); tx(b, nr, "New reading", { w: "Medium", c: C.ctaTx, lh: 16, ls: -0.13, fill: true }); kbd(b, nr, "Ctrl N", true, true);
    b.frame(sb, { w: 1, h: 10 });
    MAIN_NAV.forEach(([id, l, ic]) => { navItem(b, sb, l, ic, id === o.sel); b.frame(sb, { w: 1, h: 2 }); });
    const rl = b.row(sb, { w: "fill", pad: [16, 10, 6, 10] }); tx(b, rl, "Recent", { size: 11, w: "SemiBold", c: C.ter, lh: 13 });
    const em = b.row(sb, { w: "fill", pad: [4, 10] }); tx(b, em, "Readings you start appear here.", { size: 12, c: C.ter, lh: 17 });
    b.frame(sb, { w: 1, h: "fill" });
    const e = o.eng ?? { title: "Kokoro-82M · Ready" };
    const card = b.col(sb, { w: "fill", pad: [10, 12], gap: 2, r: 10, fill: "#FFFFFF", shadow: "card" });
    tx(b, card, e.title, { w: "Medium", lh: 16 });
    if (e.hint) tx(b, card, e.hint, { size: 12, c: C.ter, lh: 16 });
    const ok = b.row(card, { gap: 6 }); b.icon(ok, "lock", 12, C.green); tx(b, ok, "100% on this device", { size: 12, c: C.green, lh: 16 });
    b.frame(sb, { w: 1, h: 6 });
    navItem(b, sb, "Settings", "settings", false);
  }
  // footer 28
  const ft = b.row(c, { x: 0, y: H - 28, w: W, h: 28, pad: [0, 14], gap: 10, justify: "max" });
  (o.footer ?? ["Kokoro ready", "Voice: Heart", "0 readings"]).forEach((s, i) => { if (i) b.rect(ft, { w: 1, h: 12, fill: C.fld }); tx(b, ft, s, { size: 12, c: C.ter, lh: 16 }); });
  // panel
  return b.frame(c, { name: "Panel", x: 252, y: 36, w: 1018, h: H - 36 - 28, r: 8, fill: "#FFFFFF", shadow: "card", clip: true });
};
function navItem(b: B, p: Ref, label: string, icon: string, sel: boolean) {
  const f = b.row(p, { w: "fill", h: 36, pad: [0, 10], gap: 12, r: 8 });
  b.icon(f, icon, 16, C.icon); tx(b, f, label, { w: sel ? "Medium" : "Regular", c: sel ? C.ink : C.sec, lh: 16, fill: true });
}

/** page column inside the panel: max 760 (wide 820), padding 22 28 24, gap 16; `sb` = width of a vertical scrollbar */
const page = (b: B, panel: Ref, o: { title: string; lead?: string; wide?: boolean; sb?: number }, body: (c: Ref) => void) => {
  const mw = o.wide ? 820 : 760; const sbw = o.sb ?? 0;
  const col = b.col(panel, { x: Math.round((1018 - sbw - mw) / 2), y: 0, w: mw, pad: [22, 28, 24, 28], gap: 16, clip: false });
  const hd = b.col(col, { w: "fill", gap: 4 });
  tx(b, hd, o.title, { size: 22, w: "SemiBold", lh: 26 });
  if (o.lead) tx(b, hd, o.lead, { c: C.sec, lh: 17 });
  body(col);
  return col;
};
const scrollbar = (b: B, panel: Ref, y0: number, y1: number) => b.rect(panel, { x: 1011, y: y0, w: 4, h: y1 - y0, r: 999, fill: "#00000017" });

// ------------------------------------------------------------------ frame factory
const ENG = { label: "Ready", tone: "green" as const };
const ASLEEP = { label: "Unloaded · Wakes on play", tone: "neutral" as const, icon: "moon" };
const mk = (id: string, title: string, note: string, shotH: number, build: (b: B, c: Ref, a: K3.Rect) => void): S => ({
  id, group: "H", title, note, w: 1440, h: 900,
  build: (b, _t, root) => { const a = K3.winApp(b, root, { w: 1278, h: shotH, backdrop: { w: 1440, h: 900 } }); build(b, a.ref, a); },
});
const settings = (id: string, title: string, note: string, sel: string, h: number, o: Partial<Shell>, pg: { title: string; lead?: string; sb?: number }, body: (c: Ref) => void, extra?: (b: B, c: Ref, panel: Ref) => void) =>
  mk(id, title, note, h, (b, c) => { const panel = shell(b, c, { nav: "settings", sel, status: ENG, h, ...o }); page(b, panel, pg, body); extra?.(b, c, panel); });

// ------------------------------------------------------------------ pages
const general = (c0: Ref, b: B) => {
  section(b, c0, "Startup", undefined, (c) => {
    row(b, c, "Launch at login", "Start Speak Kit when you sign in so the extension is ready.", (f) => toggle(b, f, false));
    row(b, c, "Start minimized to tray", "When it starts at login, stay in the tray instead of opening a window.", (f) => toggle(b, f, false), { sep: true });
  });
  section(b, c0, "Appearance", undefined, (c) => row(b, c, "Language", undefined, (f) => select(b, f, "System default")));
  section(b, c0, "Tray", undefined, (c) => row(b, c, "Closing the window", "Keeps Speak Kit in the tray so the extension and the shortcuts keep working. Quit from the tray\nmenu.", (f) => tx(b, f, "Keeps running", { lh: 16 })));
  section(b, c0, "Privacy", undefined, (c) => row(b, c, "Offer to read long text I copy", "Shows a Windows notification after you copy a few sentences. Copies from password managers are\nskipped. The text never leaves this computer.", (f) => toggle(b, f, false)));
};
const voice = (c0: Ref, b: B) => section(b, c0, "Preview", undefined, (c) => {
  row(b, c, "Voice", undefined, (f) => select(b, f, "Heart"));
  row(b, c, "Speed", "1.00x", (f) => slider(b, f, 1 / 3), { sep: true });
});
const browserSettings = (c0: Ref, b: B) => {
  section(b, c0, "Connection", undefined, (c) => {
    row(b, c, "Server port", "The extension connects here. Default 47615. If it is busy, the next free port is\nused.", (f) => acts(b, f, (a) => { input(b, a, "48153", 96); btn(b, a, "Apply", { disabled: true }); }));
    row(b, c, "Paired browser", "No extension has called yet.", (f) => pill(b, f, "Waiting"), { sep: true });
  });
  section(b, c0, "Pairing token", "Regenerating signs out every paired browser.", (c) => { const p = pad(b, c); tokenField(b, p, "10e2"); });
};
const SHORTCUTS: [string, string, string[]][] = [
  ["Read selection", "Reads the text selected in any app.", ["Ctrl", "Alt", "S"]], ["Play or pause", "Pauses and resumes the current reading.", ["Ctrl", "Alt", "Space"]],
  ["Stop", "Stops the reading and closes the mini player.", ["Ctrl", "Alt", "X"]]
];
const shortcuts = (b: B, mode: "idle" | "record" | "conflict") => (c0: Ref) => {
  section(b, c0, "Global", undefined, (c) => {
    SHORTCUTS.forEach(([l, d, k], i) => {
      row(b, c, l, d, (f) => acts(b, f, (a) => {
        if (i === 0 && mode === "record") {
          const rec = b.row(a, { gap: 8, pad: [4, 10], r: 8, stroke: C.acc, sw: 1, sa: "inside" });
          tx(b, rec, "Press new keys", { c: C.acc, lh: 17 }); kbd(b, rec, "Esc", true); tx(b, rec, "to cancel", { c: C.acc, lh: 17 });
          btn(b, a, "Cancel", { sz: "sm", hover: true });
        } else { keys(b, a, k); btn(b, a, "Change", { sz: "sm" }); }
      }));
      if (i === 0 && mode === "conflict") {
        const p = pad(b, c);
        banner(b, p, { tone: "warning", title: "Another app is using Ctrl+Alt+S.", text: "Speak Kit never takes a shortcut another app owns. Pick another combination or\nuse the suggestion.", action: (a) => btn(b, a, "Use Ctrl+Alt+Shift+S", { sz: "sm" }) });
      }
    });
    row(b, c, "Reset all", "Back to Ctrl+Alt+S, Space and X.", (f) => btn(b, f, "Reset", { sz: "sm" }));
  });
  section(b, c0, "In this app", undefined, (c) => {
    row(b, c, "Search and commands", undefined, (f) => keys(b, f, ["Ctrl", "K"]));
    row(b, c, "New reading", undefined, (f) => keys(b, f, ["Ctrl", "N"]), { sep: true });
  });
};
const storage = (c0: Ref, b: B) => section(b, c0, "Models folder", "C:\\Users\\noure\\AppData\\Local\\Temp\\speakkit-desktop-nwNVzT\\models", (c) => {
  const p = pad(b, c);
  b.frame(p, { w: 1, h: 2 });
  const bar = b.row(p, { w: "fill", h: 8, r: 4, fill: C.hair, clip: true }); b.rect(bar, { w: "fill", h: 8, fill: C.purple });
  b.frame(p, { w: 1, h: 13 }); // margin under the bar
  b.frame(p, { w: 1, h: 0 });
  const sw = (col: string, name: string) => (l: Ref) => { b.rect(l, { w: 10, h: 10, r: 3, fill: col }); b.frame(l, { w: 8, h: 1 }); tx(b, l, name, { size: 13.5, w: "Medium", lh: 16 }); };
  row(b, c, sw(C.blue, "Voice models"), undefined, (f) => tx(b, f, "0 B", { lh: 16 }));
  row(b, c, sw(C.orange, "Logs"), undefined, (f) => tx(b, f, "108 B", { lh: 16 }), { sep: true });
  row(b, c, sw(C.purple, "Settings and token"), undefined, (f) => tx(b, f, "3 MB", { lh: 16 }), { sep: true });
  row(b, c, "Open folder", undefined, (f) => acts(b, f, (a) => { btn(b, a, "Models", { sz: "sm", icon: "folder" }); btn(b, a, "Logs", { sz: "sm", icon: "folder" }); }), { sep: true });
});
const memory = (unloaded: boolean) => (c0: Ref, b: B) => {
  section(b, c0, "Right now", undefined, (c) => {
    row(b, c, "Voice engine", unloaded ? "0 MB in memory. Wakes on play." : "Unloads at 1:58:35 PM if idle", (f) => acts(b, f, (a) => { if (unloaded) { pill(b, a, "Unloaded · Wakes on play", "neutral", "moon"); btn(b, a, "Load now", { sz: "sm" }); } else pill(b, a, "Ready", "green"); }));
    row(b, c, "Memory in use", "All Speak Kit processes, this window included.", (f) => tx(b, f, unloaded ? "323 MB" : "327 MB", { lh: 16 }), { sep: true });
  });
  section(b, c0, "Unloading", undefined, (c) => {
    row(b, c, "Unload the model when idle", "Frees its memory after the last reading. The next play loads it again in a moment.", (f) => select(b, f, "After 5 minutes"));
    row(b, c, "Load at startup", "Keep the model ready as soon as Speak Kit starts. Uses memory all day.", (f) => toggle(b, f, false), { sep: true });
    row(b, c, "Battery saver", "On battery, the model unloads sooner.", (f) => toggle(b, f, true), { sep: true });
  });
};
const EVENTS: [string, boolean[]][] = [["Export finished", [true, true, false]], ["Voice engine problem", [true, true, true]], ["Update ready", [true, true, false]]];
const notifications = (c0: Ref, b: B) => {
  section(b, c0, "Do not disturb", undefined, (c) => row(b, c, "Do not disturb", "No toasts or sounds from Speak Kit. The bell still keeps a line for each event.", (f) => toggle(b, f, false)));
  section(b, c0, "Events", "At most one toast per task every 10 minutes.", (c) => {
    const CX = [393, 514, 637]; // column centres inside the 704 px card
    const hd = b.frame(c, { w: "fill", h: 36 }); // header: 10 px padding, 11/500 caps
    tx(b, hd, "EVENT", { size: 11, w: "Medium", c: C.ter, lh: 15, ls: 0.66, x: 16, y: 10 });
    ["TOAST", "BELL", "SOUND"].forEach((s, i) => { tx(b, hd, s, { size: 11, w: "Medium", c: C.ter, lh: 15, ls: 0.66, x: CX[i] + 0 - [20, 14, 21][i] + [0, 6, -1][i], y: 10 }); });
    EVENTS.forEach(([l, v]) => {
      sep(b, c);
      const r = b.frame(c, { w: "fill", h: 41 });
      tx(b, r, l, { lh: 16, x: 16, y: 12.5 });
      v.forEach((on, i) => { const t = toggle(b, r, on); b.add("node.set", { ids: [t], x: CX[i] - 16, y: 10.5 }); });
    });
  });
  banner(b, c0, { title: "Windows Focus and Do Not Disturb also apply", text: "When Windows is in a focus session, toasts go straight to the notification center." });
};
const LICENSES: [string, string][] = [["wasm-media-encoders (MP3 export, built on LAME)", "MIT, LAME is LGPL-2.1"], ["electron-updater", "MIT"], ["koffi (reading the selection)", "MIT"], ["Kokoro-82M (model)", "Apache-2.0"],
  ["onnxruntime-node", "MIT"], ["Electron", "MIT"], ["React", "MIT"], ["Radix UI", "MIT"], ["Tabler Icons", "MIT"], ["valibot", "MIT"], ["electron-log, electron-store", "MIT"]];
type Upd = "unsupported" | "manual" | "ready" | "restarting" | "confirm";
/** the update card (UpdateCard.tsx) in the given state; `wrap` = popover layout (actions under the text) */
const updateCard = (b: B, p: Ref, k: Upd, wrap = false) => {
  if (k === "unsupported") return text(b, p, "Updates are delivered to the installed app. This copy runs from a folder, so it does not update itself. The\nWindows installer keeps itself up to date.", { c: C.sec });
  if (k === "restarting") { const r = b.row(p, { gap: 8 }); b.icon(r, "loader", 16, C.acc); return tx(b, r, "Restarting to install 0.2.0", { lh: 16 }); }
  const col = b.col(p, { w: "fill", gap: 0 });
  if (k === "manual") banner(b, col, { title: "Speak Kit 0.9.0 is available", text: "This copy cannot replace itself. Download the new version from the\nrelease page and open it to update.", wrap, action: (a) => { btn(b, a, "Release notes", { sz: "sm" }); btn(b, a, "Download", { sz: "sm", v: "primary" }); } });
  else if (k === "confirm") banner(b, col, { tone: "warning", title: "Restart to install 0.2.0?", text: "The reading in progress stops. Choose Install when I\nquit to let it finish first.", wrap: true, action: (a) => { btn(b, a, "Keep working", { sz: "sm" }); btn(b, a, "Restart anyway", { sz: "sm", v: "danger" }); } });
  else banner(b, col, { icon: "circleCheck", title: "Speak Kit 0.2.0 is ready", text: wrap ? "Restarting closes the app for a moment, then it\nreopens where you left off. Readings and exports in\nprogress stop." : "Restarting closes the app for a moment, then it reopens where\nyou left off. Readings and exports in progress stop.", wrap, action: (a) => { btn(b, a, "Install when I quit", { sz: "sm" }); btn(b, a, "Restart now", { sz: "sm", v: "primary" }); } });
  if (k !== "confirm") btn(b, col, "Remind me later", { sz: "sm", v: "ghost" });
  return col;
};
const about = (upd: Upd) => (c0: Ref, b: B) => {
  section(b, c0, "Versions", undefined, (c) => {
    row(b, c, "Speak Kit", undefined, (f) => tx(b, f, "0.4.0", { lh: 16 }));
    row(b, c, "Voice engine", undefined, (f) => tx(b, f, "Kokoro-82M", { lh: 16 }), { sep: true });
    row(b, c, "Platform", undefined, (f) => tx(b, f, "win32", { lh: 16 }), { sep: true });
  });
  section(b, c0, "Updates", "Updates come from GitHub Releases. They download in the background and are never installed without you.", (c) => {
    const p = b.col(c, { w: "fill", pad: [14, 16, upd === "unsupported" ? 24 : 14, 16], gap: 0 });
    updateCard(b, p, upd);
    row(b, c, "Check automatically", "Once a day while Speak Kit runs.", (f) => toggle(b, f, true));
  });
  section(b, c0, "Open source licenses", undefined, (c) => LICENSES.forEach(([k, l], i) => row(b, c, k, undefined, (f) => tx(b, f, l, { lh: 16 }), { sep: i > 0 })));
  btn(b, b.row(c0, { gap: 0 }), "Open log folder", { icon: "folder" });
};

// ------------------------------------------------------------------ the frames
const POP_NOTE = "Update ready: the green pill in the title bar opens the same card in a popover.";
const aboutFrame = (id: string, title: string, note: string, h: number, upd: Upd, o: Partial<Shell>, extra?: (b: B, c: Ref, panel: Ref) => void) =>
  settings(id, title, note, "about", h, o, { title: "About", lead: "Speak Kit reads text out loud on your own computer.", sb: 10 }, (c) => about(upd)(c, curB!), (b, c, panel) => { scrollbar(b, panel, 4, 504); extra?.(b, c, panel); });
let curB: B | null = null; // set by wrap() below so page bodies can stay (c) => void
const wrap = (s: S): S => ({ ...s, build: (b, t, r) => { curB = b; s.build(b, t, r); } });
const pg = <A extends (c: Ref, b: B) => void>(f: A) => (c: Ref) => f(c, curB!);

const popover = (b: B, c: Ref, k: Upd, h: number) => {
  const p = b.col(c, { name: "Update popover", x: 726, y: 35, w: 380, pad: 12, gap: 10, r: 10, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" });
  tx(b, p, k === "confirm" ? "Update ready" : "Update ready", { size: 14, w: "SemiBold", lh: 20 });
  updateCard(b, p, k, true);
  void h;
};
const updatingCard = (b: B, c: Ref, h: number) => {
  const f = b.col(c, { name: "Updating card", x: 1278 - 16 - 356, y: h - 12 - 83, w: 356, pad: 14, gap: 10, r: 10, fill: "#FFFFFF", shadow: "lg" });
  tx(b, f, "Updating to 0.2.0", { size: 14, w: "SemiBold", lh: 20 }); tx(b, f, "Speak Kit will reopen where you left off.", { size: 12, c: C.sec, lh: 16 });
  const tr = b.frame(f, { w: "fill", h: 3, r: 999, fill: C.hair, clip: true }); b.rect(tr, { x: 198, y: 0, w: 42, h: 3, r: 999, fill: C.acc });
};

const FIRST = "Global shortcuts work in any app. Click a shortcut, then press the new keys.";
export const SETTINGS_FRAMES: S[] = [
  settings("H1", "Settings · General", "Startup, language, tray and privacy on one page.", "general", 799, {}, { title: "General", lead: "Startup, language and notifications." }, pg(general)),
  settings("H2", "Settings · Voice and playback", "Preview voice and speed; the extension keeps its own.", "voice", 799, {}, { title: "Voice and playback", lead: "Used for previews in this app. The extension keeps its own voice and speed." }, pg(voice)),
  settings("H4", "Settings · Browser integration", "Server port with Apply, paired browser state, masked pairing token.", "browser", 799, {}, { title: "Browser integration", lead: "How the extension finds and trusts this app." }, pg(browserSettings)),
  settings("H5", "Settings · Shortcuts", "Global Ctrl+Alt shortcuts with Change, Reset all, and the in-app keys.", "shortcuts", 799, {}, { title: "Shortcuts", lead: FIRST }, (c) => shortcuts(curB!, "idle")(c)),
  settings("H11", "Settings · Shortcuts (recording a key)", "Capture state: Press new keys, Esc to cancel.", "shortcuts", 798, {}, { title: "Shortcuts", lead: FIRST }, (c) => shortcuts(curB!, "record")(c)),
  settings("H16", "Settings · Shortcuts (conflict)", "A conflict names the other app and offers one alternative, never a silent override.", "shortcuts", 798, {}, { title: "Shortcuts", lead: FIRST }, (c) => shortcuts(curB!, "conflict")(c)),
  settings("H6", "Settings · Storage", "Usage bar with legend, per-folder sizes and Open folder buttons.", "storage", 799, {}, { title: "Storage", lead: "On this computer: 3 MB" }, pg(storage)),
  settings("H12", "Settings · Memory", "Live engine state, memory in use, idle unload, load at startup, battery saver.", "memory", 799, {}, { title: "Memory", lead: "The voice model uses several hundred MB while loaded. Speak Kit loads it when you play and unloads it when\nidle." }, pg(memory(false))),
  settings("H13", "Settings · Memory (engine unloaded)", "Same page with the engine asleep: 0 MB in memory, wakes on play, Load now.", "memory", 799, { status: ASLEEP, footer: ["Voice engine asleep", "Voice: Heart", "0 readings"] }, { title: "Memory", lead: "The voice model uses several hundred MB while loaded. Speak Kit loads it when you play and unloads it when\nidle." }, pg(memory(true))),
  settings("H14", "Settings · Notifications", "Do not disturb, and the Toast, Bell and Sound table per event. There is no row for the engine or model becoming ready: that never notifies.", "notifications", 799, {}, { title: "Notifications", lead: "A toast is a Windows notification. The bell is the list in the title bar. Clicking a toast opens the place it is about." }, pg(notifications)),
  aboutFrame("H8", "Settings · About", "Versions, update section for a folder copy, open source licenses.", 799, "unsupported", {}),
  aboutFrame("H9", "Settings · Update available", "Manual update: release notes and download, Remind me later.", 798, "manual", { update: "Update available · 0.9.0" }),
  aboutFrame("H23", "Settings · Update ready (pill)", "Update ready: green pill and notification dot in the title bar, card in About.", 799, "ready", { update: "Update ready · 0.2.0", bellDot: true }),
  aboutFrame("H18", "Update ready · pill and popover", "Never forced: the green pill opens a popover with Install when I quit or Restart now.", 799, "ready", { update: "Update ready · 0.2.0", bellDot: true }, (b, c) => popover(b, c, "ready", 0)),
  aboutFrame("H22", "Update ready · restart confirm", "Restart while reading asks first: Keep working or Restart anyway.", 798, "ready", { update: "Update ready · 0.2.0", bellDot: true, footer: ["Kokoro ready", "Voice: Heart", "Reading: One short sentence here. A second sentence follows it. And..."] }, (b, c) => popover(b, c, "confirm", 0)),
  aboutFrame("H19", "Updating", "Restart shows one small progress card and says Speak Kit will reopen where you left off.", 799, "restarting", { bellDot: true }, (b, c) => updatingCard(b, c, 799)),
].map(wrap);
void POP_NOTE;
export const SETTINGS_EXTRA: S[] = [];

// ------------------------------------------------------------------ pages that are not under Settings but belong to this group
const stat = (b: B, p: Ref, k: string, dot: string, v: string, d: (f: Ref) => void) => {
  const c = b.col(p, { w: "fill", h: "fill", pad: [14, 16], gap: 6, r: 10, fill: "#FFFFFF", stroke: C.div, sw: 1, sa: "outside", shadow: "ctl" });
  tx(b, c, k, { size: 11, w: "SemiBold", c: C.ter, lh: 15, ls: 0.44 });
  const r = b.row(c, { gap: 8 }); b.ellipse(r, { w: 8, h: 8, fill: dot }); tx(b, r, v, { size: 15, w: "SemiBold", lh: 21 });
  const dd = b.row(c, { gap: 4 }); d(dd);
};
const home = (c0: Ref, b: B) => {
  const g = b.row(c0, { w: "fill", h: 105, gap: 12, align: "stretch", clip: false });
  stat(b, g, "SERVER", "#05C283", "Running", (f) => { tx(b, f, "Listening on", { size: 12, c: C.sec, lh: 17 }); tx(b, f, "127.0.0.1:48131", { size: 12, lh: 17, mono: true }); });
  stat(b, g, "VOICE ENGINE", C.ter, "Unloaded", (f) => tx(b, f, "Kokoro-82M is on disk. It loads when you press play" + "\n" + "and unloads when idle.", { size: 12, c: C.sec, lh: 17 }));
  section(b, c0, "Pairing token", "Paste this token in the extension under Options > General > Pairing token.", (c) => tokenField(b, pad(b, c), "fe2c"));
  section(b, c0, "Install the extension", "Add Speak Kit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.", (c) => {
    row(b, c, "Speak Kit for Chrome", "Not connected yet", (f) => acts(b, f, (a) => { btn(b, a, "Pair", { sz: "sm" }); btn(b, a, "Open Web Store", { sz: "sm", icon: "external" }); }));
    row(b, c, "Engines", "Kokoro-82M is installed. Chatterbox comes later.", (f) => btn(b, f, "Manage", { sz: "sm" }), { sep: true });
  });
};
const browserPage = (c0: Ref, b: B) => {
  const ac = b.col(c0, { w: "fill", pad: 16, gap: 12, r: 10, fill: "#FFFFFF", stroke: C.div, sw: 1, sa: "outside", shadow: "ctl" });
  tx(b, ac, "Pair your browser", { size: 14, w: "SemiBold", lh: 20 });
  const ol = b.col(ac, { w: "fill", gap: 8 });
  [["Install", " Speak Kit from the Chrome Web Store, then pin it from the puzzle menu."], ["Copy", " the token below."], ["Paste", " it in the extension under Options > General > Pairing token."]].forEach(([k, r], i) => {
    const l = b.row(ol, { gap: 0 }); { const nf = b.frame(l, { w: 18, h: 16 }); tx(b, nf, `${i + 1}.`, { c: C.sec, lh: 16, x: 1, y: 0 }); } tx(b, l, k, { w: "SemiBold", lh: 16 }); tx(b, l, r, { c: C.sec, lh: 16 });
  });
  tokenField(b, ac, "8da9");
  const ar = b.row(ac, { gap: 8 }); btn(b, ar, "Open Web Store", { icon: "external" }); btn(b, ar, "Install from this app", { icon: "folder" });
  const pd = b.col(c0, { w: "fill", gap: 4, clip: false });
  tx(b, pd, "PAIRED", { size: 11, w: "SemiBold", c: C.ter, lh: 15, ls: 0.44 });
  const cd = b.col(pd, { w: "fill", gap: 0, r: 10, fill: "#FFFFFF", stroke: C.div, sw: 1, sa: "outside", shadow: "ctl" });
  row(b, cd, "Chrome extension", "No call from an extension yet. It appears here after the first request.", (f) => pill(b, f, "Waiting"));
  row(b, cd, "Connection", "Connected over this computer only (127.0.0.1).", (f) => tx(b, f, "127.0.0.1:48150", { size: 12, lh: 16, mono: true }), { sep: true });
  banner(b, c0, { text: "Page text is treated as information, never as instructions. The token never leaves this computer." });
};
const pron = (c0: Ref, b: B) => section(b, c0, "Custom pronunciations", "Write a word the way it sounds, with plain letters. Press play to check it.", (c) => {
  const p = b.row(c, { w: "fill", pad: [14, 16], gap: 10 });
  const ph = (t: string) => { const f = b.row(p, { w: "fill", h: 36, pad: [4, 12], r: 8, fill: "#FFFFFF", stroke: C.ctl, sw: 1, sa: "inside", shadow: "ctl" }); tx(b, f, t, { c: C.ph, lh: 16, ls: -0.13 }); };
  ph("Word or phrase, e.g. Nginx"); b.icon(p, "arrowRight", 16, C.ter); ph("Respelling, e.g. engine X"); btn(b, p, "Add", { v: "primary", icon: "plus" });
  [["Kokoro", "koh-koh-roh"], ["PDF", "P D F"], ["Nginx", "engine X"], ["Okafor", "oh-KAH-for"]].forEach(([w, r]) => row(b, c, w, r, (f) => acts(b, f, (a) => { [["play"], ["trash"]].forEach(([ic]) => { const i = b.frame(a, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(i, ic, 14, C.sec); }); }), { sep: true }));
});
const EXTRA: S[] = [
  settings("H3", "Settings · Pronunciation", "Custom dictionary with respelling help and a preview per entry. Design-only: cannot be screenshotted, the feature is not built.", "pron", 799, { pron: true }, { title: "Pronunciation", lead: "Teach Speak Kit how to say names and terms. The extension and the app share the list." }, (c) => pron(c, curB!)),
  mk("H20", "Home · engine unloaded", "Home with the engine asleep: Unloaded stat, Unloaded pill with a moon, sidebar card says Wakes on play.", 799, (b, c) => { const panel = shell(b, c, { nav: "main", sel: "home", status: ASLEEP, footer: ["Voice engine asleep", "Voice: Heart", "0 readings"], eng: { title: "Kokoro-82M · Unloaded", hint: "Wakes on play" }, back: false }); page(b, panel, { title: "Home", lead: "Speak Kit runs a private voice server on this computer. Your browser extension talks to it." }, (cc) => home(cc, b)); }),
  mk("H21", "Browser · pair your browser", "Main-sidebar Browser page: three steps, token field, Open Web Store, paired state and the privacy note.", 799, (b, c) => { const panel = shell(b, c, { nav: "main", sel: "browser", status: ENG, back: true }); page(b, panel, { title: "Browser", lead: "Connect Chrome, Edge or Brave to the voice engine on this computer.", wide: true }, (cc) => browserPage(cc, b)); }),
].map(wrap);

export const SETTINGS_FRAMES2 = EXTRA;
