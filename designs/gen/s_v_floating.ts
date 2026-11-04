// Floating and system surfaces, drawn as the built UI (shots in designs/built/shots) inside the real Windows context (kit3).
// Tray panel, mini player, native tray menu, Windows toasts. Light only. Card sizes: panel 322x330, mini 362x114 (FLOAT_PAD 24 is transparent in the shots).
import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import * as K3 from "./kit3";

const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = 1440, h = 900): S => ({ id, group, title, note, w, h, build });
const DESIGN_ONLY = " Design-only: an OS surface that cannot be screenshotted; drawn from the real code.";
const SHORTCUT = "Ctrl+Alt+S";


/** Square icon button like ui IconButton (36 default, 28 sm, 24 xs); pause is drawn as the solid glyph lumen.css makes (two bars with a 2.75 px stroke merge). */
const ibtn = (b: B, t: T, p: Ref, icon: string, size: number, o: { bg?: string; c?: string; r?: number } = {}) => {
  const c = o.c ?? t.text; const g = size === 24 ? 12 : size === 28 ? 14 : 16;
  const f = b.frame(p, { w: size, h: size, r: o.r ?? (size <= 24 ? 6 : 8), fill: o.bg ?? "none", layout: "horizontal", align: "center", justify: "center" });
  if (icon !== "pause") { b.icon(f, icon, g, c); return f; }
  const w = b.frame(f, { w: g, h: g });
  const k = g / 16; [2.6, 8.2].forEach((x) => b.rect(w, { x: x * k, y: 1.96 * k, w: 5.2 * k, h: 12.08 * k, r: 1.5 * k, fill: c }));
  return f;
};
/** ProgressBar thin: 3 px track at 240 px, accent fill; no fill at 0. */
const thin = (b: B, t: T, p: Ref, v: number | undefined) => {
  const f = b.frame(p, { w: 240, h: 3, r: 2, fill: t.track, clip: true });
  if (v === undefined) b.rect(f, { x: 216, y: 0, w: 24, h: 3, r: 2, fill: t.accent }); else if (v > 0) b.rect(f, { x: 0, y: 0, w: 240 * v, h: 3, r: 2, fill: t.accent });
  return f;
};

// ------------------------------------------------------------------ tray panel (apps/desktop renderer/panel.tsx + float.css)
type Eng = { pill: string; tone: "ok" | "info" | "err"; icon?: string };
type Now = { title: string; status: string; icon: "pause" | "play"; left: string; pct: number; next?: string } | null;
const caps = (b: B, t: T, p: Ref, s: string) => b.text(p, s.toUpperCase(), { size: 11, c: t.text3, ls: 0.66, lh: 15 });
export const panelCard = (b: B, t: T, parent: Ref, x: number, y: number, eng: Eng, now: Now, w = 322) => {
  const c = b.col(parent, { name: "Tray panel", x, y, w, h: 330, pad: [0, 8, 8, 8], gap: 12, r: 14, fill: t.surface, shadow: "lg", clip: true });
  const hd = b.row(c, { w: "fill", h: 32, gap: 8 });
  b.frame(hd, { w: 0, h: 1 });
  K3.skLogo(b, hd, 20);
  b.text(hd, "Speak Kit", { size: 13, weight: "Medium", c: t.text, lh: 16 });
  K.badge(b, t, hd, eng.pill, eng.tone, eng.icon);
  b.frame(hd, { w: "fill", h: 1 });
  ibtn(b, t, hd, "settings", 28);
  const s1 = b.col(c, { w: "fill", gap: 6 }); caps(b, t, s1, "Now playing");
  if (!now) b.text(s1, `Nothing is playing. Select text in any app and press ${SHORTCUT}.`, { size: 12, c: t.text2, w: "fill", lh: 17 });
  else {
    const n = b.col(s1, { w: "fill", pad: 10, gap: 8, r: 10, fill: t.well });
    const r = b.row(n, { w: "fill", gap: 8 });
    const tx = b.col(r, { w: "fill", gap: 0 });
    b.text(tx, now.title, { size: 13, weight: "SemiBold", c: t.text, w: "fill", maxLines: 1, lh: 16 });
    b.text(tx, now.status, { size: 12, c: t.text2, w: "fill", maxLines: 1, lh: 15 });
    ibtn(b, t, r, now.icon, 36);
    ibtn(b, t, r, "stop", 36);
    thin(b, t, n, now.pct);
    b.text(n, `${now.left} left`, { size: 12, c: t.text2, lh: 17 });
  }
  if (now?.next) { const s2 = b.col(c, { w: "fill", gap: 6 }); caps(b, t, s2, "Next in queue"); b.text(s2, now.next, { size: 13, c: t.text, w: "fill", maxLines: 1, lh: 18 }); }
  b.frame(c, { w: 1, h: "fill" });
  const ft = b.row(c, { w: "fill", gap: 8 });
  K.btn(b, t, ft, "Open Speak Kit", { v: "primary", w: "fill" });
  return c;
};
const NOW_PLAYING: Now = { title: "One short sentence here. A second sentence follows it. A third", status: "Sentence 1 of 3", icon: "pause", left: "0:06", pct: 0, next: "A second sentence follows it." };
const NOW_PAUSED: Now = { ...NOW_PLAYING!, status: "Paused · sentence 1 of 3", icon: "play" };
const READY: Eng = { pill: "Ready", tone: "ok" };

const desk = (b: B, root: Ref, o: Partial<Parameters<typeof K3.desktopWithTaskbar>[2]> = {}) => K3.desktopWithTaskbar(b, root, { w: 1440, h: 900, trayActive: true, ...o });
/** Card position above the tray icon (windows.ts aboveTray): centred on the icon, 12 px above its top, 8 px from the work-area edge. */
export const panelAt = (d: K3.Desktop, w = 322, h = 330) => ({ x: Math.min(Math.max(8, Math.round(d.trayIcon.x + d.trayIcon.w / 2 - w / 2)), d.w - w - 8), y: d.trayIcon.y - 12 - h });
const trayScene = (eng: Eng, now: Now, w = 322) => (b: B, t: T, root: Ref) => {
  const d = desk(b, root); const p = panelAt(d, w);
  panelCard(b, t, d.ref, p.x, p.y, eng, now, w);
};

// ------------------------------------------------------------------ mini player (mini.tsx)
type Mini = { title: string; status: string; left: string; play: "pause" | "play" | "refresh"; pct: number | undefined; err?: boolean };
export const miniCard = (b: B, t: T, parent: Ref, x: number, y: number, m: Mini, w = 362) => {
  const c = b.col(parent, { name: "Mini player", x, y, w, h: w === 362 ? 114 : 112, gap: 0, r: 12, fill: t.surface, shadow: "lg", clip: true });
  const hd = b.row(c, { w: "fill", pad: [10, 8, 8, 14], gap: 8 });
  K3.skLogo(b, hd, 18);
  const tx = b.col(hd, { w: "fill", gap: 0 });
  b.text(tx, m.title, { size: 13, weight: "SemiBold", c: t.text, w: "fill", maxLines: 1, lh: 16 });
  b.text(tx, m.status, { size: 12, c: m.err ? t.err : t.text2, w: "fill", maxLines: 1, lh: 17 });
  if (m.left) b.text(hd, m.left, { size: 12, c: t.text2, lh: 17 });
  ibtn(b, t, hd, "lock", 24);
  ibtn(b, t, hd, "x", 24);
  thin(b, t, c, m.pct);
  const ctl = b.row(c, { w: "fill", h: "fill", gap: 8, justify: "center" });
  ibtn(b, t, ctl, "skipBack", 28);
  ibtn(b, t, ctl, "back10", 28);
  ibtn(b, t, ctl, m.play, 36, { bg: t.cta, c: t.ctaText, r: 18 });
  ibtn(b, t, ctl, "fwd10", 28);
  ibtn(b, t, ctl, "skipFwd", 28);
  return c;
};
const miniScene = (m: Mini, w = 362) => (b: B, t: T, root: Ref) => {
  const d = desk(b, root, { trayActive: false }); const p = d.cornerAt(w, 112 + (w === 362 ? 2 : 0));
  miniCard(b, t, d.ref, p.x, p.y, m, w);
};
const MT = "One short sentence here. A second sentence follows it. A third";

// ------------------------------------------------------------------ native tray menu (tray.ts menuTemplate + shared/tray.ts trayMenuModel)
const trayMenu = (b: B, t: T, root: Ref) => {
  const d = desk(b, root);
  const items: K3.MenuItem[] = [{ l: "Open Speak Kit" }, { l: "Pause", k: "Ctrl+Alt+Space" }, { l: "Stop", k: "Ctrl+Alt+X" }, "-", { l: "Do not disturb" }, { l: "Settings" }, { l: "Check for updates" }, "-", { l: "Quit Speak Kit" }];
  const w = 248, h = 8 + items.reduce((a, i) => a + (i === "-" ? 9 : 32), 0);
  K3.nativeMenu(b, d.ref, { x: Math.min(d.trayIcon.x + d.trayIcon.w / 2 - w + 24, d.w - w - 8), y: d.taskbar.y - 4 - h, items, w, style: "win" });
};

// ------------------------------------------------------------------ toasts (main/notify-rules.ts, updates-service.ts, export/service.ts, reader/service.ts)
const TOASTS = {
  ...K3.TOAST,
  exportDone: { title: "Export finished", body: "My note.wav is saved. Click to show it in its folder." },
  finished: { title: "Finished reading", body: "The quiet return of local-first software" },
};
const toastStack = (list: { title: string; body: string }[]) => (b: B, t: T, root: Ref) => {
  const d = desk(b, root, { trayActive: false }); let above = 0;
  for (const T0 of list) { K3.winToast(b, d.ref, { ...d.toastAt(K3.toastH(T0), above), ...T0 }); above += K3.toastH(T0) + 8; }
};


// ------------------------------------------------------------------ Home inside the Windows window (shots K1, K2, K11, L1-notifications, J7): TitleBar, Sidebar, Home page, Footer, Quit dialog, bell popover
const MONO = "Consolas";
type HomeO = { status?: "ok" | "err"; token?: string; port?: number; engine?: { label: string; detail: string; err?: boolean; retry?: boolean }; banner?: { title: string; body: string }; footer?: string[]; pill?: string; exp?: boolean };
const kbd = (b: B, t: T, p: Ref, s: string, dark = false) => { const k = b.row(p, { h: 16, pad: [0, 4], r: 4, stroke: dark ? "#FFFFFF66" : t.control, sw: 1, sa: "inside" }); b.text(k, s, { size: 10, c: dark ? "#FFFFFFCC" : t.text2, lh: 12 }); return k; };
const stat = (b: B, t: T, p: Ref, label: string, value: string, dotc: string, detail: (r: Ref) => void) => {
  const c = b.col(p, { w: "fill", h: "fill", pad: [14, 16, 14, 16], gap: 0, r: 12, fill: t.surface, shadow: "card", stroke: "#0000000A", sw: 1, sa: "inside" });
  b.text(c, label.toUpperCase(), { size: 11, weight: "Medium", c: t.text2, ls: 0.55, lh: 15 });
  b.frame(c, { w: 1, h: 4 });
  const v = b.row(c, { gap: 8, h: 22 }); b.ellipse(v, { w: 8, h: 8, fill: dotc }); b.text(v, value, { size: 15, weight: "SemiBold", c: t.text, lh: 22 });
  b.frame(c, { w: 1, h: 2 });
  detail(c);
  return c;
};
const sect = (b: B, t: T, p: Ref, title: string, desc: string, body: (c: Ref) => void) => {
  const s = b.col(p, { w: "fill", gap: 8 });
  const h = b.col(s, { w: "fill", gap: 0 }); b.text(h, title, { size: 15, weight: "SemiBold", c: t.text, lh: 18 }); b.text(h, desc, { size: 12, c: t.text3, w: "fill", lh: 18 });
  const c = b.col(s, { w: "fill", r: 12, fill: t.surface, shadow: "card", stroke: "#0000000A", sw: 1, sa: "inside", gap: 0, clip: true }); body(c);
  return c;
};
const srow = (b: B, t: T, p: Ref, label: string, desc: string, first: boolean, actions: (r: Ref) => void) => {
  if (!first) b.rect(p, { w: "fill", h: 1, fill: t.border });
  const r = b.row(p, { w: "fill", h: 57, pad: [0, 12, 0, 16], gap: 8 });
  const x = b.col(r, { w: "fill", gap: 0 }); b.text(x, label, { size: 13, weight: "Medium", c: t.text, lh: 18 }); b.text(x, desc, { size: 12, c: t.text3, lh: 17 });
  actions(r);
};
export const homeShell = (b: B, t: T, c: Ref, o: HomeO = {}) => {
  const W = 1278, H = 799;
  b.rect(c, { x: 0, y: 0, w: W, h: H, fill: t.bg });
  // title bar
  const ib = (x: number, ic: string, col = t.text) => { const f = b.frame(c, { x, y: 4, w: 28, h: 28, r: 6, layout: "horizontal", align: "center", justify: "center" }); b.icon(f, ic, 14, col); };
  ib(8, "sidebar"); ib(40, "left", t.iconQuiet); ib(72, "right", t.iconQuiet);
  const se = b.row(c, { x: 433, y: 4, w: 420, h: 28, pad: [0, 8, 0, 10], gap: 8, r: 8, fill: t.surface, stroke: t.control, sw: 1, sa: "inside", shadow: "ctl" });
  b.icon(se, "search", 16, t.text3); b.text(se, "Search readings, voices and commands", { size: 13, c: t.text3, w: "fill", lh: 18 }); kbd(b, t, se, "Ctrl K");
  const pill = b.row(c, { x: 1058, y: 8, w: "hug" }); K.badge(b, t, pill, o.pill ?? (o.status === "err" ? "Error" : "Ready"), o.status === "err" ? "err" : "ok");
  ib(1113, "bell");
  // sidebar
  const nw = b.row(c, { x: 8, y: 38, w: 236, h: 36, pad: [0, 8, 0, 12], gap: 8, r: 8, fill: t.cta, shadow: "cta" });
  b.icon(nw, "plus", 16, t.ctaText); b.text(nw, "New reading", { size: 13, weight: "Medium", c: t.ctaText, w: "fill", lh: 16 }); kbd(b, t, nw, "Ctrl N", true);
  [["Home", "home"], ["Library", "book"], ["Voices", "mic"], ["Engines", "cpu"], ["Browser", "globe"]].forEach(([l, ic], i) => {
    const r = b.row(c, { x: 8, y: 86 + i * 38, w: 236, h: 36, pad: [0, 8, 0, 11], gap: 8, r: 8 });
    b.icon(r, ic, 16, i === 0 ? t.text : t.text2); b.text(r, l, { size: 13, weight: i === 0 ? "Medium" : "Regular", c: i === 0 ? t.text : t.text2, lh: 18 });
  });
  b.text(c, "Recent", { x: 18, y: 290, size: 12, weight: "Medium", c: t.text3, lh: 16 });
  b.text(c, "Readings you start appear here.", { x: 18, y: 317, size: 12, c: t.text3, lh: 16 });
  if (o.exp) { const e = b.col(c, { x: 8, y: 620, w: 236, h: 41, pad: [8, 12, 0, 12], gap: 6, r: 10, fill: t.surface, stroke: t.text, sw: 2, sa: "inside" }); b.text(e, "My note.wav", { size: 12, c: t.text, lh: 16 }); b.rect(e, { w: "fill", h: 3, r: 2, fill: t.track }); }
  const ec = b.col(c, { x: 8, y: o.exp ? 672 : 673, w: 236, h: 54, pad: [10, 12], gap: 2, r: 10, fill: t.surface, shadow: "card" });
  b.text(ec, `Kokoro-82M · ${o.status === "err" ? "Error" : "Ready"}`, { size: 13, weight: "Medium", c: t.text, lh: 18 });
  const lk = b.row(ec, { gap: 6 }); b.icon(lk, "lock", 12, t.ok); b.text(lk, "100% on this device", { size: 12, c: t.ok, lh: 16 });
  const st = b.row(c, { x: 8, y: 739, w: 236, h: 24, pad: [0, 0, 0, 11], gap: 11 }); b.icon(st, "settings", 16, t.text2); b.text(st, "Settings", { size: 13, c: t.text2, lh: 18 });
  // content panel
  b.rect(c, { x: 252, y: 36, w: 1018, h: 735, r: 14, fill: t.surface, shadow: "card" });
  const pg = b.col(c, { x: 409, y: 56, w: 704, gap: 16 });
  const hd = b.col(pg, { w: "fill", gap: 1 }); b.text(hd, "Home", { size: 22, weight: "SemiBold", c: t.text, lh: 30 }); b.text(hd, "Speak Kit runs a private voice server on this computer. Your browser extension talks to it.", { size: 13, c: t.text2, lh: 18 });
  if (o.banner) { const bn = b.row(pg, { w: "fill", pad: [10, 16, 10, 16], gap: 12, r: 8, fill: t.warnSoft }); b.icon(bn, "alert", 18, t.warn); const bx = b.col(bn, { w: "fill", gap: 0 }); b.text(bx, o.banner.title, { size: 13, weight: "SemiBold", c: t.text, lh: 18 }); b.text(bx, o.banner.body, { size: 12, c: t.text2, w: "fill", lh: 17 }); }
  const eng = o.engine ?? { label: "Ready", detail: "Kokoro-82M, runs on the CPU" };
  const g = b.row(pg, { w: "fill", h: eng.retry ? 117 : 89, gap: 12, align: "stretch" });
  stat(b, t, g, "Server", "Running", t.dotGreen, (r) => { const d = b.row(r, { gap: 0 }); b.text(d, "Listening on ", { size: 12, c: t.text2, lh: 17 }); b.text(d, `127.0.0.1:${o.port ?? 48158}`, { size: 11.5, c: t.text, ff: MONO, lh: 17 }); });
  stat(b, t, g, "Voice engine", eng.label, eng.err ? t.dotRed : t.dotGreen, (r) => { b.text(r, eng.detail, { size: 12, c: t.text2, w: "fill", lh: 17 }); if (eng.retry) K.btn(b, t, r, "Retry", { v: "secondary", sz: "sm" }); });
  sect(b, t, pg, "Pairing token", "Paste this token in the extension under Options > General > Pairing token.", (cc) => {
    const r = b.row(cc, { w: "fill", pad: 14, gap: 8 });
    const f = b.row(r, { w: "fill", h: 36, pad: [0, 12], r: 8, fill: t.surface, stroke: t.control, sw: 1, sa: "inside" }); b.text(f, "•".repeat(14) + "-" + (o.token ?? "51c1"), { size: 13, c: t.text, ff: MONO, lh: 18 });
    K.btn(b, t, r, "Reveal", { v: "secondary", icon: "eye" }); K.btn(b, t, r, "Copy", { v: "primary", icon: "copy" }); K.btn(b, t, r, "Regenerate", { v: "secondary", icon: "refresh" });
  });
  sect(b, t, pg, "Install the extension", "Add Speak Kit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.", (cc) => {
    srow(b, t, cc, "Speak Kit for Chrome", "Not connected yet", true, (r) => { K.btn(b, t, r, "Pair", { v: "secondary", sz: "sm" }); K.btn(b, t, r, "Open Web Store", { v: "secondary", sz: "sm", icon: "external" }); });
    srow(b, t, cc, "Engines", "Kokoro-82M is installed. Chatterbox comes later.", false, (r) => K.btn(b, t, r, "Manage", { v: "secondary", sz: "sm" }));
  });
  // footer
  const ft = b.row(c, { x: 0, y: 771, w: W, h: 28, pad: [0, 14, 0, 0], gap: 10, justify: "end" });
  (o.footer ?? ["Kokoro ready", "Voice: Heart", "0 readings"]).forEach((s, i) => { if (i) b.rect(ft, { w: 1, h: 12, fill: t.control }); b.text(ft, s, { size: 12, c: t.text2, lh: 16 }); });
};
const homeScene = (o: HomeO, extra?: (b: B, t: T, c: Ref) => void) => (b: B, t: T, root: Ref) => {
  const a = K3.winApp(b, root, { w: 1278, h: 799, backdrop: { w: 1440, h: 900 } });
  homeShell(b, t, a.ref, o);
  extra?.(b, t, a.ref);
};
const quitDialog = (rows: [string, string][], lead: string) => (b: B, t: T, c: Ref) => {
  b.rect(c, { x: 0, y: 0, w: 1278, h: 799, fill: t.overlay });
  const mh = 154 + rows.length * 61;
  const m = b.col(c, { name: "Quit dialog", x: 399, y: Math.round((799 - mh) / 2), w: 480, h: mh, pad: [0, 16, 15, 16], gap: 0, r: 16, fill: t.surface, shadow: "dlg" });
  const hd = b.row(m, { w: "fill", h: 49 }); b.text(hd, "Quit Speak Kit?", { size: 15, weight: "SemiBold", c: t.text, w: "fill", lh: 20 });
  const x = b.frame(hd, { w: 24, h: 24, r: 6, layout: "horizontal", align: "center", justify: "center", stroke: rows.length === 2 ? "#3287D5" : undefined, sw: 2, sa: "outside" }); b.icon(x, "x", 12, t.text);
  b.text(m, lead, { size: 14, c: t.text2, w: "fill", lh: 20 });
  b.frame(m, { w: 1, h: 13 });
  const l = b.col(m, { w: "fill", r: 10, stroke: t.border, sw: 1, sa: "inside", gap: 0, clip: true });
  rows.forEach(([a, d], i) => { if (i) b.rect(l, { w: "fill", h: 1, fill: t.border }); const r = b.col(l, { w: "fill", pad: [12, 12], gap: 2 }); b.text(r, a, { size: 14, c: t.text3, lh: 18 }); b.text(r, d, { size: 12, c: t.text2, w: "fill", lh: 16 }); });
  b.frame(m, { w: 1, h: 21 });
  const ft = b.row(m, { w: "fill", gap: 8 }); K.btn(b, t, ft, "Keep running in tray", { v: "secondary" }); b.frame(ft, { w: "fill", h: 1 });
  const q = b.row(ft, { h: 36, pad: [0, 14], r: 8, fill: "#F9E9E9" }); b.text(q, "Quit", { size: 13, weight: "Medium", c: t.err, lh: 16 });
};
const bellPop = (entries: [string, string][]) => (b: B, t: T, c: Ref) => {
  const p = b.col(c, { name: "Notifications popover", x: 802, y: 39, w: 338, pad: [12, 12, 12, 12], gap: 8, r: 12, fill: t.surface, shadow: "lg" });
  b.text(p, "Notifications", { size: 14, weight: "SemiBold", c: t.text, lh: 20 });
  if (!entries.length) { b.text(p, "All caught up.", { size: 13, c: t.text3, lh: 18 }); return; }
  entries.forEach(([ti, bo], i) => { if (i) b.rect(p, { w: "fill", h: 1, fill: t.border }); const e = b.col(p, { w: "fill", gap: 2, pad: [4, 0] }); b.text(e, ti, { size: 13, weight: "SemiBold", c: t.text, lh: 18 }); b.text(e, bo, { size: 12, c: t.text2, w: "fill", lh: 20 }); });
};
const RS: [string, string][] = [["Local server on 127.0.0.1:48158 stops", "The browser extension cannot read until Speak Kit starts again."], ["The voice model leaves memory", "It loads again on the next play."]];

export const FLOATING: S[] = [
  scr("I10", "I", "Tray panel · reading", "Left click on the tray icon: Speak Kit's own panel above the taskbar. Now playing with pause and stop, next in queue, Open Speak Kit.", trayScene(READY, NOW_PLAYING)),
  scr("I14", "I", "Tray panel · idle", "Nothing is playing: the hint names the global shortcut. Both footer actions stay.", trayScene(READY, null)),
  scr("I15", "I", "Tray panel · paused", "Paused keeps the title and shows play instead of pause.", trayScene(READY, NOW_PAUSED)),
  scr("I16", "I", "Tray panel · engine unloaded", "The engine is asleep and reads Ready: it wakes by itself when the panel opens.", trayScene(READY, null, 320)),
  scr("I17", "I", "Tray panel · engine loading", "A blue Loading pill with a spinner.", trayScene({ pill: "Loading", tone: "info", icon: "loader" }, null, 320)),
  scr("I18", "I", "Tray panel · model downloading", "Download progress sits in the pill.", trayScene({ pill: "Download 62%", tone: "info", icon: "loader" }, null, 320)),
  scr("I19", "I", "Tray panel · engine error", "A red Error pill; the panel does not explain, Open Speak Kit does.", trayScene({ pill: "Error", tone: "err" }, null, 320)),
  scr("I11", "I", "Tray right-click menu", "Short native menu: open, pause and stop while reading, Do not disturb, Settings, updates, Quit." + DESIGN_ONLY, trayMenu),
  scr("I3", "I", "Mini player · playing", "Always-on-top card in the bottom-right corner, 16 px from the work area: title, sentence count, time left, keep-on-top, close, transport.", miniScene({ title: MT, status: "Sentence 1 of 3", left: "0:06 left", play: "pause", pct: 0 })),
  scr("I9", "I", "Mini player · paused", "Paused: the status line keeps the sentence number; play replaces pause.", miniScene({ title: MT, status: "Paused · sentence 1 of 3", left: "0:06 left", play: "play", pct: 0 })),
  scr("I20", "I", "Mini player · preparing", "Preparing the voice: indeterminate bar.", miniScene({ title: MT, status: "Preparing the voice...", left: "0:06 left", play: "pause", pct: undefined })),
  scr("I21", "I", "Mini player · error", "The status line turns red and says what went wrong.", miniScene({ title: MT, status: "Something went wrong", left: "0:06 left", play: "play", pct: 0, err: true }, 360)),
  scr("I13", "I", "Mini player · finished", "Finished: the time left is gone; the card closes itself 6 s later.", miniScene({ title: MT, status: "Finished", left: "", play: "refresh", pct: 1 })),
  scr("I12", "I", "Windows toasts · system", "Voice engine problem and Update ready: no buttons, a click opens the exact place. The engine or model becoming ready never shows a toast." + DESIGN_ONLY, toastStack([TOASTS.updateReady, TOASTS.engineError])),
  scr("I22", "I", "Windows toast · export", "Export finished: the body names the file." + DESIGN_ONLY, toastStack([TOASTS.exportDone])),
  scr("K11", "K", "Quit confirmation", "Quitting says what stops and how to resume it; Keep running in tray is the safe choice.", homeScene({}, quitDialog(RS, "Closing the window keeps Speak Kit in the tray. Quitting stops:")), 1440, 900),
  scr("K13", "K", "Quit confirmation · reading and export running", "With work running the lead names it, and the list adds what is cancelled.", homeScene({ port: 48130, exp: true, footer: ["Kokoro ready", "Voice: Heart", "Reading: One short sentence here. A second sentence follows it. And..."] }, quitDialog([["Local server on 127.0.0.1:48130 stops", "The browser extension cannot read until Speak Kit starts again."], ["The reading in progress stops", "Start it again from the app, the tray or a shortcut."], ["The export is cancelled", "Nothing half-written is kept. Export again when Speak Kit is open."], RS[1]], "1 reading is playing and 1 export is rendering. Quitting stops:"))),
  scr("K1", "K", "Error · engine could not load", "The engine card says what failed and offers Retry; the title-bar pill, sidebar card and footer say Error.", homeScene({ status: "err", port: 48130, token: "46a8", engine: { label: "Error", detail: "huggingface.co, connection reset (ECONNRESET)", err: true, retry: true }, footer: ["Voice engine error", "Voice: Heart", "0 readings"] })),
  scr("K2", "K", "Notice · port in use", "A warning banner above the status cards names the new port to enter in the extension options.", homeScene({ port: 54757, token: "2d25", banner: { title: "Port 54755 is in use", body: "Speak Kit is using 54757 instead. Enter 54757 in the extension options under Port." } })),
  scr("I23", "I", "Notifications bell · empty", "The bell in the title bar opens a popover; with nothing new it says All caught up.", homeScene({ port: 48154 }, bellPop([]))),
  scr("I24", "I", "Notifications bell · entries", "Finished exports and updates collect here with their time; they also appear as Windows toasts.", homeScene({ port: 48154 }, bellPop([["Export finished", "My note.wav is saved. Click to show it in its folder. 4:37:42 PM"], ["Export finished", "My note.wav is saved. 4:37:42 PM"]]))),
];
