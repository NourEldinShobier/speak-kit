// d-shell: setup wizard (W*) and desktop shell (L*), rebuilt 1:1 from designs/built/shots/{W,L}*-light.png and placed in a real Windows 11 window (kit3.winApp).
// Geometry comes from apps/desktop/src/renderer (shell.css, setup.css, pages.css) and packages/ui/src/lumen.css; every frame is editable (text, auto layout, Tabler vectors).
// Later s_* files replace earlier builders with the same id, so these override s_n_desktop.ts.
import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import * as K3 from "./kit3";
import { S } from "./types";

const DW = 1440, DH = 900; // desktop the window sits on
const MONO = "Cascadia Mono";
const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = DW, h = DH): S => ({ id, group, title, note, w, h, build });

/** text with a fractional size (Lumen row labels are 13.5 / 12.5): b.text rounds, so set the exact size afterwards */
const tx = (b: B, p: Ref | undefined, s: string, o: Record<string, any> = {}) => {
  const { size = 13, ...rest } = o; const r = b.text(p, s, { size: Math.round(size), ...rest });
  if (size !== Math.round(size)) b.add("node.set", { ids: [r], fontSize: size });
  return r;
};
/** explicit line breaks (the shots wrap at fixed words; auto-wrap could differ by a word) */
const lines = (b: B, p: Ref | undefined, ls: string[], o: Record<string, any> = {}) => { const c = b.col(p, { gap: 0, w: o.w }); ls.forEach((l) => tx(b, c, l, o)); return c; };
const dup = (b: B, p: Ref | undefined, c: string, o: Record<string, any> = {}) => b.frame(p, { w: 1, h: 1, ...o, fill: c });

// ---------------------------------------------------------------- Lumen parts used by both windows
/** SettingsSection: 15/18 title, 12/15 description, 10 gap, card below */
const section = (b: B, t: T, p: Ref | undefined, title: string, desc?: string, o: Record<string, any> = {}) => {
  const s = b.col(p, { w: "fill", gap: 10, ...o });
  const h = b.col(s, { w: "fill", gap: 2 });
  tx(b, h, title, { size: 15, weight: "SemiBold", c: t.text, lh: 18 });
  if (desc) tx(b, h, desc, { size: 12, c: t.text3, lh: 15 });
  return s;
};
const lcard = (b: B, t: T, p: Ref | undefined, o: Record<string, any> = {}) => b.col(p, { w: "fill", gap: 0, r: 10, fill: t.surface, shadow: "ring", ...o });
const hair = (b: B, t: T, p: Ref | undefined) => b.rect(p, { w: "fill", h: 1, fill: "#F0F0F0" });
/** SettingRow: label 13.5/500, description 12.5 tertiary, control right; 42 px (58 with a description, +17 per extra line) */
const lrow = (b: B, t: T, p: Ref | undefined, label: string, desc: string[] | string | undefined, ctl?: (f: Ref) => void, o: { gap?: number } = {}) => {
  const d = desc === undefined ? [] : typeof desc === "string" ? [desc] : desc;
  const pad = d.length === 0 ? [3, 16] : d.length === 1 ? [12, 16] : [11, 16];
  const r = b.row(p, { w: "fill", gap: 16, pad });
  const x = b.col(r, { gap: 1, w: "fill" });
  tx(b, x, label, { size: 13.5, weight: "Medium", c: t.text, lh: 16 });
  d.forEach((l) => tx(b, x, l, { size: 12.5, c: t.text3, lh: 17 }));
  if (ctl) { const c = b.row(r, { gap: o.gap ?? 16 }); ctl(c); }
  return r;
};
/** page banner (lm-banner): r10, pad 10/14, gap 10, tinted fill, 16 px icon, 13/600 title, 12/15 text */
const banner = (b: B, t: T, p: Ref | undefined, tone: "info" | "warn", icon: string, title: string, text: (c: Ref) => void) => {
  const f = b.row(p, { w: "fill", pad: [10, 14], gap: 10, r: 10, fill: tone === "info" ? "#DAEFFE" : "#FFEBCF" });
  b.icon(f, icon, 16, tone === "info" ? t.info : t.warn);
  const c = b.col(f, { gap: 2, w: "fill" });
  tx(b, c, title, { size: 13, weight: "SemiBold", c: t.text, lh: 16 });
  text(c);
  return f;
};
const small = (b: B, t: T, p: Ref | undefined, s: string, o: Record<string, any> = {}) => tx(b, p, s, { size: 12, c: t.text2, lh: 15, ...o });
const mono = (b: B, t: T, p: Ref | undefined, s: string, o: Record<string, any> = {}) => tx(b, p, s, { size: 12, c: t.text, ff: MONO, lh: 15, ...o });
/** pairing token field (TokenField): 36 px box, Reveal, Copy, Regenerate; 8 px gaps */
const tokenField = (b: B, t: T, p: Ref | undefined, o: { text: string; revealed?: boolean; copied?: boolean }) => {
  const r = b.row(p, { w: "fill", gap: 8 });
  const box = b.row(r, { w: "fill", h: 36, pad: [0, 12], r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", shadow: "ctl", clip: true });
  tx(b, box, o.text, { size: 12, c: t.text, ff: MONO, lh: 15, ...(o.revealed ? { maxLines: 1 } : {}) });
  K.btn(b, t, r, o.revealed ? "Hide" : "Reveal", { v: "secondary", icon: o.revealed ? "eyeOff" : "eye" });
  K.btn(b, t, r, o.copied ? "Copied" : "Copy", { v: "primary", icon: "copy", state: o.copied ? "hover" : undefined });
  K.btn(b, t, r, "Regenerate", { v: "secondary", icon: "refresh" });
  return r;
};
const toggle = (b: B, t: T, p: Ref | undefined, on: boolean) => K.toggle(b, t, p, on);

// ---------------------------------------------------------------- setup window (958 x 680)
const STEPS = ["Welcome", "Voice engine", "Download", "Connect browser", "Done"];
const stepper = (b: B, t: T, p: Ref | undefined, cur: number) => {
  const r = b.row(p, { gap: 8 });
  STEPS.forEach((s, i) => {
    if (i) b.rect(r, { w: 24, h: 1, fill: t.border });
    const done = i < cur, on = i === cur;
    const m = b.frame(r, { w: 20, h: 20, r: 999, fill: done || on ? t.cta : "none", stroke: done || on ? undefined : t.control, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
    if (done) b.icon(m, "check", 12, t.ctaText, { sw: 2 }); else tx(b, m, String(i + 1), { size: 11, weight: "SemiBold", c: on ? t.ctaText : t.text3 });
    tx(b, r, s, { size: 13, weight: on ? "Medium" : "Regular", c: on ? t.text : t.text3 });
  });
};
type SetupOpts = { step: number; h1: string; sub: string; center?: boolean; body: (col: Ref) => void; left?: { label: string; icon?: string }; right: (r: Ref) => void; bodyTop?: number; colGap?: number };
const setupWin = (b: B, t: T, root: Ref, o: SetupOpts) => {
  const a = K3.winApp(b, root, { w: 958, h: 680, backdrop: { w: DW, h: DH }, titleBar: 32, title: "Set up Speak Kit" });
  const c = a.ref;
  K3.skLogo(b, c, 20, { x: 6, y: 6 });
  tx(b, c, "Set up Speak Kit", { x: 34, y: 8, size: 12, c: t.text2, lh: 16 });
  const sr = b.row(c, { x: 0, y: 48, w: 958, h: 20, justify: "center" }); stepper(b, t, sr, o.step);
  if (o.center) {
    K3.skLogo(b, c, 72, { x: 443, y: 116 });
    tx(b, c, o.h1, { x: 119, y: 192, w: 720, ta: "center", size: 28, weight: "SemiBold", c: t.text, lh: 34 });
    tx(b, c, o.sub, { x: 119, y: 223, w: 720, ta: "center", size: 13, c: t.text2, lh: 18 });
  } else {
    tx(b, c, o.h1, { x: 119, y: 87.5, size: 20, weight: "SemiBold", c: t.text, lh: 24 });
    tx(b, c, o.sub, { x: 119, y: 113, size: 13, c: t.text2, lh: 18 });
  }
  const col = b.col(c, { x: 119, y: o.bodyTop ?? 144, w: 720, gap: o.colGap ?? 14 }); o.body(col);
  const ft = b.row(c, { x: 0, y: 616, w: 958, h: 64, pad: [0, 28], justify: "spaceBetween" });
  const l = b.row(ft, { gap: 8 }); if (o.left) K.btn(b, t, l, o.left.label, { v: "ghost", icon: o.left.icon ?? "arrowLeft" });
  const r = b.row(ft, { gap: 8 }); o.right(r);
  return a;
};
const back = (label = "Back") => ({ label });
const featCard = (b: B, t: T, p: Ref, ic: string, title: string, d: string) => {
  const f = b.col(p, { w: "fill", pad: 14, gap: 4, r: 10, fill: t.surface, shadow: "ring" });
  b.icon(f, ic, 18, t.text); tx(b, f, title, { size: 13, weight: "SemiBold", c: t.text, lh: 18 }); tx(b, f, d, { size: 12, c: t.text2, lh: 16 });
};
const radioEngine = (b: B, t: T, p: Ref | undefined, o: { ic: string; name: string; l1: string; l2: string; pill: [string, "ok" | "neutral"]; sel?: boolean; dim?: boolean }) => {
  const r = b.row(p, { w: "fill", pad: [14, 16], gap: 12, align: "start", r: 10, fill: o.sel ? t.selected : "none", opacity: o.dim ? 0.55 : undefined });
  const tile = b.frame(r, { w: 32, h: 32, r: 8, fill: t.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, o.ic, 18, t.iconQuiet);
  const x = b.col(r, { gap: 4, w: "fill" });
  tx(b, x, o.name, { size: 14, weight: "SemiBold", c: t.text, lh: 16 }); tx(b, x, o.l1, { size: 13, c: t.text2, lh: 16 }); tx(b, x, o.l2, { size: 13, c: t.text2, lh: 16 });
  const pw = b.frame(r, { layout: "vertical", pad: [2, 0, 0, 0] }); K.badge(b, t, pw, o.pill[0], o.pill[1]);
};

const W1 = (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 0, center: true, h1: "Read anything out loud.", sub: "On your own computer. No account, no cloud, no limits.", left: undefined,
  body: (c) => {
    const g = b.row(c, { w: 720, gap: 12, align: "start" });
    featCard(b, t, g, "lock", "Private", "Text never leaves this device"); featCard(b, t, g, "zap", "Fast", "Starts speaking in about a second"); featCard(b, t, g, "globe", "Everywhere", "Web pages, PDFs, any text");
  }, bodyTop: 255,
  right: (r) => { tx(b, r, "Setup takes about 3 minutes", { size: 13, c: t.text3, lh: 18 }); K.btn(b, t, r, "Get started", { v: "primary", iconRight: "arrowRight" }); } });

const engineBody = (b: B, t: T, gpu: boolean) => (c: Ref) => {
  if (gpu) banner(b, t, c, "info", "cpu", "Found NVIDIA GeForce RTX 3060, 8 GB", (x) => small(b, t, x, "Kokoro runs on the CPU and needs no GPU. Your graphics card can run Chatterbox later (Engines).", { c: t.text2 }));
  else banner(b, t, c, "info", "cpu", "No supported graphics card found", (x) => small(b, t, x, "Kokoro runs on the CPU, so any PC works. About one second to the first word.", { c: t.text2 }));
  const s = section(b, t, c, "Engines"); const k = lcard(b, t, s);
  radioEngine(b, t, k, { ic: "cpu", name: "Kokoro-82M", l1: "Natural English voices, 28 to choose from. About 1 second to the first word.", l2: "Download 177 MB · runs on any PC", pill: ["Recommended", "ok"], sel: true });
  radioEngine(b, t, k, { ic: "sparkles", name: "Chatterbox", l1: "Expressive, with emotion control and voice cloning.", l2: "Not available yet. It arrives in a later version.", pill: ["Optional", "neutral"], dim: true });
};
const W2 = (gpu: boolean) => (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 1, h1: "Choose a voice engine", sub: "You can add or switch engines any time in Engines.", left: back(), body: engineBody(b, t, gpu),
  right: (r) => K.btn(b, t, r, "Download Kokoro", { v: "primary", icon: "download" }) });

const modelCard = (b: B, t: T, c: Ref, pill: (f: Ref) => void) => {
  const s = section(b, t, c, "Model"); const k = lcard(b, t, s);
  lrow(b, t, k, "kokoro-82m (q8)", "110 MB of 177 MB", pill);
  const pw = b.frame(k, { w: "fill", layout: "vertical", pad: [0, 14, 14, 14] });
  K.progress(b, t, pw, 0.62, { w: 240 });
};
const W3 = (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 2, h1: "Downloading Kokoro-82M", sub: "One time only. After this, Speak Kit works fully offline.", left: back("Cancel"),
  body: (c) => { modelCard(b, t, c, (f) => K.badge(b, t, f, "62%", "info", "loader")); tx(b, c, "Continue in the background to set up your browser now. The download finishes on its own.", { size: 13, c: t.text2, lh: 18 }); },
  right: (r) => K.btn(b, t, r, "Continue in background", { v: "primary", iconRight: "arrowRight" }) });
const W3b = (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 2, h1: "Download paused", sub: "The download stopped at 62%. Everything downloaded so far is kept.", left: back("Cancel"),
  body: (c) => {
    modelCard(b, t, c, (f) => K.badge(b, t, f, "Paused", "warn", "alert"));
    banner(b, t, c, "warn", "alert", "Lost the connection to the model server", (x) => {
      const r1 = b.row(x, { gap: 0, align: "start" }); small(b, t, r1, "Check your internet connection, then retry. Downloading resumes where it stopped. Details: "); mono(b, t, r1, "huggingface.co,", { c: t.text2 });
      mono(b, t, x, "connection reset (ECONNRESET)", { c: t.text2 });
    });
  },
  right: (r) => K.btn(b, t, r, "Retry download", { v: "primary", icon: "refresh" }) });

const W4 = (o: { revealed?: boolean; port: string; token: string }) => (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 3, h1: "Connect your browser", sub: "Install the extension, paste the token, then test the connection.", left: back(),
  body: (c) => {
    const s1 = section(b, t, c, "1. Install the extension", "Add Speak Kit from the Chrome Web Store. It also installs in Edge and Brave. Then pin it from the puzzle menu.");
    lrow(b, t, lcard(b, t, s1), "Speak Kit for Chrome", undefined, (f) => { K.btn(b, t, f, "Open Web Store", { v: "secondary", icon: "external" }); K.btn(b, t, f, "Install from this app", { v: "secondary", icon: "folder" }); }, { gap: 8 });
    const s2 = section(b, t, c, "2. Pair it with this app", "Copy the token and paste it in the extension under Options > General > Pairing token.");
    const k2 = lcard(b, t, s2); const pad = b.frame(k2, { w: "fill", layout: "vertical", pad: [14, 16] });
    tokenField(b, t, pad, { text: o.token, revealed: o.revealed, copied: o.revealed });
    const s3 = section(b, t, c, "3. Test the connection");
    lrow(b, t, lcard(b, t, s3), "Check that the extension reaches this app", ["Listening on 127.0.0.1:" + o.port + ". If Windows asks about the firewall, choose Private networks or", "Cancel; Speak Kit only listens on 127.0.0.1."], (f) => K.btn(b, t, f, "Test connection", { v: "secondary" }));
  },
  right: (r) => { K.btn(b, t, r, "Skip for now", { v: "ghost" }); K.btn(b, t, r, "Continue", { v: "primary", iconRight: "arrowRight", disabled: !o.revealed }); } });

const W5 = (skipped: boolean, port: string) => (b: B, t: T, root: Ref) => setupWin(b, t, root, { step: 4, h1: skipped ? "Setup is finished" : "You're all set", sub: skipped ? "You can connect the browser extension later from Browser." : "Kokoro is ready. Press play to hear your voice.", left: back(),
  body: (c) => {
    banner(b, t, c, "info", skipped ? "info" : "circleCheck", skipped ? "Browser extension not connected" : "Server is running", (x) => small(b, t, x, skipped ? "Pair it later under Browser." : "Listening on 127.0.0.1:" + port, { c: t.text2 }));
    const s1 = section(b, t, c, "Hear it");
    lrow(b, t, lcard(b, t, s1), "Play sample", ["“Notes, documents and even voices lived on someone else's server, rented back to us by the", "month.”"], (f) => K.btn(b, t, f, "Play", { v: "primary", icon: "play" }));
    const s2 = section(b, t, c, "Handy to know"); const k = lcard(b, t, s2);
    lrow(b, t, k, "Tray icon", ["Speak Kit lives in the system tray. Windows 11 may hide it under the arrow; drag the icon out to keep it in view.", "Closing the window keeps it running."]);
    hair(b, t, k); lrow(b, t, k, "Launch at login", "Start Speak Kit when you sign in to Windows.", (f) => toggle(b, t, f, false));
    hair(b, t, k); lrow(b, t, k, "Start in the tray", "When it starts at sign-in, stay in the tray instead of opening a window.", (f) => toggle(b, t, f, false));
  },
  right: (r) => K.btn(b, t, r, "Open Speak Kit", { v: "primary", iconRight: "arrowRight" }) });

// ---------------------------------------------------------------- main window (1278 x 799)
type Side = "full" | "rail" | "off";
const navIcon = (b: B, t: T, p: Ref, ic: string, label: string | undefined, sel = false) => {
  const r = b.row(p, { w: "fill", h: 36, pad: label ? [0, 10] : 0, gap: 10, r: 8, fill: sel ? t.selected : "none", justify: label ? "start" : "center" });
  b.icon(r, ic, 18, t.icon); if (label) tx(b, r, label, { size: 13, weight: sel ? "Medium" : "Regular", c: sel ? t.text : t.text2, lh: 16 });
  return r;
};
const titleBar = (b: B, t: T, c: Ref, W: number, mac = false) => {
  const ib = (x: number, ic: string, dis = false) => { const f = b.frame(c, { x, y: 4, w: 28, h: 28 }); K.iconBtn(b, t, f, ic, { size: 28, c: t.text2, state: dis ? "disabled" : undefined }); };
  const x0 = mac ? 78 : 8; // macOS: the left group starts after the traffic lights (shell.css 78 px)
  ib(x0, "sidebar"); ib(x0 + 32, "left", true); ib(x0 + 64, "right", true);
  const sx = mac ? Math.round((W - 420) / 2) : Math.round(8 + (W - 8 - 420) / 2);
  const sf = b.row(c, { x: sx, y: 4, w: 420, h: 28, pad: [0, 8, 0, 10], gap: 8, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", shadow: "ctl" });
  b.icon(sf, "search", 16, t.text3); tx(b, sf, "Search readings, voices and commands", { size: 13, c: t.text3, w: "fill", lh: 16 });
  const kb = b.row(sf, { h: 16, pad: [0, 4], r: 4, stroke: t.control, sw: 1, sa: "inside" }); tx(b, kb, mac ? "Cmd K" : "Ctrl K", { size: 10, c: t.text3, lh: 12 });
  // macOS: no native controls on the right, so the group runs to the edge with the same 4 px gap as above and below
  const rg = b.row(c, { x: W - (mac ? 4 : 137) - 300, y: 4, w: 300, h: 28, gap: 8, justify: "end" });
  K.badge(b, t, rg, "Ready", "ok"); K.iconBtn(b, t, rg, "bell", { size: 28, c: t.text2 });
};
const footer = (b: B, t: T, c: Ref, W: number, H: number) => {
  const f = b.row(c, { x: 0, y: H - 28, w: W, h: 28, pad: [0, 14], gap: 10, justify: "end" });
  ["Kokoro ready", "Voice: Heart", "0 readings"].forEach((s, i) => { if (i) b.rect(f, { w: 1, h: 12, fill: t.field }); tx(b, f, s, { size: 12, c: t.text3, lh: 16 }); });
};
const sidebar = (b: B, t: T, c: Ref, H: number, rail: boolean, mac = false) => {
  const sb = b.col(c, { x: 8, y: 38, w: rail ? 36 : 236, h: H - 36 - 28 - 4, gap: 2 });
  const nw = b.row(sb, { w: "fill", h: 36, pad: rail ? 0 : [0, 15], gap: 6, r: 8, fill: t.cta, shadow: "cta", justify: rail ? "center" : "start" });
  b.icon(nw, "plus", 16, t.ctaText);
  if (!rail) { tx(b, nw, "New reading", { size: 13, weight: "Medium", c: t.ctaText, w: "fill", lh: 16, ls: -0.13 }); const kb = b.row(nw, { h: 16, pad: [0, 4], r: 4, stroke: "#FAFAFA73", sw: 1, sa: "inside" }); tx(b, kb, mac ? "Cmd N" : "Ctrl N", { size: 10, c: t.ctaText, lh: 12 }); }
  b.frame(sb, { w: 1, h: 8 });
  [["home", "Home"], ["book", "Library"], ["mic", "Voices"], ["cpu", "Engines"], ["globe", "Browser"]].forEach(([ic, l], i) => navIcon(b, t, sb, ic, rail ? undefined : l, i === 0));
  if (!rail) {
    const rs = b.row(sb, { w: "fill", pad: [16, 10, 6, 10] }); tx(b, rs, "Recent", { size: 11, weight: "SemiBold", c: t.text3, lh: 13, ls: 0.44 });
    const em = b.row(sb, { w: "fill", pad: [4, 10] }); tx(b, em, "Readings you start appear here.", { size: 12, c: t.text3, lh: 17 });
  }
  b.frame(sb, { w: "fill", h: "fill" });
  if (!rail) {
    const ec = b.col(sb, { w: "fill", pad: [10, 12], gap: 2, r: 10, fill: t.surface, shadow: "card" });
    tx(b, ec, "Kokoro-82M · Ready", { size: 13, weight: "Medium", c: t.text, lh: 16 });
    const g = b.row(ec, { gap: 6 }); b.icon(g, "lock", 12, t.ok); tx(b, g, "100% on this device", { size: 12, c: t.ok, lh: 15 });
    b.frame(sb, { w: 1, h: 2 });
  }
  navIcon(b, t, sb, "settings", rail ? undefined : "Settings");
};
/** The window content: title bar, sidebar, panel, footer. Returns the panel frame and its size. */
const mainWin = (b: B, t: T, root: Ref, o: { W?: number; H?: number; side?: Side; mac?: boolean } = {}) => {
  const { W = 1278, H = 799, side = "full", mac = false } = o;
  const a = mac ? K3.macApp(b, root, { w: W, h: H, backdrop: { w: DW, h: DH } }) : K3.winApp(b, root, { w: W, h: H, backdrop: { w: DW, h: DH } });
  const c = a.ref;
  titleBar(b, t, c, W, mac);
  if (side !== "off") sidebar(b, t, c, H, side === "rail", mac);
  const px = side === "full" ? 252 : side === "rail" ? 52 : 4;
  const pw = W - px - 8, ph = H - 36 - 28;
  const main = b.frame(c, { x: px, y: 36, w: pw, h: ph, r: mac ? 14 : 8, fill: t.editor, shadow: "card", clip: true });
  footer(b, t, c, W, H);
  return { a, c, main, pw, ph };
};
const stat = (b: B, t: T, p: Ref, key: string, v: string, d: (f: Ref) => void) => {
  const f = b.frame(p, { w: "fill", h: 88, r: 10, fill: t.surface, shadow: "ring" });
  tx(b, f, key, { x: 16, y: 14.5, size: 11, weight: "SemiBold", c: t.text3, lh: 15, ls: 0.44 });
  const r = b.row(f, { x: 16, y: 34.5, gap: 8, h: 18 }); b.ellipse(r, { w: 8, h: 8, fill: t.dotGreen }); tx(b, r, v, { size: 15, weight: "SemiBold", c: t.text, lh: 18 });
  const dd = b.row(f, { x: 16, y: 57, gap: 3, h: 17 }); d(dd);
  return f;
};
/** Home page (HomePage.tsx): 760 px column centred in the panel */
const home = (b: B, t: T, main: Ref, pw: number, port: string, token: string) => {
  const col = b.col(main, { x: Math.round((pw - 760) / 2), y: 0, w: 760, pad: [22, 28, 24, 28], gap: 16 });
  const h = b.col(col, { w: "fill", gap: 4 });
  tx(b, h, "Home", { size: 22, weight: "SemiBold", c: t.text, lh: 26 }); tx(b, h, "Speak Kit runs a private voice server on this computer. Your browser extension talks to it.", { size: 13, c: t.text2, lh: 17 });
  const g = b.row(col, { w: "fill", gap: 12, align: "start" });
  stat(b, t, g, "SERVER", "Running", (d) => { tx(b, d, "Listening on", { size: 12, c: t.text2, lh: 17 }); tx(b, d, "127.0.0.1:" + port, { size: 12, c: t.text, ff: MONO, lh: 17 }); });
  stat(b, t, g, "VOICE ENGINE", "Ready", (d) => tx(b, d, "Kokoro-82M, runs on the CPU", { size: 12, c: t.text2, lh: 17 }));
  const s1 = section(b, t, col, "Pairing token", "Paste this token in the extension under Options > General > Pairing token.");
  const k1 = lcard(b, t, s1); const pad = b.frame(k1, { w: "fill", layout: "vertical", pad: [14, 16] }); tokenField(b, t, pad, { text: "•".repeat(14) + "-" + token });
  const s2 = section(b, t, col, "Install the extension", "Add Speak Kit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.");
  const k2 = lcard(b, t, s2);
  lrow(b, t, k2, "Speak Kit for Chrome", "Not connected yet", (f) => { K.btn(b, t, f, "Pair", { v: "secondary", sz: "sm" }); K.btn(b, t, f, "Open Web Store", { v: "secondary", sz: "sm", icon: "external" }); }, { gap: 8 });
  hair(b, t, k2);
  lrow(b, t, k2, "Engines", "Kokoro-82M is installed. Chatterbox comes later.", (f) => K.btn(b, t, f, "Manage", { v: "secondary", sz: "sm" }));
};
const scrim = (b: B, t: T, c: Ref, W: number, H: number) => b.rect(c, { x: 0, y: 0, w: W, h: H, fill: t.overlay });

// command palette (Palette.tsx / overlays.css): 640 wide, 54 px input row, 8 px list padding (row r4 = dialog r10 - 8, min 4), 32 px footer
type Row = { ic: string; l: string; k?: string; sel?: boolean };
const palette = (b: B, t: T, c: Ref, q: string, group: string, rows: Row[], h: number, scroll?: boolean) => {
  const p = b.frame(c, { x: 319, y: 120, w: 640, h, r: 10, fill: t.raised, shadow: "dlg", clip: true });
  const ir = b.row(p, { x: 0, y: 0, w: 640, h: 54, pad: [0, 16], gap: 10 });
  b.icon(ir, "search", 18, t.text); tx(b, ir, q || "Search readings, voices and commands", { size: 16, c: q ? t.text : t.placeholder, w: "fill", lh: 22 });
  const esc = b.row(ir, { h: 16, pad: [0, 4], r: 4, stroke: t.control, sw: 1, sa: "inside" }); tx(b, esc, "Esc", { size: 10, c: t.text3, lh: 12 });
  b.rect(p, { x: 0, y: 54, w: 640, h: 1, fill: "#F0F0F0" });
  const list = b.col(p, { x: 8, y: 63, w: 614, gap: 0 });
  const gl = b.row(list, { w: "fill", h: 24, pad: [0, 6] }); tx(b, gl, group, { size: 12, weight: "Medium", c: t.text3, lh: 15 });
  b.frame(list, { w: 1, h: 0 });
  rows.forEach((r) => {
    const it = b.row(list, { w: "fill", h: 28, pad: [0, 8], gap: 8, r: 4, fill: r.sel ? "#F5F5F5" : "none" });
    b.icon(it, r.ic, 16, t.icon); tx(b, it, r.l, { size: 14, c: t.text, w: "fill", lh: 18 });
    if (r.sel || r.k) tx(b, it, r.sel ? "Enter" : r.k!, { size: 12, c: t.text3, lh: 15, ls: 0.6 });
  });
  const fy = h - 32;
  b.rect(p, { x: 0, y: fy, w: 640, h: 1, fill: "#F0F0F0" });
  const ft = b.row(p, { x: 0, y: fy + 1, w: 640, h: 31, pad: [0, 16], gap: 16 });
  ["↑↓ move", "Enter run", "Esc close"].forEach((s) => tx(b, ft, s, { size: 11, c: t.text3, lh: 15 }));
  if (scroll) b.rect(p, { x: 631, y: 58, w: 4, h: 155, r: 2, fill: "#0000002E" });
};
const PAL_ROWS: Row[] = [["plus", "New reading"], ["pause", "Pause"], ["play", "Play or pause reading"], ["download", "Export audio…"], ["cpu", "Load the voice engine now"], ["bell", "Toggle Do not disturb"], ["refresh", "Check for updates"], ["chrome", "Install the extension"], ["copy", "Copy pairing token"], ["folder", "Open log folder"]].map(([ic, l], i) => ({ ic, l, sel: i === 0 }));

// ---------------------------------------------------------------- frames
const newReading = (b: B, t: T, c: Ref) => {
  const d = b.frame(c, { x: 359, y: 260, w: 560, h: 279, r: 10, fill: t.raised, shadow: "dlg" });
  tx(b, d, "New reading", { x: 16, y: 16, size: 15, weight: "SemiBold", c: t.text, lh: 20 });
  const x = b.frame(d, { x: 525, y: 10, w: 24, h: 24 }); K.iconBtn(b, t, x, "x", { size: 24, c: t.text });
  tx(b, d, "Paste or type text. It is read on this computer; nothing is uploaded.", { x: 16, y: 50, size: 14, c: t.text2, lh: 20 });
  const ta = b.frame(d, { x: 16, y: 83, w: 528, h: 119, r: 8, fill: t.input, stroke: t.focusField, sw: 2, sa: "inside" });
  tx(b, ta, "Paste text here", { x: 12, y: 8, size: 14, c: t.placeholder, lh: 20 });
  b.add("node.create", { type: "vector", path: "M0 8 L8 0 M3.5 8 L8 3.5", parent: ta, x: 512, y: 102, props: { fill: "none", stroke: "#171717", strokeWeight: 1, strokeCap: "round" } });
  const sel = b.frame(d, { x: 16, y: 227, w: 160, h: 28 }); K.select(b, t, sel, "Heart", 160);
  const rg = b.row(d, { x: 200, y: 227, w: 344, h: 36, gap: 8, justify: "end", align: "start" });
  K.btn(b, t, rg, "Export audio", { v: "secondary", icon: "download", disabled: true }); K.btn(b, t, rg, "Close", { v: "secondary" }); K.btn(b, t, rg, "Read", { v: "primary", icon: "play", disabled: true });
  return d;
};
const notifications = (b: B, t: T, c: Ref) => {
  const p = b.frame(c, { x: 802, y: 39, w: 339, h: 74, r: 10, fill: t.raised, shadow: "lg" });
  tx(b, p, "Notifications", { x: 12, y: 12, size: 14, weight: "SemiBold", c: t.text, lh: 18 });
  tx(b, p, "All caught up.", { x: 12, y: 42, size: 14, c: t.text3, lh: 20 });
};
const MASK = (tail: string) => "•".repeat(14) + "-" + tail;
const FULL = "73ca6f9affb153ad361111f554e965bc90af7bc811e4004ca41b2e8f0d5c9a36";
const HOME_NOTE = "Window 1280x800 on a Windows 11 desktop: 36 px bar, 248 px sidebar, panel 8 px from the right and 28 px above the footer band.";
const homeFrame = (port: string, tail: string, over?: (b: B, t: T, c: Ref, main: Ref) => void) => (b: B, t: T, root: Ref) => {
  const m = mainWin(b, t, root); home(b, t, m.main, m.pw, port, tail); over?.(b, t, m.c, m.main);
};
export const V_SHELL: S[] = [
  scr("W0", "W", "First launch", "The product has no splash: first launch opens the setup window on Welcome, same as W1.", W1),
  scr("W1", "W", "Setup 1 · Welcome", "Setup window 958x680 over the desktop: logo and title, 5-step stepper, three promise cards, footer with the only navigation.", W1),
  scr("W2", "W", "Setup 2 · Voice engine", "Hardware banner (as captured: no supported graphics card), Kokoro recommended, Chatterbox disabled until a later version.", W2(false)),
  scr("W2b", "W", "Setup 2 · Voice engine (GPU found)", "Design-only: cannot be screenshotted (the capture machine reports no GPU). Banner text is the real string from EngineStep.tsx.", W2(true)),
  scr("W3", "W", "Setup 3 · Download", "One model row with percent pill and progress; Continue in background keeps the download running.", W3),
  scr("W3b", "W", "Setup 3 · Download paused", "Paused pill, orange banner with the cause and Retry download; the file resumes where it stopped.", W3b),
  scr("W4", "W", "Setup 4 · Connect browser", "Install, pair with the masked token, test the connection; Continue waits for Copy or a paired browser; Skip for now is always there.", W4({ port: "48134", token: MASK("68cf") })),
  scr("W4b", "W", "Setup 4 · Token revealed and copied", "Reveal shows the whole token (clipped in the box), Copy turns into Copied and unlocks Continue.", W4({ port: "48135", token: FULL, revealed: true })),
  scr("W5", "W", "Setup 5 · Done", "Server running banner, a sample to play, and the two background toggles with the tray note.", W5(false, "48136")),
  scr("W5b", "W", "Setup 5 · Done (browser skipped)", "Same page when the browser step was skipped: neutral banner points to Browser.", W5(true, "48136")),
  scr("L1", "L", "Home", HOME_NOTE, homeFrame("48138", "5c14")),
  scr("L1m", "L", "Home (macOS)", "Same window on macOS: traffic lights at the start of the bar, the left group after them, status pill and bell at the far right with a 4 px gap above and to the right, search centred, panel radius 14, shortcuts shown as Cmd.", (b, t, root) => {
    const m = mainWin(b, t, root, { mac: true }); home(b, t, m.main, m.pw, "48138", "5c14");
  }),
  scr("L2", "L", "Command palette", "Ctrl K opens a 640 px palette over a scrim: grouped 28 px rows, the active row shows Enter, footer hints; the list scrolls. Row hover radius is 4 here (Windows dialog 10 minus 8 padding, minimum 4); macOS draws 8.", (b, t, root) => {
    const m = mainWin(b, t, root); home(b, t, m.main, m.pw, "48138", "5c14"); scrim(b, t, m.c, 1278, 799);
    palette(b, t, m.c, "", "Actions", PAL_ROWS, 432, true);
  }),
  scr("L3", "L", "Command palette (filtered)", "Typing filters the list; settings results read Settings: Page and open that page.", (b, t, root) => {
    const m = mainWin(b, t, root); home(b, t, m.main, m.pw, "48139", "8639"); scrim(b, t, m.c, 1278, 799);
    palette(b, t, m.c, "mem", "Settings", [{ ic: "cpu", l: "Settings: Memory", sel: true }], 155);
  }),
  scr("L4", "L", "Narrow window (rail)", "Under 1025 px the sidebar is a 48 px rail of icons; the panel keeps the 8 px margins.", (b, t, root) => {
    const m = mainWin(b, t, root, { W: 1014, H: 767, side: "rail" }); home(b, t, m.main, m.pw, "48141", "ff97");
  }),
  scr("L5", "L", "Sidebar hidden", "The title bar toggle hides the sidebar; the panel grows to 4 px from the left edge and the page stays centred.", (b, t, root) => {
    const m = mainWin(b, t, root, { side: "off" }); home(b, t, m.main, m.pw, "48150", "97b4");
  }),
  scr("L6", "L", "New reading", "New reading opens a 560 px dialog over a scrim: paste box, voice select, Export audio, Close and Read (disabled until there is text).", (b, t, root) => {
    const m = mainWin(b, t, root); home(b, t, m.main, m.pw, "48142", "5c14"); scrim(b, t, m.c, 1278, 799); newReading(b, t, m.c);
  }),
  scr("L7", "L", "Notifications", "The bell opens a popover under it; with nothing new it says All caught up.", (b, t, root) => {
    const m = mainWin(b, t, root); home(b, t, m.main, m.pw, "48143", "6f12"); notifications(b, t, m.c);
  }),
];
