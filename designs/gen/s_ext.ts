import { B, Ref, ICONS } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";

type PS = "idle" | "loading" | "playing" | "paused" | "voices" | "speed" | "done" | "noapp" | "starting" | "selection" | "unreadable" | "install" | "token" | "fileurl" | "unloaded" | "waking";
const TITLE = "The quiet return of local-first software";
const SITE = "reader.example.com";

// ---- local helpers (contrast-safe versions of kit pieces) ----
export const kb = K.kbd;
export const stat = (b: B, t: T, p: Ref | undefined, label: string, k: "ok" | "warn" | "err" | "neutral") => K.badge(b, t, p, label, k);
const sc = (t: T): T => ({ ...t, border: t.mode === "dark" ? "#3A3B3C" : "#D2CBBF" });
const vav = (b: B, t: T, p: Ref | undefined, name: string, size: number, sel = false) => {
  const f = b.frame(p, { w: size, h: size, r: size / 2, fill: sel ? t.subtle : t.selected, layout: "horizontal", align: "center", justify: "center" });
  b.text(f, name.slice(0, 1), { size: Math.round(size * 0.42), weight: "SemiBold", c: sel ? t.accent : t.text2 });
  return f;
};
const dim = (b: B, p: Ref, size: number, on: boolean) => b.frame(p, { w: size + 8, h: size + 8, layout: "horizontal", align: "center", justify: "center", opacity: on ? 0.35 : undefined });

const popHeader = (b: B, t: T, pop: Ref, status: "ok" | "err" | "warn" | "neutral", label?: string) => {
  const h = b.row(pop, { w: "fill", h: 52, pad: [0, 16], justify: "spaceBetween", fill: t.surface });
  const l = b.row(h, { gap: 8 }); K.logo(b, t, l, 24); b.text(l, "SpeakKit", { size: 14, weight: "Bold", c: t.text });
  const r = b.row(h, { gap: 6 });
  stat(b, t, r, label ?? { ok: "Kokoro ready", warn: "Loading model", err: "App offline", neutral: "Not set up" }[status], status);
  K.iconBtn(b, t, r, "sliders", { size: 32 });
  b.rect(pop, { w: "fill", h: 1, fill: t.border });
};
const nowCard = (b: B, t: T, pop: Ref, sub: string, title = TITLE) => {
  const c = b.col(pop, { w: "fill", pad: [16, 16, 8, 16], gap: 10 });
  const top = b.row(c, { gap: 10, w: "fill" });
  const fav = b.frame(top, { w: 36, h: 36, r: 8, fill: t.selected, layout: "horizontal", align: "center", justify: "center" }); b.icon(fav, "globe", 18, t.text3);
  const tx = b.col(top, { gap: 1, w: "fill" });
  b.text(tx, title, { size: 13.5, weight: "SemiBold", c: t.text, w: "fill", lh: 18 });
  b.text(tx, sub, { size: 12, c: t.text3 });
  return c;
};
const transport = (b: B, t: T, p: Ref, state: PS) => {
  const off = state === "loading" || state === "starting" || state === "waking";
  const r = b.row(p, { gap: 14 });
  const ic = (name: string, size: number, col: string) => { const f = dim(b, r, size, off); b.icon(f, name, size, col); };
  ic("skipBack", 18, t.text2); ic("back10", 24, t.text);
  const pb = b.frame(r, { w: 52, h: 52, r: 26, fill: t.accent, layout: "horizontal", align: "center", justify: "center" });
  if (off) b.icon(pb, "loader", 22, t.accentText); else b.icon(pb, state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 22, t.accentText);
  ic("fwd10", 24, t.text); ic("skipFwd", 18, t.text2);
};
const controls = (b: B, t: T, pop: Ref, state: PS) => {
  const c = b.col(pop, { w: "fill", pad: [4, 16, 12, 16], gap: 12, align: "center" });
  const prog = b.col(c, { w: "fill", gap: 6 });
  if (state === "loading" || state === "starting" || state === "waking") {
    // indeterminate: a moving segment on an empty track
    const tr = b.frame(prog, { w: 328, h: 4, r: 999, fill: t.selected, clip: true }); b.rect(tr, { x: 96, y: 0, w: 120, h: 4, r: 999, fill: t.accent });
    b.text(prog, state === "waking" ? "Waking the voice engine. Reading starts in about 2 seconds." : state === "starting" ? "Starting the voice engine. The first time takes a few seconds." : "Preparing the first sentence. This takes a few seconds.", { size: 12, c: t.text2, w: "fill", lh: 17 });
  } else {
    K.bar(b, t, prog, state === "done" ? 1 : 0.36, 328, { knob: true });
    const r = b.row(prog, { w: "fill", justify: "spaceBetween" }); b.text(r, state === "done" ? "6:48" : "2:27", { size: 12, c: t.text2, mono: true }); b.text(r, state === "done" ? "Finished" : "4:21 left", { size: 12, c: t.text2, mono: state !== "done" });
  }
  transport(b, t, c, state);
  if (state === "loading" || state === "starting" || state === "waking") K.btn(b, t, c, "Cancel", { v: "ghost", sz: "sm", icon: "x" });
  if (state === "done") b.text(c, "Replay from the start", { size: 12, c: t.text2 });
};
const footerRow = (b: B, t: T, pop: Ref, speedOpen = false) => {
  b.rect(pop, { w: "fill", h: 1, fill: t.border });
  const f = b.row(pop, { w: "fill", pad: [12, 16], gap: 8, justify: "spaceBetween" });
  const v = b.row(f, { h: 36, pad: [0, 10], gap: 8, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", w: 266 });
  vav(b, t, v, "H", 22, true); b.text(v, "Heart · US English", { size: 13, c: t.text, w: "fill" }); b.icon(v, "down", 14, t.text3);
  const s = b.row(f, { h: 36, pad: [0, 12], gap: 6, r: 8, fill: speedOpen ? t.subtle : t.input, stroke: speedOpen ? t.accent : t.control, sw: 1, sa: "inside" }); b.text(s, "1.2x", { size: 13, weight: "Medium", c: speedOpen ? t.accent : t.text });
};
const shortcuts = (b: B, t: T, pop: Ref) => {
  const f = b.col(pop, { w: "fill", pad: [4, 16, 14, 16], gap: 8 });
  const a = b.row(f, { w: "fill", justify: "spaceBetween" }); b.text(a, "Read selection", { size: 13, c: t.text2 }); kb(b, t, a, ["Ctrl", "Shift", "S"]);
  const c = b.row(f, { w: "fill", justify: "spaceBetween" }); b.text(c, "Play / pause", { size: 13, c: t.text2 }); kb(b, t, c, ["Ctrl", "Shift", "P"]);
};
const foot = (b: B, t: T, pop: Ref, left = "Runs on this computer", right = "Open app") => {
  const f = b.row(pop, { w: "fill", pad: [10, 16], justify: "spaceBetween", fill: t.bg });
  const l = b.row(f, { gap: 6 }); b.icon(l, "lock", 12, t.ok); b.text(l, left, { size: 12, c: t.text2 });
  const r = b.row(f, { gap: 4 }); b.text(r, right, { size: 12, weight: "Medium", c: t.accent }); b.icon(r, "external", 14, t.accent);
};
const msg = (b: B, t: T, pop: Ref, icon: string, tone: "err" | "warn" | "accent", title: string, body: string) => {
  const c = b.col(pop, { w: "fill", pad: [16, 16, 20, 16], gap: 12, align: "center" });
  const ic = b.frame(c, { w: 52, h: 52, r: 14, fill: t.surface, stroke: t.border, sw: 1, sa: "inside", layout: "horizontal", align: "center", justify: "center" });
  b.icon(ic, icon, 26, { err: t.err, warn: t.warn, accent: t.accent }[tone]);
  b.text(c, title, { size: 16, weight: "SemiBold", c: t.text, ta: "center", w: "fill" });
  b.text(c, body, { size: 13, c: t.text2, ta: "center", w: "fill", lh: 19 });
  return c;
};
const fchip = (b: B, t: T, p: Ref, label: string) => { const f = b.row(p, { h: 30, pad: [0, 10], gap: 6, r: 8, stroke: t.control, sw: 1, sa: "inside" }); b.text(f, label, { size: 12, c: t.text }); b.icon(f, "down", 14, t.text3); return f; };

const VOICES: [string, string, string][] = [["Heart", "US English", "A"], ["Bella", "US English", "A-"], ["Emma", "UK English", "B-"], ["Nicole", "US English", "B-"], ["George", "UK English", "C"]];
export const voiceList = (b: B, t: T, p: Ref, w: number, visible: number) => {
  const H = Math.round(visible * 48);
  const lf = b.frame(p, { w, h: H, clip: true });
  const col = b.col(lf, { x: 0, y: 0, w, gap: 4 });
  VOICES.forEach(([n, d, g], i) => {
    const sel = i === 0;
    const r = b.row(col, { w: "fill", h: 44, pad: [0, 8], gap: 10, r: 8, fill: sel ? t.hover : "none" });
    vav(b, t, r, n, 28, sel);
    const x = b.col(r, { gap: 0, w: "fill" }); b.text(x, n, { size: 13, weight: "SemiBold", c: t.text }); b.text(x, `${d} · Quality ${g}`, { size: 12, c: t.text2 });
    if (sel) b.icon(r, "check", 14, t.text);
    K.iconBtn(b, t, r, "play", { size: 32, c: t.text2 });
  });
  for (let i = 0; i < 8; i++) b.rect(lf, { x: 0, y: H - 64 + i * 8, w, h: 8, fill: t.surface + Math.round(255 * 0.95 * (i + 1) / 8).toString(16).padStart(2, "0") });
  b.rect(lf, { x: w - 5, y: 6, w: 4, h: 84, r: 2, fill: t.mode === "dark" ? "#3A3B3C" : "#CFC8BC" });
  return lf;
};

const popup = (id: string, title: string, note: string, state: PS, h: number, dark = false): S => ({
  id, group: "A", title, note, w: 520, h: h + 76, dark,
  build: (b, t, root) => {
    const pop = K.popupCanvas(b, t, root, h);
    if (state === "noapp") {
      popHeader(b, t, pop, "err");
      const c = msg(b, t, pop, "power", "err", "SpeakKit isn't running", "The extension reads with the SpeakKit desktop app on this computer. Open the app and this popup connects by itself.");
      K.btn(b, t, c, "Open SpeakKit", { v: "primary", sz: "lg", w: "fill", icon: "external" });
      K.btn(b, t, c, "Download the app", { v: "secondary", sz: "md", w: "fill", icon: "download" });
            foot(b, t, pop, "Runs on this computer", "Troubleshooting"); return;
    }
    if (state === "install") {
      popHeader(b, t, pop, "neutral");
      const c = msg(b, t, pop, "download", "accent", "Install SpeakKit to start listening", "SpeakKit reads pages aloud with a voice that runs on this computer. Nothing you read is uploaded.");
      K.btn(b, t, c, "Download SpeakKit for Windows", { v: "primary", sz: "lg", w: "fill", icon: "download" });
      K.btn(b, t, c, "I already installed it", { v: "secondary", sz: "md", w: "fill", icon: "refresh" });
            foot(b, t, pop, "Free. Works offline.", "Learn more"); return;
    }
    if (state === "token") {
      popHeader(b, t, pop, "warn", "Not paired");
      const c = msg(b, t, pop, "link", "warn", "Pair SpeakKit with this browser again", "The app and this browser no longer share a pairing token. This usually happens after reinstalling one of them.");
      K.btn(b, t, c, "Paste new token", { v: "primary", sz: "lg", w: "fill", icon: "clipboard" });
      K.btn(b, t, c, "Open SpeakKit", { v: "secondary", sz: "md", w: "fill", icon: "external" });
            foot(b, t, pop, "Runs on this computer", "Extension options"); return;
    }
    if (state === "fileurl") {
      popHeader(b, t, pop, "ok");
      const c = msg(b, t, pop, "file", "warn", "Allow access to file URLs", "Chrome needs one more permission to read local files. Turn on “Allow access to file URLs” in the extension settings.");
      K.btn(b, t, c, "Open extension settings", { v: "primary", sz: "lg", w: "fill", icon: "external" });
      K.btn(b, t, c, "Paste text in the app", { v: "secondary", sz: "md", w: "fill", icon: "clipboard" });
            foot(b, t, pop, "Runs on this computer", "Open app"); return;
    }
    if (state === "unreadable") {
      popHeader(b, t, pop, "ok");
      const c = msg(b, t, pop, "lockOff", "warn", "Can't read this page", "Chrome blocks extensions on its own pages (chrome://, the Web Store). Open a normal website or paste text into the app.");
      K.btn(b, t, c, "Paste text in the app", { v: "primary", sz: "lg", w: "fill", icon: "clipboard" });
            foot(b, t, pop); return;
    }
    popHeader(b, t, pop, state === "starting" || state === "waking" ? "warn" : state === "unloaded" ? "neutral" : "ok", state === "unloaded" ? "Engine asleep" : state === "waking" ? "Waking engine" : undefined);
    if (state === "unloaded") {
      nowCard(b, t, pop, `${SITE} · 6:48 at 1.2x`);
      const c = b.col(pop, { w: "fill", pad: [4, 16, 14, 16], gap: 10 });
      const nt = b.row(c, { w: "fill", pad: 12, gap: 10, r: 10, fill: t.surface2, align: "start" }); b.icon(nt, "zzz", 16, t.text2);
      const nx = b.col(nt, { gap: 2, w: "fill" }); b.text(nx, "Voice engine is asleep", { size: 13, weight: "Medium", c: t.text }); b.text(nx, "It unloaded after 5 minutes idle and gave back 420 MB of memory. It wakes when you press play, in about 2 seconds.", { size: 12, c: t.text2, w: "fill", lh: 17 });
      K.btn(b, t, c, "Listen to this page", { v: "primary", sz: "lg", w: "fill", icon: "play" });
      b.text(c, "Wakes the engine first. Change the idle time in Memory settings.", { size: 12, c: t.text3, w: "fill" });
      footerRow(b, t, pop); shortcuts(b, t, pop); foot(b, t, pop); return;
    }
    if (state === "idle") {
      nowCard(b, t, pop, `${SITE} · 6:48 at 1.2x`);
      const c = b.col(pop, { w: "fill", pad: [4, 16, 14, 16], gap: 10 });
      K.btn(b, t, c, "Listen to this page", { v: "primary", sz: "lg", w: "fill", icon: "play" });
      const r = b.row(c, { w: "fill", gap: 8 }); K.btn(b, t, r, "From selection", { v: "secondary", sz: "md", w: "fill", icon: "scan", disabled: true }); K.btn(b, t, r, "Reader view", { v: "secondary", sz: "md", w: "fill", icon: "book" });
      b.text(c, "Select text on the page to read just that part.", { size: 12, c: t.text2 });
      footerRow(b, t, pop); shortcuts(b, t, pop); foot(b, t, pop); return;
    }
    if (state === "selection") {
      nowCard(b, t, pop, `${SITE} · 2 sentences, about 12 s`, "Selected text");
      const c = b.col(pop, { w: "fill", pad: [4, 16, 14, 16], gap: 10 });
      const q = b.col(c, { w: "fill", pad: 12, r: 10, fill: t.surface2, gap: 4 });
      b.text(q, "“Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.”", { size: 12.5, c: t.text2, w: "fill", lh: 18 });
      K.btn(b, t, c, "Listen to selection", { v: "primary", sz: "lg", w: "fill", icon: "play" });
      footerRow(b, t, pop); shortcuts(b, t, pop); foot(b, t, pop); return;
    }
    nowCard(b, t, pop, state === "playing" || state === "paused" ? `${SITE} · 6:48 at 1.2x` : state === "done" ? `${SITE} · finished` : `${SITE} · 6:48 at 1.2x`);
    if (state === "voices") {
      const m = b.row(pop, { w: "fill", pad: [4, 16, 12, 16], gap: 12 });
      const pb = b.frame(m, { w: 36, h: 36, r: 18, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "pause", 14, t.accentText);
      const mc = b.col(m, { w: "fill", gap: 4 }); K.bar(b, t, mc, 0.36, 280, { knob: false });
      const mr = b.row(mc, { w: "fill", justify: "spaceBetween" }); b.text(mr, "2:27", { size: 12, c: t.text2, mono: true }); b.text(mr, "4:21 left", { size: 12, c: t.text2, mono: true });
      b.rect(pop, { w: "fill", h: 1, fill: t.border });
      const c = b.col(pop, { w: "fill", pad: [12, 16, 12, 16], gap: 10 });
      const hd = b.row(c, { w: "fill", justify: "spaceBetween" }); b.text(hd, "Voice", { size: 13.5, weight: "Bold", c: t.text }); const dn = b.row(hd, { gap: 4 }); b.text(dn, "Done", { size: 12.5, weight: "SemiBold", c: t.accent }); b.icon(dn, "up", 14, t.accent);
      K.input(b, t, c, { placeholder: "Search 28 voices", icon: "search", h: 36 });
      const ch = b.row(c, { gap: 8 }); fchip(b, t, ch, "Language: English"); fchip(b, t, ch, "Accent: Any");
      voiceList(b, t, c, 328, 4.5);
      const nt = b.row(c, { w: "fill", gap: 8, align: "start" }); b.icon(nt, "info", 14, t.text3); b.text(nt, "Quality is Kokoro's own rating, from A (best) to C. Previewing a voice pauses the reading.", { size: 12, c: t.text2, w: "fill", lh: 17 });
      foot(b, t, pop); return;
    }
    controls(b, t, pop, state);
    if (state === "done") {
      const c = b.col(pop, { w: "fill", pad: [0, 16, 14, 16], gap: 0 });
      const u = b.row(c, { w: "fill", pad: 12, gap: 10, r: 12, fill: t.surface2 });
      const x = b.col(u, { gap: 1, w: "fill" }); b.text(x, "Up next · 1 of 2 queued", { size: 12, c: t.text2 }); b.text(x, "How small speech models got good", { size: 13, weight: "SemiBold", c: t.text, w: "fill" }); b.text(x, "blog.example.org · 6 min", { size: 12, c: t.text3 });
      K.btn(b, t, u, "Play next", { v: "primary", sz: "sm" });
    }
    footerRow(b, t, pop, state === "speed");
    if (state === "speed") {
      const c = b.col(pop, { w: "fill", pad: [4, 16, 14, 16], gap: 12 });
      K.slider(b, t, c, (1.2 - 0.5) / 2.5, 254, { label: "1.2x", min: "0.5x", max: "3x" });
      const r = b.row(c, { w: "fill", gap: 6 }); ["0.5x", "1x", "1.2x", "1.5x", "2x", "3x"].forEach((s, i) => { K.btn(b, t, r, s, { v: "secondary", w: "fill", state: i === 2 ? "pressed" : "rest" }); });
      const f = b.row(c, { w: "fill", justify: "spaceBetween" }); K.btn(b, t, f, "Reset to 1x", { v: "ghost", sz: "sm", icon: "refresh" }); b.text(f, "Arrow keys change speed by 0.1x", { size: 12, c: t.text2 });
    } else shortcuts(b, t, pop);
    foot(b, t, pop);
  },
});

export const A: S[] = [
  popup("A16", "Popup · engine asleep", "Idle unload freed the model; play wakes it, about 2 s.", "unloaded", 520),
  popup("A17", "Popup · waking the engine", "Press play on an unloaded engine: skips disabled, Cancel available.", "waking", 440),
  popup("A1", "Popup · idle on an article", "Nothing playing yet. One big action, selection (disabled until text is selected) and reader view.", "idle", 428),
  popup("A2", "Popup · selection ready", "Text is selected on the page; the popup offers to read only that, with a real time estimate.", "selection", 435),
  popup("A3", "Popup · preparing audio", "First sentence is being synthesized. Indeterminate bar, skip buttons disabled, Cancel available.", "loading", 434),
  popup("A4", "Popup · playing", "Scrubber with time left, 10 s skips, previous/next paragraph.", "playing", 400),
  popup("A5", "Popup · paused", "Same layout, play button instead of pause.", "paused", 400),
  popup("A6", "Popup · voice picker", "Searchable voice list with language and accent filters; every row has a preview button.", "voices", 599),
  popup("A7", "Popup · speed picker", "Slider with live value plus presets across the 0.5x to 3x range.", "speed", 462),
  popup("A8", "Popup · finished", "End of page; main button becomes replay and the next queued item is offered.", "done", 530),
  popup("A9", "Popup · app not running", "The desktop app is closed. Launch it, or download it.", "noapp", 398),
  popup("A10", "Popup · model loading", "App is up but the voice engine is still starting. Skips disabled, Cancel available.", "starting", 450),
  popup("A11", "Popup · page not readable", "Chrome internal pages and the Web Store block extensions.", "unreadable", 339),
  popup("A12", "Popup · playing (dark)", "Dark theme follows the browser.", "playing", 400, true),
  popup("A13", "Popup · app not installed", "First run: the app is not on this computer yet, so Download is the primary action.", "install", 368),
  popup("A14", "Popup · pairing token rejected", "App and browser no longer share a token; paste a new one in the extension options.", "token", 387),
  popup("A15", "Popup · local file needs permission", "file:// pages need “Allow access to file URLs” in the extension settings.", "fileurl", 387),
];

// ---------------- B: on-page ----------------
export type BO = { hl?: { para: number; sent: number; word: number }; selection?: boolean; dock?: K.DockState; rtheme?: "paper" | "dark"; rpop?: boolean; hover?: boolean; bubble?: boolean; ctx?: boolean; toast?: string; reader?: boolean; scrolled?: boolean; back?: boolean; pop?: "speed" | "voice"; details?: boolean; edge?: "tab" | "open" | "reading" | "readingOpen" };

const winMenu = (b: B, t: T, p: Ref, x: number, y: number, w: number, items: { l: string; k?: string; sub?: boolean; sep?: boolean; hi?: boolean; logo?: boolean }[]) => {
  const m = b.col(p, { x, y, w, pad: 8, gap: 0, r: 10, fill: "#FFFFFF", stroke: "#0000002E", sw: 1, shadow: "md" });
  items.forEach((it) => {
    if (it.sep) { const s = b.frame(m, { w: "fill", h: 9, layout: "horizontal", align: "center" }); b.rect(s, { w: "fill", h: 1, fill: "#0000001A" }); return; }
    const r = b.row(m, { w: "fill", h: 32, pad: [0, 12], gap: 10, r: 6, fill: it.hi ? "#E6E9ED" : "none", justify: "spaceBetween" });
    const l = b.row(r, { gap: 10 }); if (it.logo) K.logo(b, t, l, 16);
    b.text(l, it.l, { size: 13, c: "#1F1F1F" });
    if (it.k) b.text(r, it.k, { size: 13, c: "#5F6368" });
    if (it.sub) b.icon(r, "right", 14, "#5F6368");
  });
  return m;
};

// Reader view, Lumen F5: dark chrome, paper card inset 8 px (r12), 680 px serif column, current sentence block, reading popover top right.
const readerView = (b: B, t: T, c: Ref, hl: { sent: number; word: number }, rt: "paper" | "dark", pop: boolean) => {
  const P = rt === "paper" ? { bg: "#F7F3EA", tx: "#1F2328", sub: "#57606A", kick: "#8A6D00", sent: "#F5DFAC", word: "#F2C04E", wordTx: "#1F2328" } : { bg: "#17181A", tx: "#E6E6E6", sub: "#8C8C8C", kick: "#F2C04E", sent: "#433921", word: "#F2C04E", wordTx: "#121314" };
  const FF = "Georgia";
  b.rect(c, { x: 0, y: 0, w: 1280, h: 720, fill: t.mode === "dark" ? "#191A1B" : t.chrome2 });
  const card = b.frame(c, { x: 8, y: 0, w: 1264, h: 712, r: [12, 12, 12, 12], fill: P.bg, clip: true });
  const col = b.col(card, { x: 292, y: 56, w: 680, gap: 18 });
  b.text(col, "LOCAL-FIRST · 8 MIN READ", { size: 11, weight: "SemiBold", c: P.kick, ls: 0.5 });
  b.text(col, K.ARTICLE.title, { size: 34, ff: FF, lh: 42, c: P.tx, w: 680 });
  b.text(col, "Small models now run on an ordinary laptop, and nobody asks where the audio came from.", { size: 19, ff: FF, lh: 32, c: P.sub, w: 680 });
  const para = (text: string, cur: boolean) => {
    if (!cur) return b.text(col, text, { size: 19, ff: FF, lh: 32, c: P.tx, w: 680 });
    const row = b.frame(col, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w: 680, h: "hug", align: "start" });
    const sents = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text];
    sents.forEach((s2, si) => s2.trim().split(/\s+/).forEach((word, wi) => {
      const inS = si === hl.sent; const cw = inS && wi === hl.word;
      const f = b.row(row, { h: 32, pad: [0, 5, 0, 0], fill: inS ? P.sent : "none" });
      const g = b.row(f, { h: 28, r: 3, fill: cw ? P.word : "none" }); b.text(g, word, { size: 19, ff: FF, lh: 28, c: cw ? P.wordTx : P.tx });
    }));
  };
  para(K.ARTICLE.paras[0], true); para(K.ARTICLE.paras[1], false); para(K.ARTICLE.paras[2], false);
  if (pop) K.readingPopover(b, t, c, { abs: true, x: 1020, y: 24, theme: rt === "paper" ? "Paper" : "Dark", font: 1 });
};

// tooltip on a page that may be light or dark: Lumen tooltip tokens, forced dark like the dock
const DT = (t: T): T => ({ ...t, raised: "#1E1F20", text: "#FFFFFF", text3: "#BFBFBF", control: "#FFFFFF1F" });
export const page = (id: string, title: string, note: string, o: BO, dark0 = false): S => ({
  id, group: "B", title, note, w: 1280, h: 800, dark: dark0,
  build: (b, t0, root) => {
    const dark = dark0 || t0.mode === "dark";
    const t: T = dark ? { ...t0, hlSent: "#78621F" } : t0; // dark sentence band >= 3:1 against the page
    const c = K.browser(b, t, root, o.reader ? { reader: true } : {});
    if (o.reader) readerView(b, t, c, { sent: o.hl!.sent, word: o.hl!.word }, o.rtheme ?? "paper", !!o.rpop);
    else if (o.scrolled) {
      const vp = b.frame(c, { x: 0, y: 0, w: 1280, h: 720, clip: true });
      const inner = b.frame(vp, { x: 0, y: -380, w: 1280, h: 1400 });
      K.article(b, t, inner, { hl: o.hl });
      const more = b.col(inner, { x: 280, y: 650, w: 720, gap: 18 });
      b.text(more, "Why now", { size: 26, weight: "Bold", c: t.text, lh: 32 });
      b.text(more, "Three things changed at once. Phones and laptops gained dedicated silicon for machine learning, open models shrank by an order of magnitude, and the tools to ship them became ordinary packages instead of research projects.", { size: 18, lh: 30, c: t.text, w: 720 });
      b.text(more, "The result is software that treats the network as an optional extra. Sync still matters, but it happens when it can, not when it must, and the app never waits on a server to be useful.", { size: 18, lh: 30, c: t.text, w: 720 });
    } else {
      K.article(b, t, c, { hl: o.hl, selection: o.selection });
      if (o.hover) {
        b.rect(c, { x: 281, y: 422, w: 720, h: 120, r: 8, fill: t.accent + "14" });
        const g = b.frame(c, { x: 233, y: 424, w: 32, h: 32, r: 16, fill: t.accent, layout: "horizontal", align: "center", justify: "center", shadow: "md" }); b.icon(g, "play", 16, t.accentText);
        K.tooltip(b, DT(t), c, "Read from here", undefined, { x: 105, y: 427 });
      }
    }
    if (o.bubble) {
      // anchored 8px above the first selected line (screen y 334), centered on the selection
      const bb = b.row(c, { x: 546, y: 206, h: 40, pad: [0, 4], gap: 4, r: 12, fill: "#1E1F20", shadow: "lg" });
      K.btn(b, t, bb, "Listen", { v: "primary", icon: "play" });
      K.iconBtn(b, t, bb, "sliders", { size: 32, c: "#E6E6E6" }); K.iconBtn(b, t, bb, "copy", { size: 32, c: "#E6E6E6" });
      K.tooltip(b, DT(t), c, "Listen", "Ctrl Shift S", { x: 556, y: 172 });
    }
    if (o.ctx) {
      winMenu(b, t, c, 560, 290, 360, [
        { l: "Copy", k: "Ctrl+C" }, { l: "Search Google for “Notes, documents and even…”" }, { l: "Print…", k: "Ctrl+P" }, { sep: true },
        { l: "SpeakKit", sub: true, hi: true, logo: true }, { sep: true }, { l: "Inspect", k: "Ctrl+Shift+I" },
      ]);
      winMenu(b, t, c, 916, 290 + 105, 190, [{ l: "Read selection" }, { l: "Read from here" }, { l: "Add to queue" }]);
    }
    if (o.back) {
      const r = b.row(c, { x: 0, y: 16, w: 1280, justify: "center" });
      const pill = b.row(r, { h: 36, pad: [0, 16, 0, 12], gap: 8, r: 18, fill: "#1E1F20", shadow: "lg" }); b.icon(pill, "up", 16, "#FFFFFF"); b.text(pill, "Back to current", { size: 13, weight: "SemiBold", c: "#FFFFFF" });
    }
    if (o.toast) { const r = b.row(c, { x: 0, y: 640, w: 1280, justify: "center" }); K.toast(b, t, r, o.toast, "ok", { action: "View queue" }); }
    if (o.details) {
      const r = b.row(c, { x: 0, y: 690, w: 1280, justify: "center" });
      K.btn(b, t, r, "Details", { v: "secondary", sz: "sm", iconRight: "down" });
    }
    if (o.pop) {
      const sp = o.pop === "speed";
      const pw = sp ? 300 : 320; const right = sp ? 753 : 914; // right edge of the trigger inside the dock
      const h = sp ? 168 : 296;
      const pp = K.popover(b, t, c, { x: right - pw, y: 633 - h, w: pw });
      const hd = b.row(pp, { w: "fill", justify: "spaceBetween" }); b.text(hd, sp ? "Speed" : "Voice", { size: 14, weight: "SemiBold", c: t.text });
      if (sp) {
        K.btn(b, t, hd, "Reset to 1x", { v: "ghost", sz: "sm" });
        K.slider(b, t, pp, (1.2 - 0.5) / 2.5, 190, { label: "1.2x", min: "0.5x", max: "3x" });
        const r = b.row(pp, { w: "fill", gap: 6 }); ["0.5x", "1x", "1.2x", "1.5x", "2x", "3x"].forEach((s2, i) => K.btn(b, t, r, s2, { v: "secondary", sz: "sm", w: "fill", state: i === 2 ? "pressed" : "rest" }));
      } else {
        b.text(hd, "28 voices", { size: 12, c: t.text2 });
        K.input(b, t, pp, { placeholder: "Search voices", icon: "search", h: 34 });
        voiceList(b, t, pp, 288, 3.5);
      }
    }
    if (o.rpop && !o.reader) K.readingPopover(b, t, c, { abs: true, x: 1020, y: 24 } as any);
    if (o.dock) {
      const r = b.row(c, { x: 0, y: o.details ? 628 : 640, w: 1280, justify: "center" });
      K.dock(b, t, r, o.dock);
    }
    if (o.edge) {
      const reading = o.edge === "reading" || o.edge === "readingOpen";
      const bg = dark ? "#252627" : "#1E1F20"; const wc = "#FFFFFF"; const dim = "#BFBFBF";
      if (o.edge === "tab" || o.edge === "reading") {
        const w = reading ? 44 : 14;
        const tab = b.frame(c, { x: 1280 - w, y: 300, w, h: 76, r: [14, 0, 0, 14], fill: bg, shadow: "md", layout: "horizontal", align: "center", justify: "center", ...(dark ? { stroke: "#2A2B2C", sw: 1 } : {}) });
        if (reading) {
          const pb = b.frame(tab, { w: 26, h: 26, r: 13, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "pause", 12, t.accentText);
          b.rect(c, { x: 1280 - w + 5, y: 312, w: 3, h: 52, r: 2, fill: "#FFFFFF33" }); b.rect(c, { x: 1280 - w + 5, y: 345, w: 3, h: 19, r: 2, fill: t.accent });
        } else b.icon(tab, "left", 12, dim);
      } else {
        const W = 60; const sep = () => b.rect(pill, { w: 28, h: 1, fill: "#FFFFFF26" });
        const pill = b.col(c, { x: 1280 - W - 14, y: reading ? 186 : 236, w: W, pad: [10, 0], gap: 8, align: "center", r: 30, fill: bg, shadow: "lg", ...(dark ? { stroke: "#2A2B2C", sw: 1 } : {}) });
        K.iconBtn(b, t, pill, "right", { size: 28, c: dim });
        K.logo(b, t, pill, 32);
        const pb = b.frame(pill, { w: 44, h: 44, r: 22, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, reading ? "pause" : "play", 16, t.accentText);
        if (reading) {
          const rail = b.frame(pill, { w: 4, h: 56, r: 2, fill: "#FFFFFF33" }); b.rect(rail, { x: 0, y: 0, w: 4, h: 20, r: 2, fill: t.accent });
          b.text(pill, "4:21", { size: 12, weight: "Medium", c: dim, mono: true });
          sep();
          K.skip(b, pill, "back", 24, wc); K.skip(b, pill, "fwd", 24, wc);
        } else { sep(); K.iconBtn(b, t, pill, "book", { size: 36, c: wc }); }
        const sp = b.row(pill, { h: 28, w: 44, r: 8, fill: "#FFFFFF1F", justify: "center" }); b.text(sp, "1.2x", { size: 12, weight: "Medium", c: wc });
        const vc = b.frame(pill, { w: 36, h: 36, r: 18, fill: "#FFFFFF1F", layout: "horizontal", align: "center", justify: "center" }); K.avatar(b, t, vc, "H", 24, 0);
        if (reading) K.iconBtn(b, t, pill, "stop", { size: 36, c: wc }); else K.iconBtn(b, t, pill, "moreV", { size: 36, c: dim });
        K.tooltip(b, DT(t), c, reading ? "Pause" : "Listen to this page", reading ? "Space" : "6:48", { x: 1280 - W - 14 - (reading ? 113 : 178), y: reading ? 281 : 332 });
      }
    }
    if (o.pop) b.frame(c, { x: o.pop === "speed" ? 696 : 760, y: 649, w: o.pop === "speed" ? 59 : 156, h: 34, r: 17, stroke: t.accent, sw: 2 }); // trigger ring, drawn over the dock
  },
});
const HL = { para: 0, sent: 1, word: 6 };
export const Bs: S[] = [
  page("B1", "Page · selection bubble", "Selecting text pops a bubble 8 px above the selection: Listen (with its shortcut on hover), voice and speed, copy.", { selection: true, bubble: true }),
  page("B2", "Page · paragraph play gutter", "Hovering a paragraph tints it and shows a play button in the margin: read from here.", { hover: true }),
  page("B3", "Page · context menu", "Native Chrome menu: SpeakKit submenu with read selection, read from here and add to queue.", { selection: true, ctx: true }),
  page("B4", "Page · pill idle", "The read-aloud pill appears at the bottom after the first use (can be hidden per site).", { dock: "idle" }),
  page("B5", "Page · pill preparing", "Spinner while the first chunk is synthesized.", { dock: "loading" }),
  page("B6", "Page · reading with highlight", "Sentence background plus a stronger current-word marker; auto-scroll follows.", { hl: HL, dock: "playing" }),
  page("B7", "Page · paused", "Highlight stays on the last spoken sentence; pill shows elapsed and total time.", { hl: HL, dock: "paused" }),
  page("B8", "Page · finished", "The pill confirms the end and offers Read again.", { dock: "done" }),
  page("B9", "Page · app offline error", "One surface only: the pill explains the problem and offers Open SpeakKit and Retry; technical detail sits behind Details.", { dock: "error", details: true }),
  page("B10", "Page · reader view", "Paper reader at full fidelity: 680 px serif column, current sentence block, Reading popover and the pill. Close keeps playback running.", { reader: true, rpop: true, hl: { para: 0, sent: 1, word: 4 }, dock: "playing" }),
  page("B11", "Page · reading (dark)", "Dark page and dark highlight palette.", { hl: HL, dock: "playing" }, true),
  page("B12", "Page · reader view (dark)", "Dark reader: same column and highlight, paused state in the pill.", { reader: true, rtheme: "dark", hl: { para: 0, sent: 1, word: 4 }, dock: "paused" }),
  page("B13", "Page · added to queue", "Confirmation toast after Add to queue, with a link to the side panel.", { selection: true, toast: "Added to queue · 2 items" }),
  page("B15", "Page · speed popover", "Speed popover opened from the pill; right edges aligned, slider shows the live value.", { hl: HL, dock: "playing", pop: "speed" }),
  page("B16", "Page · voice popover", "Voice popover opened from the voice button in the pill, with search and a preview button on every row.", { hl: HL, dock: "playing", pop: "voice" }),
  page("B17", "Page · edge launcher, hidden", "Resting state: only a 14 px tab is visible at the right edge of the page, so it never covers content. Position is draggable up and down.", { edge: "tab" }),
  page("B18", "Page · edge launcher, hover", "Hovering the tab opens a vertical pill, like Speechify: logo, a big play button (tooltip shows the length), reader view, speed, voice, more.", { edge: "open" }),
  page("B19", "Page · edge launcher, reading", "While reading, the tab stays peeking out wider with a pause button and a thin progress line. Click to pause or resume without opening it.", { edge: "reading", hl: HL }),
  page("B20", "Page · edge launcher, reading expanded", "Hover while reading: the pill stacks pause, a vertical progress rail with time left, 10 s skips, speed, voice and stop. Moving away hides it after 1.5 s.", { edge: "readingOpen", hl: HL }),
  page("B21", "Page · edge launcher (dark)", "Same vertical pill on a dark page.", { edge: "open" }, true),
  page("B22", "Page · pill, engine asleep", "Idle unload freed the voice model; the pill says Engine asleep and play wakes it.", { hl: HL, dock: "unloaded" }),
  page("B23", "Page · pill, waking the engine", "Play on an unloaded engine: the play button spins and the bar loops for about 2 s.", { hl: HL, dock: "waking" }),
  page("B24", "Page · reading settings popover", "Reading popover opened from the pill: font, size, width, theme and the Highlight sentence toggle.", { hl: HL, dock: "playing", rpop: true }),
  page("B14", "Page · back to current", "The reader scrolled away from the spoken sentence; a pill jumps back to it.", { scrolled: true, back: true, hl: HL, dock: "playing" }),
];
