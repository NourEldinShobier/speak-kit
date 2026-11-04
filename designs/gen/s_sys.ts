import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import { kebab, dangerBtn, tip, popover, cloneScreen, enginesScreen, settingsScreen } from "./s_voices";

const W = 1280, H = 800;
const dim = (b: B, t: T, win: Ref) => b.rect(win, { abs: true, x: 0, y: 0, w: W, h: H, fill: t.overlay });
type Row = (f: Ref) => void;
// full-window transparent layer that centers (or bottom-right anchors) its single child
const center = (b: B, win: Ref) => b.col(win, { abs: true, x: 0, y: 0, w: W, h: H, align: "center", justify: "center" });
const corner = (b: B, win: Ref, pad = 16) => b.col(win, { abs: true, x: 0, y: 0, w: W, h: H, align: "end", justify: "end", pad });
const ring = (b: B, t: T, p: Ref, f: (r: Ref) => void) => { const r = b.row(p, { pad: 2, r: 12, stroke: t.accent, sw: 2 }); f(r); return r; };
const closeX = (b: B, t: T, dl: Ref, w: number) => { const f = b.frame(dl, { abs: true, x: w - 48, y: 16, w: 28, h: 28, r: 8, layout: "horizontal", align: "center", justify: "center" } as any); b.icon(f, "x", 14, t.text2); };
const dHead = K.dialogHead;
const dFoot = (b: B, t: T, d: Ref, left: string | undefined, fn: (r: Ref) => void) => K.dialogFoot(b, t, d, left, fn);
const modalBox = (b: B, t: T, win: Ref, w: number) => { dim(b, t, win); const c = center(b, win); return b.col(c, { w, fill: t.raised, r: 14, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg", gap: 0, clip: true }); };

// ---------- backdrops: library list, reader ----------
const ITEMS: [string, string, string, number, string][] = [
  ["The quiet return of local-first software", "Web page · 1,290 words · reader.example.com", "globe", 0.36, "6:48"],
  ["Quarterly report.docx", "Word document · 4,120 words", "file", 0, "21:42"],
  ["How Kokoro-82M was trained", "PDF · 12 pages · 2,600 words", "book", 1, "13:41"],
  ["A field guide to sourdough", "Web page · 1,850 words", "globe", 0.72, "9:44"],
  ["Meeting notes, Oct 30", "Pasted text · 640 words", "clipboard", 0, "3:22"],
  ["Chapter 3: The long way home", "EPUB · 5,300 words", "book", 0.1, "27:54"],
];
const libBackdrop = (b: B, t: T, main: Ref, o: { right?: Row; banner?: (m: Ref) => void; exporting?: boolean } = {}) => {
  if (o.banner) o.banner(main);
  K.pageHeader(b, t, main, "Library", "6 readings · 1h 22m of audio", (r) => { if (o.right) o.right(r); K.input(b, t, r, { placeholder: "Search readings", icon: "search", w: 220 }); K.btn(b, t, r, "Add", { v: "primary", icon: "plus" }); });
  const c = b.col(main, { w: "fill", h: "fill", pad: [8, 32, 24, 32], gap: 16 });
  const fr = b.row(c, { gap: 8 }); ["All", "Web pages", "PDFs and files", "Pasted text", "Unfinished"].forEach((s, i) => K.chip(b, t, fr, s, i === 0));
  const list = K.card(b, t, c, { w: "fill", pad: 0, gap: 0 });
  ITEMS.forEach(([n, s, ic, p, d], i) => { if (i) K.divider(b, t, list); const r = b.row(list, { w: "fill", h: 64, pad: [0, 18], gap: 14 }); const a = b.frame(r, { w: 38, h: 38, r: 10, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(a, ic, 18, t.text2); const x = b.col(r, { gap: 2, w: "fill" }); b.text(x, n, { size: 14, weight: "SemiBold", c: t.text }); b.text(x, s, { size: 12.5, c: t.text2 }); if (o.exporting && i === 0) K.badge(b, t, r, "Exporting 44%", "accent", "download"); else if (p > 0 && p < 1) K.bar(b, t, r, p, 120, { knob: false }); else if (p >= 1) K.badge(b, t, r, "Finished", "ok", "check"); else K.badge(b, t, r, "New", "accent"); b.text(r, d, { size: 12.5, c: t.text2, mono: true, w: 60, ta: "right" }); kebab(b, t, r, 30); });
};
const readerBackdrop = (b: B, t: T, main: Ref) => {
  const bar = b.row(main, { w: "fill", h: 52, pad: [0, 20], justify: "spaceBetween", fill: t.surface });
  const l = b.row(bar, { gap: 12 }); K.iconBtn(b, t, l, "left", { size: 32 }); b.text(l, "The quiet return of local-first software", { size: 14, weight: "SemiBold", c: t.text }); K.badge(b, t, l, "Web page", "neutral");
  const r = b.row(bar, { gap: 6 }); K.iconBtn(b, t, r, "search", { size: 34 }); K.iconBtn(b, t, r, "type", { size: 34 }); K.iconBtn(b, t, r, "list", { size: 34 });
  b.rect(main, { w: "fill", h: 1, fill: t.border });
  const mid = b.col(main, { w: "fill", h: "fill", align: "center", pad: [36, 0], gap: 16 });
  const a = b.col(mid, { w: 640, gap: 16 });
  b.text(a, K.ARTICLE.title, { size: 32, weight: "Bold", lh: 38, c: t.text, w: 640 });
  K.para(b, t, a, K.ARTICLE.paras[0], 640, { size: 17, lh: 28, hl: { sent: 1, word: 4 } });
  b.text(a, K.ARTICLE.paras[1], { size: 17, lh: 28, c: t.text, w: 640 });
  b.rect(main, { w: "fill", h: 1, fill: t.border });
  K.playerBar(b, t, main, "paused", { disabled: true });
};

// ---------- I: Windows 11 desktop scene + tray surfaces ----------
const ANCH_R = 1268, ANCH_B = 740;
const scene = (b: B, t: T, root: Ref, trayActive = false) => {
  b.rect(root, { x: 0, y: 0, w: W, h: H, fills: [{ type: "linearGradient", stops: ["#BFD7F2", "#F2D8E4"], from: [0, 0], to: [1, 1] }] });
  const w = b.col(root, { x: 120, y: 50, w: 900, h: 640, r: 10, fill: t.surface, shadow: "dlg", clip: true, gap: 0 });
  const tb = b.row(w, { w: "fill", h: 38, pad: [0, 12], fill: "#EBEBEE" }); b.text(tb, "Quarterly report.docx - Word", { size: 12, c: t.text2 });
  const c = b.col(w, { w: "fill", pad: [30, 48], gap: 12 }); b.text(c, "Q4 planning summary", { size: 26, weight: "Bold", c: t.text }); b.text(c, K.ARTICLE.paras[0], { size: 15, lh: 24, c: t.text2, w: "fill" }); b.text(c, K.ARTICLE.paras[1], { size: 15, lh: 24, c: t.text2, w: "fill" }); b.text(c, K.ARTICLE.paras[2], { size: 15, lh: 24, c: t.text2, w: "fill" });
  const bar = b.frame(root, { x: 0, y: H - 48, w: W, h: 48, fill: "#F3F3F3", stroke: "#DCDCDC", sw: 1 });
  const ctr = b.row(bar, { abs: true, x: 0, y: 0, w: W, h: 48, justify: "center", gap: 4 } as any);
  const slot = (run: boolean, f: (s: Ref) => void) => { const s = b.col(ctr, { w: 40, h: 40, r: 6, align: "center", justify: "center", gap: 3 }); f(s); if (run) b.rect(s, { w: 12, h: 3, r: 2, fill: t.text3 }); };
  slot(false, (s) => { const g = b.frame(s, { w: 18, h: 18, layout: "horizontal", wrap: true, gap: 2, crossGap: 2 } as any); [0, 1, 2, 3].forEach(() => b.rect(g, { w: 8, h: 8, r: 1, fill: "#0A78D4" })); });
  slot(false, (s) => b.icon(s, "search", 18, t.text2)); slot(false, (s) => b.icon(s, "grid", 18, t.text2));
  slot(true, (s) => b.icon(s, "folder", 20, t.warn)); slot(true, (s) => b.ellipse(s, { w: 18, h: 18, fill: t.ok })); slot(true, (s) => { const wd = b.frame(s, { w: 20, h: 20, r: 4, fill: "#2B579A", layout: "horizontal", align: "center", justify: "center" }); b.text(wd, "W", { size: 12, weight: "Bold", c: "#FFFFFF" }); });
  const row = b.row(bar, { abs: true, x: 0, y: 0, w: W, h: 48, pad: [0, 12], justify: "spaceBetween" } as any);
  const wx = b.col(row, { gap: 0 }); b.text(wx, "18°C", { size: 12, weight: "SemiBold", c: t.text }); b.text(wx, "Clear", { size: 12, c: t.text2 });
  const rr = b.row(row, { gap: 6 }); b.icon(rr, "up", 14, t.text2);
  const tk = b.frame(rr, { w: 32, h: 32, r: 6, fill: trayActive ? "#00000012" : "none", layout: "horizontal", align: "center", justify: "center" }); K.logo(b, t, tk, 20);
  b.icon(rr, "volume", 16, t.text2); const dt = b.col(rr, { gap: 0, align: "end", pad: [0, 0, 0, 8] }); b.text(dt, "12:07 PM", { size: 12, c: t.text, ta: "right" }); b.text(dt, "11/1/2026", { size: 12, c: t.text, ta: "right" });
};
// bottom-right anchor: right edge 12px from the screen edge, bottom 12px above the taskbar
const anchor = (b: B, root: Ref, w: number) => b.col(root, { x: ANCH_R - w, y: 0, w, h: ANCH_B, justify: "end", gap: 0, clip: false });
const skipTxt = (b: B, t: T, p: Ref, dir: "back" | "fwd", c: string) => { const f = b.frame(p, { w: 34, h: 34, r: 17, layout: "horizontal", align: "center", justify: "center" }); b.text(f, dir === "back" ? "−10" : "+10", { size: 13, weight: "Bold", c }); return f; };
const trayBtn = (b: B, t: T, p: Ref, icon: string, size = 34, c = t.text2) => { const f = b.frame(p, { w: size, h: size, r: size / 2, layout: "horizontal", align: "center", justify: "center" }); b.icon(f, icon, 17, c); return f; };

type TK = "menu" | "menu-idle" | "menu-loading" | "menu-error";
const trayMenu = (b: B, t: T, root: Ref, kind: TK) => {
  const m = b.col(anchor(b, root, 340), { w: 340, pad: 8, gap: 2, r: 12, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" });
  if (kind === "menu") { const np = b.col(m, { w: "fill", pad: 12, gap: 10, r: 10, fill: t.surface2 }); b.text(np, "NOW READING", { size: 12, weight: "SemiBold", c: t.text2, ls: 1 }); b.text(np, "The quiet return of local-first software", { size: 13.5, weight: "SemiBold", c: t.text, w: "fill", lh: 18 }); const pr = b.row(np, { w: "fill", gap: 8 }); b.text(pr, "2:27", { size: 12, c: t.text2, mono: true }); K.bar(b, t, pr, 0.36, 230, { knob: false }); b.text(pr, "4:21 left", { size: 12, c: t.text2 }); const cr = b.row(np, { w: "fill", justify: "center", gap: 10 }); trayBtn(b, t, cr, "skipBack"); skipTxt(b, t, cr, "back", t.text); const pb = b.frame(cr, { w: 38, h: 38, r: 19, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, "pause", 15, t.ctaText); skipTxt(b, t, cr, "fwd", t.text); trayBtn(b, t, cr, "skipFwd"); }
  const off = kind === "menu-loading" || kind === "menu-error";
  if (kind === "menu-error") { const e = b.row(m, { w: "fill", pad: 12, gap: 10, r: 10, fill: t.errSoft, align: "start" }); b.icon(e, "alertCircle", 18, t.err); const q = b.col(e, { gap: 6, w: "fill" }); b.text(q, "The voice engine stopped", { size: 13.5, weight: "SemiBold", c: t.text }); b.text(q, "Reading can't start until it restarts.", { size: 12.5, c: t.text2, w: "fill" }); K.btn(b, t, q, "Restart engine", { v: "primary", sz: "sm", icon: "refresh" }); }
  [["clipboard", "Read clipboard", "Ctrl+Alt+C", true], ["scan", "Read selected text", "Ctrl+Alt+S", true], ["book", "Open library", "", false], ["mic", "Voice: Heart · 1.2×", "", false], ["sliders", "Settings", "", false], ["power", "Quit Speak Kit", "", false]].forEach(([i, l, k], n) => {
    const dis = off && n < 2;
    const r = b.row(m, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 7, justify: "spaceBetween", fill: n === 0 && kind === "menu-idle" ? t.accentSoft : "none", opacity: dis ? 0.45 : undefined }); const q = b.row(r, { gap: 10 }); b.icon(q, i as string, 15, t.text2); b.text(q, l as string, { size: 13, c: t.text });
    if (k) b.text(r, k as string, { size: 12, c: t.text2 }); if (n === 3) b.icon(r, "right", 14, t.text3);
  });
  b.rect(m, { w: "fill", h: 1, fill: t.border });
  const st = b.row(m, { w: "fill", pad: [8, 10], gap: 8 });
  if (kind === "menu-loading") { K.spinner(b, t, st, 14); b.text(st, "Loading Kokoro-82M… about 5 s", { size: 12, c: t.text2 }); }
  else if (kind === "menu-error") { b.ellipse(st, { w: 8, h: 8, fill: t.err }); b.text(st, "Kokoro stopped · extension waiting", { size: 12, c: t.err, weight: "Medium" }); }
  else { b.ellipse(st, { w: 8, h: 8, fill: t.ok }); b.text(st, "Kokoro ready · extension connected", { size: 12, c: t.text2 }); }
};
type MS = "playing" | "paused" | "preparing" | "done";
const mini = (b: B, t: T, p: Ref, st: MS) => {
  const m = b.col(p, { w: 360, pad: [8, 14, 14, 14], gap: 10, r: 16, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" });
  const gr = b.row(m, { w: "fill", justify: "center" }); b.frame(gr, { w: 36, h: 4, r: 2, fill: t.border });
  const h = b.row(m, { w: "fill", justify: "spaceBetween", gap: 8 }); const l = b.row(h, { gap: 10, w: "fill" }); K.logo(b, t, l, 24);
  const q = b.col(l, { gap: 1, w: "fill" }); b.text(q, "Quarterly report.docx", { size: 13, weight: "SemiBold", c: t.text }); b.text(q, st === "done" ? "Finished · 4:16" : st === "preparing" ? "Preparing voice…" : st === "paused" ? "Paused · 3:12 left" : "3:12 left · Heart · 1.2×", { size: 12, c: t.text2 });
  const r = b.row(h, { gap: 2 }); const pin = b.frame(r, { w: 30, h: 30, r: 15, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(pin, "pin", 15, t.iconQuiet); trayBtn(b, t, r, "x", 30, t.text2);
  b.text(m, st === "preparing" ? "Getting the selected text ready…" : st === "done" ? "That was the whole selection." : "…Notes, documents and even voices lived on someone else's server, rented back to us…", { size: 12.5, c: t.text2, w: "fill", lh: 18 });
  const pr = b.row(m, { w: "fill", gap: 8 }); b.text(pr, st === "done" ? "4:16" : st === "preparing" ? "--:--" : "1:04", { size: 12, c: t.text2, mono: true }); K.bar(b, t, pr, st === "done" ? 1 : st === "preparing" ? 0 : 0.25, 250, { knob: false }); b.text(pr, st === "preparing" ? "" : "4:16", { size: 12, c: t.text2, mono: true });
  const c = b.row(m, { w: "fill", justify: "spaceBetween" }); const sp = b.row(c, { h: 30, pad: [0, 10], r: 15, fill: t.surface2 }); b.text(sp, "1.2×", { size: 12.5, weight: "SemiBold", c: t.text });
  const ctr = b.row(c, { gap: 2, opacity: st === "preparing" ? 0.45 : undefined }); trayBtn(b, t, ctr, "skipBack"); skipTxt(b, t, ctr, "back", t.text); const pb = b.frame(ctr, { w: 40, h: 40, r: 20, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, st === "playing" ? "pause" : st === "done" ? "refresh" : st === "preparing" ? "loader" : "play", 16, t.ctaText); skipTxt(b, t, ctr, "fwd", t.text); trayBtn(b, t, ctr, "skipFwd");
  kebab(b, t, c, 32);
  return m;
};
type IK = TK | "mini" | "mini-states" | "hotkey" | "clip";
const tray = (id: string, title: string, note: string, kind: IK): S => ({
  id, group: "I", title, note, w: W, h: H,
  build: (b, t, root) => {
    if (kind === "mini-states") {
      b.rect(root, { x: 0, y: 0, w: W, h: H, fill: t.bg });
      b.text(root, "Mini player · paused, preparing and finished", { x: 60, y: 60, size: 22, weight: "Bold", c: t.text });
      const r = b.row(root, { x: 60, y: 260, gap: 40, align: "start" });
      [["Paused", "paused"], ["Preparing", "preparing"], ["Finished", "done"]].forEach(([l, s]) => { const q = b.col(r, { gap: 12 }); b.text(q, l, { size: 13, weight: "SemiBold", c: t.text2 }); mini(b, t, q, s as MS); });
      return;
    }
    scene(b, t, root, kind !== "mini" && kind !== "hotkey" && kind !== "clip");
    if (kind === "menu" || kind === "menu-idle" || kind === "menu-loading" || kind === "menu-error") trayMenu(b, t, root, kind);
    if (kind === "mini") {
      mini(b, t, anchor(b, root, 360), "playing");
      tip(b, t, root, 1222, 534, 150, "Always on top: on");
    }
    if (kind === "hotkey") {
      const h = b.row(anchor(b, root, 540), { w: 540, pad: [10, 12, 10, 14], gap: 12, r: 16, fill: t.raised, shadow: "lg" });
      K.logo(b, t, h, 32); const q = b.col(h, { gap: 2, w: "fill" }); b.text(q, "Reading selection from Word", { size: 14, weight: "SemiBold", c: t.text }); b.text(q, "Ctrl+Alt+Space pause · Ctrl+Alt+X stop", { size: 12, c: t.text3 });
      K.waveform(b, t, h, 44, 20, 0.5, 6);
      const pb = b.frame(h, { w: 34, h: 34, r: 17, fill: t.chipGray, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "pause", 14, t.text);
      const sb = b.row(h, { h: 34, pad: [0, 12], gap: 6, r: 17, fill: t.cta }); b.icon(sb, "stop", 13, t.ctaText); b.text(sb, "Stop", { size: 12.5, weight: "SemiBold", c: t.ctaText });
    }
    if (kind === "clip") {
      const c = b.col(anchor(b, root, 360), { w: 360, pad: 16, gap: 10, r: 14, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" });
      const h = b.row(c, { w: "fill", justify: "spaceBetween" }); const hl = b.row(h, { gap: 8 }); K.logo(b, t, hl, 20); b.text(hl, "Speak Kit", { size: 12.5, weight: "SemiBold", c: t.text2 }); const hr = b.row(h, { gap: 2 }); kebab(b, t, hr, 28); trayBtn(b, t, hr, "x", 28);
      b.text(c, "Copied text: read it?", { size: 15, weight: "Bold", c: t.text }); b.text(c, "“For a decade, the default answer to every software question…” · 412 words · about 2 min", { size: 12.5, c: t.text2, w: "fill", lh: 18 });
      b.text(c, "Click to read it. A Windows toast carries no buttons.", { size: 12, c: t.text3 });
      const cd = b.row(c, { w: "fill", gap: 10 }); K.bar(b, t, cd, 0.7, 190, { knob: false }); b.text(cd, "Closes in 6 s", { size: 12, c: t.text2 });
      b.text(c, "Turn this off any time in Settings > General.", { size: 12, c: t.text2 });
      const pm = popover(b, t, root, 1220, 457, 240); const pr = b.row(pm, { w: "fill", h: 34, pad: [0, 10], gap: 10, r: 6 }); b.icon(pr, "eyeOff", 15, t.text2); b.text(pr, "Turn off clipboard prompts", { size: 13, c: t.text });
    }
  },
});
export const I: S[] = [
  tray("I1", "Tray menu · playing", "Windows 11 tray flyout, 12 px above the taskbar and aligned to the right edge: mini controls, Ctrl+Alt shortcuts, voice submenu, engine status.", "menu"),
  tray("I2", "Tray menu · idle", "Same flyout when nothing is playing.", "menu-idle"),
  tray("I3", "Mini player · always on top", "Draggable header, time left, pin state with tooltip, previous/next and −10 / +10, overflow menu for the sleep timer. The document text stays visible.", "mini"),
  tray("I4", "Global shortcut toast", "Ctrl+Alt+S reads the selected text in any app. The toast offers pause and Stop; Esc is not captured.", "hotkey"),
  tray("I5", "Clipboard prompt", "Optional prompt after copying long text. Skips password-manager copies. Turn off lives in the … menu, with an 8 s countdown.", "clip"),
  tray("I7", "Tray menu · engine loading", "Read actions are disabled while Kokoro loads; status shows the wait.", "menu-loading"),
  tray("I8", "Tray menu · engine error", "Engine stopped: red status, Restart engine, read actions disabled.", "menu-error"),
  tray("I9", "Mini player · states", "Paused, preparing the voice, and finished (replay).", "mini-states"),
];

// ---------------- J: export ----------------
type JS = "dialog" | "progress" | "done" | "overwrite" | "pill" | "toast";
const exp = (id: string, title: string, note: string, st: JS): S => ({
  id, group: "J", title, note, w: W, h: H,
  build: (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "library" });
    libBackdrop(b, t, main, { exporting: st === "pill" || st === "toast" ? st === "pill" : false });
    if (st === "pill") {
      const p = b.col(win, { abs: true, x: 12, y: 560, w: 208, pad: 12, gap: 8, r: 12, fill: t.well, stroke: t.control, sw: 1 } as any);
      const r = b.row(p, { w: "fill", justify: "spaceBetween" }); const l = b.row(r, { gap: 6 }); K.spinner(b, t, l, 14); b.text(l, "Exporting audio", { size: 12.5, weight: "SemiBold", c: t.text }); b.text(r, "44%", { size: 12.5, weight: "Bold", c: t.accent });
      K.bar(b, t, p, 0.44, 184, { knob: false }); const f = b.row(p, { w: "fill", justify: "spaceBetween" }); b.text(f, "0:26 left", { size: 12, c: t.text2 }); b.text(f, "Cancel", { size: 12, weight: "SemiBold", c: t.err });
      return;
    }
    if (st === "toast") { const c = corner(b, win); K.toast(b, t, c, "Export complete", "ok", { action: "Show in folder" }); return; }
    if (st === "overwrite") {
      const d = modalBox(b, t, win, 520); closeX(b, t, d, 520);
      const bd = b.col(d, { w: "fill", pad: [28, 28, 20, 28], gap: 14 });
      const ic = b.frame(bd, { w: 52, h: 52, r: 26, fill: t.warnSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "file", 24, t.warn);
      b.text(bd, "Replace the existing file?", { size: 19, weight: "Bold", c: t.text }); b.text(bd, "A file named quiet-return-of-local-first-software.mp3 already exists in D:\\Audio\\Speak Kit.", { size: 14, c: t.text2, w: "fill", lh: 21 });
      const f = b.row(bd, { w: "fill", pad: [10, 12], gap: 10, r: 8, fill: t.surface2 }); b.icon(f, "info", 15, t.text2); b.text(f, "6.5 MB · saved yesterday at 4:12 PM. Keep both saves the new one as …(2).mp3.", { size: 12.5, c: t.text2, w: "fill" });
      dFoot(b, t, d, undefined, (r) => { K.btn(b, t, r, "Choose another name", { v: "ghost" }); K.btn(b, t, r, "Keep both", { v: "secondary" }); K.btn(b, t, r, "Replace", { v: "danger" }); });
      return;
    }
    const w = st === "dialog" ? 620 : 560; const d = modalBox(b, t, win, w);
    dHead(b, t, d, st === "done" ? "Export complete" : st === "progress" ? "Exporting audio…" : "Export audio", "The quiet return of local-first software · 6:48", st !== "progress");
    const bd = b.col(d, { w: "fill", pad: [0, 24, 20, 24], gap: 6 });
    if (st === "dialog") {
      K.settingRow(b, t, bd, "Format", "MP3 is smaller; WAV is lossless.", (f) => K.seg(b, t, f, ["MP3", "WAV", "M4A"], 0)); K.divider(b, t, bd);
      K.settingRow(b, t, bd, "Quality", "Higher is larger. Not used for WAV.", (f) => K.select(b, t, f, "128 kbps", 170)); K.divider(b, t, bd);
      K.settingRow(b, t, bd, "Voice and speed", "Uses the voice and speed of this reading.", (f) => { b.text(f, "Heart · 1.2×", { size: 13.5, weight: "SemiBold", c: t.text }); K.btn(b, t, f, "Change", { v: "ghost", sz: "sm" }); }); K.divider(b, t, bd);
      K.settingRow(b, t, bd, "Split by section", "One file per heading, named 01, 02…", (f) => K.toggle(b, t, f, false)); K.divider(b, t, bd);
      K.settingRow(b, t, bd, "File name", undefined, (f) => K.input(b, t, f, { value: "quiet-return-of-local-first-software", right: ".mp3", w: 340, h: 34 })); K.divider(b, t, bd);
      K.settingRow(b, t, bd, "Save to", undefined, (f) => { K.input(b, t, f, { value: "D:\\Audio\\Speak Kit", icon: "folder", w: 250, h: 34 }); K.btn(b, t, f, "Browse…", { v: "secondary", sz: "sm" }); });
      const e = b.row(bd, { w: "fill", pad: 12, gap: 10, r: 10, fill: t.surface2 }); b.icon(e, "info", 15, t.text2); b.text(e, "About 6.5 MB at 128 kbps. Takes under a minute on this PC.", { size: 12.5, c: t.text2, w: "fill" });
      dFoot(b, t, d, undefined, (r) => { K.btn(b, t, r, "Cancel", { v: "ghost" }); K.btn(b, t, r, "Export", { v: "primary", icon: "download" }); });
    } else if (st === "progress") {
      const r = b.row(bd, { w: "fill", justify: "spaceBetween" }); b.text(r, "Rendering sentence 52 of 118", { size: 14, weight: "SemiBold", c: t.text }); b.text(r, "44% · 0:26 left", { size: 13, c: t.text2 });
      K.bar(b, t, bd, 0.44, 512, { knob: false }); b.text(bd, "Run in background to keep using Speak Kit. A notice appears when the file is ready.", { size: 12.5, c: t.text2, w: "fill" });
      dFoot(b, t, d, undefined, (r) => { dangerBtn(b, t, r, "Cancel export"); K.btn(b, t, r, "Run in background", { v: "primary" }); });
    } else {
      const r = b.row(bd, { w: "fill", gap: 14, pad: [6, 0] }); const ic = b.frame(r, { w: 48, h: 48, r: 24, fill: t.okSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "check", 24, t.ok); const x = b.col(r, { gap: 2, w: "fill" }); b.text(x, "quiet-return-of-local-first-software.mp3", { size: 14, weight: "SemiBold", c: t.text }); b.text(x, "6.5 MB · 6:48 · 128 kbps", { size: 12.5, c: t.text2 });
      const pr = b.row(bd, { w: "fill", gap: 10 }); b.icon(pr, "folder", 14, t.text3); b.text(pr, "D:\\Audio\\Speak Kit\\quiet-return-of-local-first-software.mp3", { size: 12.5, c: t.text2, w: "fill" }); K.btn(b, t, pr, "Copy path", { v: "ghost", sz: "sm", icon: "copy" });
      const p = b.row(bd, { w: "fill", gap: 12, pad: 12, r: 10, fill: t.surface2 }); const pb = b.frame(p, { w: 36, h: 36, r: 18, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.icon(pb, "play", 14, t.ctaText); K.waveform(b, t, p, 350, 28, 0, 3); b.text(p, "0:00 / 6:48", { size: 12, c: t.text2, mono: true });
      dFoot(b, t, d, undefined, (r) => { K.btn(b, t, r, "Done", { v: "ghost" }); K.btn(b, t, r, "Open file", { v: "secondary", icon: "external" }); K.btn(b, t, r, "Show in folder", { v: "primary", icon: "folder" }); });
    }
  },
});
export const J: S[] = [
  exp("J1", "Export · options", "Format, MP3 quality, voice and speed, file name, folder with Browse, size estimate.", "dialog"),
  exp("J2", "Export · rendering", "Progress per sentence. Run in background is primary; Cancel export is destructive. No header X.", "progress"),
  exp("J3", "Export · done", "Full-width preview with time, path with Copy, Open file and Show in folder.", "done"),
  exp("J5", "Export · file exists", "Replace, Keep both, or Choose another name.", "overwrite"),
  exp("J6", "Export · in background", "Sidebar progress pill and the library row show the running export.", "pill"),
  exp("J7", "Export · complete toast", "Non-blocking toast with Show in folder.", "toast"),
];

// ---------------- K: system states ----------------
type KS = "crash" | "port" | "disk" | "corrupt" | "repair" | "version" | "mic" | "instance" | "offline-ok";
type KD = { icon: string; tone: "err" | "warn" | "info"; title: string; body: string; detail?: string; primary: string; secondary?: string };
export const KDEF: Record<string, KD> = {
  crash: { icon: "alert", tone: "err", title: "The voice engine stopped unexpectedly", body: "Speak Kit is restarting Kokoro. Your reading was interrupted at 2:27 and your library and settings are safe.", detail: "tts-worker exited with code 3221225477 (0xC0000005) at 12:04:31", primary: "Resume reading", secondary: "Copy diagnostics" },
  port: { icon: "alert", tone: "warn", title: "Speak Kit can't reach the browser extension", body: "Another program is using the port the extension talks to. Pick another port; the extension is re-paired automatically.", detail: "Port 51730 is in use (EADDRINUSE 127.0.0.1:51730)", primary: "Use port 51731", secondary: "Choose a port…" },
  disk: { icon: "hardDrive", tone: "warn", title: "Not enough disk space", body: "Chatterbox needs 2.4 GB, but the models folder on E:\\ has only 1.1 GB free. Free some space or choose another models folder.", primary: "Choose another folder", secondary: "Manage storage" },
  corrupt: { icon: "shield", tone: "err", title: "A model file failed its check", body: "Kokoro's model file doesn't match its checksum, so it won't be loaded. This can happen after an interrupted download or if antivirus changed the file.", detail: "kokoro-v1.0.q8.onnx · expected sha256 3f9a…c1d2 · got 77b0…e8a4", primary: "Repair", secondary: "Open Engines" },
  repair: { icon: "shield", tone: "err", title: "Repairing the Kokoro model", body: "Downloading a fresh copy and checking it. You can keep using the app; reading resumes when it's done.", primary: "Run in background", secondary: "Cancel" },
  version: { icon: "refresh", tone: "info", title: "The extension is out of date", body: "Chrome extension 0.3.9 can't talk to app 0.4.2. Update it from the Chrome Web Store; reading from the desktop app still works.", primary: "Open Web Store", secondary: "Remind me later" },
  mic: { icon: "mic", tone: "warn", title: "Microphone access is off", body: "Windows blocks Speak Kit from using the microphone, which is needed to record a voice sample. You can upload an audio file instead.", primary: "Open Windows settings", secondary: "Upload a file" },
};
const sys = (id: string, title: string, note: string, st: KS): S => ({
  id, group: "K", title, note, w: W, h: H,
  build: (b, t, root) => {
    const sb = { crash: { label: "Kokoro-82M · Restarting…", sub: "Engine stopped unexpectedly", tone: "warn" as const }, port: { label: "Extension link blocked", sub: "Port 51730 is in use", tone: "err" as const }, corrupt: { label: "Kokoro-82M · Needs repair", sub: "Model failed its check", tone: "err" as const }, repair: { label: "Kokoro-82M · Repairing", sub: "Downloading 330 MB", tone: "warn" as const } } as Record<string, any>;
    const nav = st === "disk" ? "engines" : st === "port" ? "settings" : st === "mic" ? "voices" : "library";
    const { win, main } = K.desktopWindow(b, t, root, { nav, status: sb[st], settingsKey: "browser" });
    if (st === "crash") readerBackdrop(b, t, main);
    else if (st === "port") settingsScreen(b, t, win, main, "browser", { portConflict: true });
    else if (st === "disk") enginesScreen(b, t, win, main, "engines");
    else if (st === "mic") cloneScreen(b, t, win, main, "clone1");
    else if (st === "version") libBackdrop(b, t, main, { banner: (m) => { const bn = b.row(m, { w: "fill", h: 52, pad: [0, 20], gap: 12, fill: t.infoSoft }); b.icon(bn, "refresh", 18, t.info); b.text(bn, "Chrome extension 0.3.9 is out of date. It can't talk to app 0.4.2; reading in the desktop app still works.", { size: 13, weight: "Medium", c: t.text, w: "fill" }); K.btn(b, t, bn, "Open Web Store", { v: "secondary", sz: "sm", icon: "external" }); K.btn(b, t, bn, "Remind me later", { v: "ghost", sz: "sm" }); K.iconBtn(b, t, bn, "x", { size: 28 }); b.rect(m, { w: "fill", h: 1, fill: t.border }); } });
    else if (st === "instance") { libBackdrop(b, t, main); K.toast(b, t, corner(b, win), "Speak Kit was already running. Showing your window.", "neutral"); }
    else if (st === "offline-ok") { libBackdrop(b, t, main, { right: (r) => K.badge(b, t, r, "Offline", "warn", "wifiOff") }); K.toast(b, t, corner(b, win), "You're offline. Reading still works; downloads wait until you're back.", "neutral", { icon: "wifiOff" }); }
    else libBackdrop(b, t, main);
    const d = st === "version" ? undefined : KDEF[st]; if (!d) return;
    const dl = modalBox(b, t, win, 500); closeX(b, t, dl, 500);
    const body = b.col(dl, { w: "fill", pad: [24, 24, 16, 24], gap: 12 });
    const ic = b.frame(body, { w: 52, h: 52, r: 14, fill: K.tint(d.tone === "err" ? t.err : d.tone === "warn" ? t.warn : t.info, 0.12), layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, d.icon, 24, d.tone === "err" ? t.err : d.tone === "warn" ? t.warn : t.info);
    b.text(body, d.title, { size: 16, weight: "SemiBold", c: t.text, w: "fill" }); b.text(body, d.body, { size: 13, c: t.text2, w: "fill", lh: 19 });
    if (st === "repair") { const pr = b.row(body, { w: "fill", gap: 12 }); K.bar(b, t, pr, 0.62, 380, { knob: false }); b.text(pr, "62%", { size: 14, weight: "Bold", c: t.text, w: 44, ta: "right" }); b.text(body, "205 MB of 330 MB · about 20 s left", { size: 12.5, c: t.text2 }); }
    if (d.detail) { const c = b.col(body, { w: "fill", gap: 6 }); const dr = b.row(c, { gap: 6 }); b.icon(dr, "right", 13, t.text2); b.text(dr, "Details", { size: 13, weight: "Medium", c: t.text2 }); if (st === "crash" || st === "port") { const bx = b.row(c, { w: "fill", pad: [10, 12], r: 8, fill: t.surface2 }); b.text(bx, d.detail, { size: 12, c: t.text2, mono: true, w: "fill", lh: 17 }); } }
    const f = b.row(dl, { w: "fill", pad: [4, 24, 20, 24], gap: 8, justify: "max", clip: false });
    if (d.secondary) K.btn(b, t, f, d.secondary, { v: "ghost", sz: "dlg" });
    K.btn(b, t, f, d.primary, { v: "primary", sz: "dlg" });
  },
});
export const Ks: S[] = [
  sys("K1", "Error · engine crashed", "Over the reader with the player visible. Sidebar shows Restarting…; Details holds the exit code.", "crash"),
  sys("K2", "Error · port in use", "Over Settings > Browser integration. Sidebar shows Extension link blocked; port number lives in Details.", "port"),
  sys("K3", "Error · low disk space", "Over Engines at the Chatterbox download card, with a hard-drive icon.", "disk"),
  sys("K4", "Error · model checksum failed", "Over the library. Repair is the primary action; checksum sits behind Details; Open Engines because Chatterbox isn't installed.", "corrupt"),
  sys("K5", "Notice · extension out of date", "Non-blocking banner under the title bar; no dialog.", "version"),
  sys("K6", "Permission · microphone blocked", "Over the clone screen after Record now. Upload a file is the alternative.", "mic"),
  sys("K7", "Notice · already running", "No dialog: the existing window is restored and a toast says why.", "instance"),
  sys("K8", "Notice · offline", "Status chip in the header plus a toast; nothing blocks the app.", "offline-ok"),
  sys("K10", "Error · repairing model", "Repair progress with size and time left; can run in the background.", "repair"),
];
