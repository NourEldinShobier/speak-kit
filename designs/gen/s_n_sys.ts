import { B, Ref } from "./lib";
import * as K from "./kit";
import { T, tint } from "./kit";
import * as X from "./kit2";
import { S } from "./types";
import { homeContent } from "./s_n_desktop";

const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = 1280, h = 800): S => ({ id, group, title, note, w, h, build });
const dim = (b: B, t: T, win: Ref, W = 1280, H = 800) => b.rect(win, { abs: true, x: 0, y: 0, w: W, h: H, fill: t.overlay });
const keys = (b: B, t: T, f: Ref, k: string[], state?: "rec") => { const r = b.row(f, { gap: 8 }); if (state === "rec") { const pk = b.row(r, { h: 24, pad: [0, 10], r: 6, stroke: t.accent, sw: 1.5, sa: "inside" }); b.text(pk, "Press keys…", { size: 11, c: t.accent }); } else K.kbd(b, t, r, k); return r; };

// ---------------- settings pages ----------------
const memory = (asleep: boolean) => (b: B, t: T, root: Ref) => {
  X.settingsPage(b, t, root, "memory", "Memory and performance", "Speak Kit keeps the voice engine loaded while you listen and unloads it when you stop, so it holds no memory in the background.", (c) => {
    X.group(b, t, c, "VOICE ENGINE", [
      (f) => K.settingRow(b, t, f, "Unload the engine after", "Gives back about 420 MB. It wakes in about 2 seconds when you press play.", (r) => K.seg(b, t, r, ["1 min", "5 min", "15 min", "Never"], 1)),
      (f) => X.toggleRow(b, t, f, "Load the engine at startup", "On: the first play is instant and memory is used from sign-in. Off: the engine wakes on play.", false),
      (f) => X.toggleRow(b, t, f, "Use the GPU when the model fits", "Falls back to the CPU on its own if the GPU runs out of memory.", true)]);
    X.group(b, t, c, "POWER", [
      (f) => X.toggleRow(b, t, f, "Battery saver", "On battery the engine unloads after 1 minute and uses 2 CPU threads.", true),
      (f) => X.selectRow(b, t, f, "CPU threads", "Auto uses half of your cores.", "Auto (4)", 130)]);
    const g = b.col(c, { w: "fill", gap: 4 }); X.caps(b, t, g, "RIGHT NOW");
    const st = b.row(g, { w: "fill", pad: 16, gap: 14, r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
    const tile = b.frame(st, { w: 32, h: 32, r: 6, fill: tint(asleep ? t.text3 : t.ok, 0.16), layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, asleep ? "zzz" : "circleCheck", 16, asleep ? t.text3 : t.ok);
    const x = b.col(st, { gap: 2, w: "fill" });
    const h = b.row(x, { gap: 8 }); b.text(h, "Kokoro-82M", { size: 13, weight: "Medium", c: t.text }); K.badge(b, t, h, asleep ? "Unloaded" : "Loaded", asleep ? "neutral" : "ok");
    b.text(x, asleep ? "0 MB in memory · unloaded 12 minutes ago · wakes on play in about 2 s" : "420 MB in memory · unloads in 4:12 if you stop listening", { size: 12, c: t.text3 });
    K.btn(b, t, st, asleep ? "Load now" : "Unload now", { v: "secondary", icon: asleep ? "zap" : "zzz" });
  }, { pill: asleep ? { label: "Engine asleep", tone: "neutral", icon: "zzz" } : undefined });
};
const keysPage = (mode: "conflict" | "rec") => (b: B, t: T, root: Ref) => {
  X.settingsPage(b, t, root, "keys", "Shortcuts", "Global shortcuts work in any app, even when Speak Kit is in the tray. Change them any time.", (c) => {
    if (mode === "conflict") X.banner(b, t, c, { tone: "warn", title: "Ctrl Alt S is also used by Microsoft Word (New comment)", body: "Speak Kit takes priority while it runs, so Word's shortcut stops working. Pick another shortcut, or keep both.", primary: "Use Ctrl Alt Shift S instead", secondary: "Keep Ctrl Alt S" });
    const rows: [string, string[]][] = [["Read selected text", ["Ctrl", "Alt", "S"]], ["Read clipboard", ["Ctrl", "Alt", "C"]], ["Play or pause", ["Ctrl", "Alt", "Space"]], ["Stop", ["Ctrl", "Alt", "X"]]];
    X.group(b, t, c, "GLOBAL", rows.map(([l, k], i) => (f: Ref) => K.settingRow(b, t, f, l, undefined, (r) => keys(b, t, r, k, mode === "rec" && i === 1 ? "rec" : undefined))));
    X.group(b, t, c, "IN THE BROWSER", [(f) => K.settingRow(b, t, f, "Read selection", "Set in Chrome: chrome://extensions/shortcuts", (r) => keys(b, t, r, ["Ctrl", "Shift", "S"])), (f) => K.settingRow(b, t, f, "Play or pause", undefined, (r) => keys(b, t, r, ["Ctrl", "Shift", "P"]))]);
  }, { colW: 820 });
};
const notify = (b: B, t: T, root: Ref) => {
  X.settingsPage(b, t, root, "notify", "Notifications", "Windows toasts open Speak Kit at the right place. They carry no buttons; everything also lands in the bell.", (c) => {
    const card = b.col(c, { w: "fill", pad: [0, 16], r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
    const hd = b.row(card, { w: "fill", h: 34, gap: 0 }); b.text(hd, "EVENT", { size: 11, weight: "SemiBold", c: t.text3, w: "fill" }); ["Toast", "Bell", "Sound"].forEach((s) => b.text(hd, s, { size: 11, weight: "SemiBold", c: t.text3, w: 90, ta: "center" }));
    [["Reading finished", 1, 1, 0], ["Export done", 1, 1, 0], ["Model download done", 1, 1, 0], ["Engine error", 1, 1, 1], ["Update ready", 0, 1, 0]].forEach(([n, a, bb, s]) => {
      K.divider(b, t, card); const r = b.row(card, { w: "fill", h: 46 }); b.text(r, n as string, { size: 13, weight: "Medium", c: t.text, w: "fill" });
      [a, bb, s].forEach((v) => { const cell = b.row(r, { w: 90, justify: "center" }); K.checkbox(b, t, cell, !!v); });
    });
    X.group(b, t, c, "QUIET TIMES", [(f) => X.toggleRow(b, t, f, "Do not disturb", "Silences toasts and sounds. The bell still collects them.", false), (f) => X.toggleRow(b, t, f, "Follow Windows Focus", "Urgent engine errors wait in the bell while Focus is on.", true)]);
  }, { colW: 820 });
};
const startup = (b: B, t: T, root: Ref) => {
  X.settingsPage(b, t, root, "startup", "Startup and tray", "Speak Kit uses about 120 MB of memory when idle. The voice engine is not loaded until you listen.", (c) => {
    X.group(b, t, c, "WHEN I SIGN IN", [(f) => X.toggleRow(b, t, f, "Start Speak Kit when I sign in", "Starts hidden in the tray so the extension is ready.", true), (f) => X.toggleRow(b, t, f, "Open the window at start", "Off: only the tray icon appears.", false)]);
    X.group(b, t, c, "WHEN THE WINDOW IS CLOSED", [(f) => X.toggleRow(b, t, f, "Keep running in the tray", "The extension and global shortcuts keep working.", true), (f) => X.toggleRow(b, t, f, "Show the tray icon state", "Working, needs you and paused change the icon.", true), (f) => X.toggleRow(b, t, f, "Keep the computer awake while reading", "Off by default. Closing a laptop lid still sleeps.", false)]);
  });
};
const searchRes = (b: B, t: T, root: Ref) => {
  const { win } = X.settingsPage(b, t, root, "general", "General", undefined, (c) => {
    X.group(b, t, c, "STARTUP AND LANGUAGE", [(f) => X.toggleRow(b, t, f, "Launch when I sign in", "Start in the tray so the extension is ready.", true), (f) => X.selectRow(b, t, f, "Interface language", undefined, "English")]);
  }, { search: "mem" });
  const p = b.col(win, { abs: true, x: 430, y: 40, w: 420, pad: 6, gap: 2, r: 10, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "lg" });
  [["cpu", "Memory and performance", "Engine", true], ["cpu", "Unload the engine after", "Memory and performance", false], ["cpu", "Load the engine at startup", "Memory and performance", false], ["hardDrive", "Memory for the audio cache", "Storage and models", false]].forEach(([ic, l, d, sel]) => {
    const r = b.row(p, { w: "fill", h: 44, pad: [0, 8], gap: 10, r: 6, fill: sel ? t.selected : "none" }); b.icon(r, ic as string, 16, t.text2);
    const x = b.col(r, { gap: 1, w: "fill" }); b.text(x, l as string, { size: 13, c: t.text }); b.text(x, d as string, { size: 12, c: t.text3 });
  });
};
const upd = (b: B, t: T, root: Ref) => {
  const { win, main } = K.desktopWindow(b, t, root, { nav: "home", update: true });
  homeContent(b, t, main);
  const p = K.popover(b, t, win, { abs: true, x: 800, y: 44, w: 380, gap: 12 } as any);
  const h = b.row(p, { w: "fill", justify: "spaceBetween" }); b.text(h, "Speak Kit 1.1.0 is ready", { size: 14, weight: "SemiBold", c: t.text }); K.badge(b, t, h, "18 MB", "neutral");
  ["The engine wakes in about 1.2 s instead of 2 s", "New Pause between paragraphs setting", "Fixes a crash when pairing a second browser"].forEach((s) => { const r = b.row(p, { w: "fill", gap: 8, align: "start" }); b.icon(r, "check", 14, t.ok); b.text(r, s, { size: 12, c: t.text2, w: "fill", lh: 17 }); });
  b.text(p, "1 reading is playing. Restarting waits for it to finish.", { size: 11, c: t.text3 });
  const r = b.row(p, { w: "fill", gap: 8, justify: "max" }); K.btn(b, t, r, "Install when I quit", { v: "secondary" }); K.btn(b, t, r, "Restart now", { v: "primary" });
};
const updating = (b: B, t: T, root: Ref) => {
  const { win, main } = K.desktopWindow(b, t, root, { nav: "home", update: true }); homeContent(b, t, main); dim(b, t, win);
  const c = b.col(win, { abs: true, x: 440, y: 290, w: 400, pad: 24, gap: 14, r: 14, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg", align: "center" });
  K.logo(b, t, c, 44, { r: 12 }); b.text(c, "Updating Speak Kit…", { size: 16, weight: "SemiBold", c: t.text }); K.progress(b, t, c, 0.4, { w: 352 });
  b.text(c, "Speak Kit will reopen where you left off. Your readings and settings stay as they are.", { size: 12, c: t.text2, w: "fill", ta: "center", lh: 17 });
};

// ---------------- engine states ----------------
const ENG = [
  { k: "Unloaded", tone: "neutral" as const, meaning: "Model is not in memory. Press play and it wakes in about 2 s.", popup: "Engine asleep", pill: "unloaded" as const, side: { label: "Kokoro-82M · Asleep", sub: "Unloaded · wakes on play", tone: "neutral" as const }, tray: "asleep" as const },
  { k: "Loading", tone: "warn" as const, meaning: "Waking: play is pending, the bar loops, skips are disabled, Cancel works.", popup: "Waking engine", pill: "waking" as const, side: { label: "Kokoro-82M · Loading…", sub: "About 2 s", tone: "warn" as const }, tray: "working" as const },
  { k: "Ready", tone: "ok" as const, meaning: "Model is loaded. It unloads after 5 min idle (Settings, Memory).", popup: "Kokoro ready", pill: "playing" as const, side: { label: "Kokoro-82M · Ready", sub: "CPU · 0.4x real time", tone: "ok" as const }, tray: "normal" as const },
];
const engBoard = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 1760, h: 760, pad: 32, gap: 18, fill: t.bg });
  b.text(c, "Engine states: one lifecycle, the same words on every surface", { size: 22, weight: "SemiBold", c: t.text });
  const hd = b.row(c, { w: "fill", gap: 24 }); ["STATE", "POPUP HEADER", "READ-ALOUD PILL", "SIDEBAR CARD", "TRAY"].forEach((s, i) => { const w = [270, 330, 649, 248, 60][i]; X.caps(b, t, b.row(hd, { w }), s); });
  ENG.forEach((e) => {
    const r = b.row(c, { w: "fill", gap: 24, pad: [16, 0], align: "center" }); K.divider(b, t, c);
    const a = b.col(r, { w: 270, gap: 6 }); const h = b.row(a, { gap: 8 }); b.text(h, e.k, { size: 16, weight: "SemiBold", c: t.text }); K.badge(b, t, h, e.k, e.tone); b.text(a, e.meaning, { size: 12, c: t.text2, w: "fill", lh: 17 });
    const pp = b.row(r, { w: 330, h: 52, pad: [0, 16], justify: "spaceBetween", r: 12, fill: t.raised, stroke: t.control, sw: 1, sa: "inside" });
    const l = b.row(pp, { gap: 8 }); K.logo(b, t, l, 24); b.text(l, "Speak Kit", { size: 14, weight: "SemiBold", c: t.text }); K.badge(b, t, pp, e.popup, e.tone === "neutral" ? "neutral" : e.tone);
    const pw = b.row(r, { w: 649 }); K.dock(b, t, pw, e.pill);
    const sb = K.card(b, t, r, { w: 248, pad: 12, gap: 6, r: 10 }); const r1 = b.row(sb, { gap: 8 }); b.icon(r1, e.side.tone === "ok" ? "circleCheck" : e.side.tone === "neutral" ? "zzz" : "alertCircle", 16, X.toneC(t, e.side.tone === "ok" ? "ok" : e.side.tone === "warn" ? "warn" : "neutral")); b.text(r1, e.side.label, { size: 13, weight: "Medium", c: t.text }); b.text(sb, e.side.sub, { size: 12, c: t.text2 });
    X.trayIcon(b, t, r, e.tray, 48);
  });
  X.rulesCard(b, t, c, "Rules", ["Unloaded and Ready are both calm: no warning color; amber only while loading.", "Press play on Unloaded: the same button shows the spinner (Loading), then reading starts without another click.", "The model never unloads while a reading plays or an export renders."], { w: 760 });
};
const enginesPage = (st: "unloaded" | "loading") => (b: B, t: T, root: Ref) => {
  const un = st === "unloaded";
  const { main } = K.desktopWindow(b, t, root, { nav: "engines", status: un ? { label: "Kokoro-82M · Asleep", sub: "Unloaded · wakes on play", tone: "neutral" } : { label: "Kokoro-82M · Loading…", sub: "About 2 s", tone: "warn" }, pill: un ? { label: "Engine asleep", tone: "neutral", icon: "zzz" } : { label: "Loading engine", tone: "warn", spinner: true } });
  K.pageHeader(b, t, main, "Engines", "Voices are made on this computer. One engine in version 1.");
  const c = b.col(main, { w: "fill", pad: [12, 32], gap: 14 });
  const card = K.card(b, t, c, { w: "fill", pad: 20, gap: 14 });
  const h = b.row(card, { w: "fill", gap: 12 }); const tile = b.frame(h, { w: 40, h: 40, r: 10, fill: tint(un ? t.text3 : t.warn, 0.16), layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, un ? "zzz" : "loader", 20, un ? t.text3 : t.warn);
  const x = b.col(h, { gap: 3, w: "fill" }); const hr = b.row(x, { gap: 8 }); b.text(hr, "Kokoro-82M", { size: 15, weight: "SemiBold", c: t.text }); K.badge(b, t, hr, un ? "Unloaded" : "Loading", un ? "neutral" : "warn");
  b.text(x, un ? "Wakes on play in about 2 seconds. Unloaded after 5 minutes without listening." : "Loading the model into memory. Your reading starts as soon as it is ready.", { size: 12.5, c: t.text2 });
  if (!un) K.btn(b, t, h, "Cancel", { v: "secondary" }); else K.btn(b, t, h, "Load now", { v: "primary", icon: "zap" });
  if (!un) { const tr = b.frame(card, { w: 720, h: 4, r: 999, fill: t.hover, clip: true }); b.rect(tr, { x: 240, y: 0, w: 220, h: 4, r: 999, fill: t.accent }); }
  K.divider(b, t, card);
  const st2 = b.row(card, { w: "fill", gap: 24 });
  [["Memory", un ? "0 MB" : "210 MB and rising"], ["Last used", un ? "12 minutes ago" : "just now"], ["Wake time", "about 2 s"], ["Runs on", "CPU (4 threads)"]].forEach(([a, v]) => { const q = b.col(st2, { gap: 2, w: "fill" }); X.caps(b, t, q, (a as string).toUpperCase()); b.text(q, v as string, { size: 13, weight: "Medium", c: t.text }); });
  const r2 = b.row(card, { gap: 8 }); K.btn(b, t, r2, "Memory settings", { v: "ghost", sz: "sm", icon: "settings" });
  const cc = K.card(b, t, c, { w: "fill", pad: 16, gap: 8, opacity: 0.6 } as any); const ch = b.row(cc, { gap: 8 }); b.text(ch, "Chatterbox", { size: 14, weight: "SemiBold", c: t.text }); K.badge(b, t, ch, "LATER (v1.1)", "neutral"); b.text(cc, "Voice cloning. Not part of version 1.", { size: 12.5, c: t.text2 });
};

// ---------------- tray, toasts, mini player ----------------
const trayPanel = (b: B, t: T, p: Ref, o: O1 = {}) => {
  const f = b.col(p, { w: 306, pad: 0, gap: 0, r: 12, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "lg", clip: true, ...o });
  const h = b.row(f, { w: "fill", h: 44, pad: [0, 12], justify: "spaceBetween" }); const hl = b.row(h, { gap: 8 }); K.logo(b, t, hl, 20); b.text(hl, "Speak Kit", { size: 13, weight: "SemiBold", c: t.text });
  const hr = b.row(h, { gap: 0 }); K.iconBtn(b, t, hr, "settings", { size: 28 }); K.iconBtn(b, t, hr, "maximize", { size: 28 });
  K.divider(b, t, f);
  const rows: [string, string, string, string, string?][] = [["loader", t.accent, "The quiet return of local-first software", "Reading · paragraph 2 of 14"], ["circleCheck", t.ok, "Attention Is All You Need.pdf", "Export ready · 4.2 MB"], ["alertCircle", t.warn, "Meeting notes: Q4 planning", "Needs you: pick a voice for this language"]];
  rows.forEach(([ic, c, n, d], i) => { if (i) K.divider(b, t, f); const r = b.row(f, { w: "fill", pad: [10, 12], gap: 10, align: "start" }); b.icon(r, ic, 16, c); const x = b.col(r, { gap: 1, w: "fill" }); b.text(x, n, { size: 12, weight: "Medium", c: t.text, w: "fill", maxLines: 1 }); b.text(x, d, { size: 11, c: i === 2 ? t.warn : t.text3, w: "fill" }); });
  const nx = b.row(f, { w: "fill", pad: [8, 12], gap: 8, fill: t.surface }); b.icon(nx, "clock", 14, t.text3); b.text(nx, "Next: How small speech models got good", { size: 11, c: t.text2, w: "fill" });
  const ft = b.row(f, { w: "fill", pad: [10, 12], justify: "spaceBetween" }); K.btn(b, t, ft, "Pause all", { v: "secondary", sz: "sm", icon: "pause" }); b.text(ft, "Quit", { size: 12, c: t.text3 });
  return f;
};
type O1 = Record<string, any>;
const tray = (b: B, t: T, root: Ref) => {
  X.wallpaper(b, t, root);
  X.nativeMenu(b, t, root, [{ l: "Read clipboard", k: "Ctrl Alt C" }, { l: "Open Speak Kit" }, "-", { l: "Pause", hi: true }, { l: "Do not disturb" }, "-", { l: "Settings" }, { l: "Check for updates" }, "-", { l: "Quit Speak Kit" }], { x: 660, y: 800 - 48 - 14 - 284 } as any);
  trayPanel(b, t, root, { x: 962, y: 800 - 48 - 12 - 330 });
  X.rulesCard(b, t, root, "Tray rules", ["Right-click: a short native menu. Left-click: Speak Kit's own panel.", "Icon states: normal, working (animated), needs you (orange dot), paused (grey), asleep (dim).", "Closing the window keeps Speak Kit in the tray. Quit is in both places and asks first when work is running."], { x: 40, y: 800 - 48 - 24 - 150 });
};
const trayStates = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 1280, h: 800, pad: 40, gap: 24, fill: t.bg });
  b.text(c, "Tray icon states", { size: 22, weight: "SemiBold", c: t.text }); b.text(c, "The icon is the only status that is always visible. Color is used only for state.", { size: 13, c: t.text2 });
  const r = b.row(c, { w: "fill", gap: 16, align: "start" });
  ([["normal", "Idle or reading", "White bars, still."], ["working", "Working", "Bars animate while a reading plays or an export renders."], ["needs", "Needs you", "Orange dot: a choice or an error waits in the panel."], ["paused", "Paused", "Grey, shorter bars. Reading is paused or Do not disturb is on."], ["asleep", "Engine asleep", "Dim bars. Press play and it wakes."]] as const).forEach(([s, n, d]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 16, gap: 10 }); X.trayIcon(b, t, k, s, 56); b.text(k, n, { size: 13, weight: "SemiBold", c: t.text }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 });
  });
  const m = b.row(c, { w: "fill", gap: 32, align: "start" });
  const a = b.col(m, { gap: 8 }); X.caps(b, t, a, "WHILE READING"); X.nativeMenu(b, t, a, [{ l: "Read clipboard", k: "Ctrl Alt C" }, { l: "Open Speak Kit" }, "-", { l: "Pause", hi: true }, { l: "Do not disturb" }, "-", { l: "Settings" }, { l: "Check for updates" }, "-", { l: "Quit Speak Kit" }], {});
  const a2 = b.col(m, { gap: 8 }); X.caps(b, t, a2, "ENGINE ASLEEP"); X.nativeMenu(b, t, a2, [{ l: "Read clipboard", k: "Ctrl Alt C" }, { l: "Open Speak Kit" }, "-", { l: "Wake the engine" }, { l: "Do not disturb" }, "-", { l: "Settings" }, { l: "Check for updates" }, "-", { l: "Quit Speak Kit" }], {});
  const a3 = b.col(m, { gap: 8 }); X.caps(b, t, a3, "UPDATE READY"); X.nativeMenu(b, t, a3, [{ l: "Read clipboard", k: "Ctrl Alt C" }, { l: "Open Speak Kit" }, "-", { l: "Install update 1.1.0", hi: true }, { l: "Do not disturb" }, "-", { l: "Settings" }, "-", { l: "Quit Speak Kit" }], {});
};
const toasts = (b: B, t: T, root: Ref) => {
  X.wallpaper(b, t, root);
  X.winToast(b, t, root, { title: "Export done: Attention Is All You Need", body: "MP3 · 4.2 MB · 14 min. Saved to Documents\\Speak Kit.", hint: "Click to show the file", tone: "ok", x: 900, y: 800 - 48 - 16 - 3 * 128 - 20 } as any);
  X.winToast(b, t, root, { title: "Read what you copied?", body: "412 words copied from Chrome. About 2 min 10 s at 1.2x.", hint: "Click to read it", x: 900, y: 800 - 48 - 16 - 2 * 128 - 10 } as any);
  X.winToast(b, t, root, { title: "The voice engine stopped", body: "Your readings are saved. Speak Kit restarted the engine and playback can continue.", hint: "Click to open Speak Kit", tone: "err", x: 900, y: 800 - 48 - 16 - 128 } as any);
  X.rulesCard(b, t, root, "Notification rules", ["No buttons: Windows toasts cannot carry them reliably. Every toast opens Speak Kit at the exact place.", "Grouped per event, at most one toast per event every 10 minutes.", "Do not disturb and Windows Focus are respected; everything also appears in the bell."], { x: 40, y: 800 - 48 - 24 - 150 });
};
const mini = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 1280, h: 800, pad: 40, gap: 22, fill: t.bg });
  b.text(c, "Mini player: a 36 px pill that grows with a spring and shrinks to a dot when quiet", { size: 22, weight: "SemiBold", c: t.text });
  const r = b.row(c, { w: "fill", gap: 16, align: "start" });
  const stage = (lab: string, time: string, draw: (f: Ref) => void) => { const k = K.card(b, t, r, { w: "fill", h: 200, pad: 16, gap: 12 }); b.text(k, time, { size: 11, c: t.text3 }); const a = b.row(k, { w: "fill", h: "fill", justify: "center" }); draw(a); b.text(k, lab, { size: 12, c: t.text2, w: "fill", lh: 17 }); };
  const pillBox = (f: Ref, w: number, content: (p: Ref) => void, op?: number) => { const p = b.row(f, { h: 36, w, pad: [0, 8], gap: 8, r: 999, fill: "#252627", stroke: "#FFFFFF14", sw: 1, sa: "inside", shadow: "md", opacity: op, justify: "center" }); content(p); };
  const meter = (p: Ref, n = 4) => { const m = b.row(p, { gap: 3, align: "center" }); for (let i = 0; i < n; i++) b.ellipse(m, { w: 4, h: 4, fill: i < 3 ? "#0078D4" : "#FFFFFF33" }); };
  stage("Quiet: a 14 px dot at 55% opacity, never in the way.", "+0 ms", (f) => { const d = b.frame(f, { w: 14, h: 14, r: 7, fill: "#252627", opacity: 0.55 }); });
  stage("Play pressed: the pill grows with the spring (420, 34).", "+180 ms", (f) => pillBox(f, 120, (p) => { b.ellipse(p, { w: 8, h: 8, fill: "#0078D4" }); b.text(p, "Heart", { size: 12, c: "#E6E6E6" }); }));
  stage("Content fades in after 60% of the width. The stop button never moves once shown.", "+320 ms", (f) => pillBox(f, 184, (p) => { b.ellipse(p, { w: 8, h: 8, fill: "#0078D4" }); b.text(p, "Heart", { size: 12, c: "#E6E6E6", w: "fill" }); meter(p); K.iconBtn(b, t, p, "stop", { size: 24, c: "#E6E6E6" }); }));
  stage("Paused: meter holds one steady dot row, play replaces the dot.", "+4.2 s", (f) => pillBox(f, 184, (p) => { b.icon(p, "pause", 14, "#BFBFBF"); b.text(p, "Paused", { size: 12, c: "#E6E6E6", w: "fill" }); K.iconBtn(b, t, p, "stop", { size: 24, c: "#E6E6E6" }); }));
  stage("4 s of quiet: shrinks back to the dot and fades to 55%.", "+8.2 s · 4 s quiet", (f) => pillBox(f, 36, () => {}, 0.55));
  const g = b.row(c, { w: "fill", gap: 16, align: "start" });
  X.rulesCard(b, t, g, "Pill rules", ["Always on top, 36 px tall, draggable; position is remembered per monitor.", "Width follows the content with the spring; the stop button keeps its place.", "Level meter: 0 to 2 dots per column, smoothed 80 ms at 60 fps.", "Reduce motion: one steady dot row, no spring, fades only (83 ms)."], { w: 600 });
};

// ---------------- quit, edge states, empty states ----------------
const quit = (b: B, t: T, root: Ref) => {
  const { win, main } = K.desktopWindow(b, t, root, { nav: "home" }); homeContent(b, t, main); dim(b, t, win);
  const d = b.col(win, { abs: true, x: 400, y: 220, w: 480, pad: 24, gap: 16, r: 14, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg" });
  const h = b.row(d, { w: "fill", gap: 12, align: "center" }); const tile = b.frame(h, { w: 36, h: 36, r: 8, fill: tint(t.warn, 0.16), layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, "alert", 18, t.warn); b.text(h, "Quit Speak Kit?", { size: 16, weight: "SemiBold", c: t.text });
  b.text(d, "1 reading is playing and 2 exports are rendering.", { size: 13, c: t.text2 });
  const l = b.col(d, { w: "fill", pad: [0, 14], r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
  [["The quiet return of local-first software", "Stops now; resume from Library later"], ["Export: Attention Is All You Need.mp3", "Stops now; start it again from Library"], ["Export: Meeting notes.wav", "Stops now; start it again from Library"]].forEach(([n, c], i) => { if (i) K.divider(b, t, l); const r = b.col(l, { w: "fill", pad: [10, 0], gap: 1 }); b.text(r, n, { size: 13, weight: "Medium", c: t.text }); b.text(r, c, { size: 12, c: t.text3 }); });
  const f = b.row(d, { w: "fill", justify: "spaceBetween" }); K.btn(b, t, f, "Keep running in tray", { v: "secondary", sz: "dlg" }); K.btn(b, t, f, "Quit", { v: "danger", sz: "dlg" });
};
const edge = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 2400, h: 520, pad: 40, gap: 20, fill: t.bg });
  b.text(c, "Edge states: each shows where the problem happened, keeps what worked, and offers one next step", { size: 22, weight: "SemiBold", c: t.text });
  const cases: [string, X.BTone, string, string, string, string?][] = [
    ["OFFLINE", "info", "You're offline", "Reading on this computer still works. Updates and the Web Store wait.", "Read something"],
    ["ENGINE NOT RESPONDING", "err", "Speak Kit's engine stopped", "Your readings are saved. Restarting takes about 2 seconds.", "Restart engine", "Send crash report"],
    ["PORT IN USE", "err", "Port 51730 is in use", "Another program holds the port, so Chrome can't connect. Nothing was lost.", "Choose port", "Show what uses it"],
    ["DISK ALMOST FULL", "warn", "Only 1.1 GB left on drive D", "New audio can't be cached. Existing readings are unaffected.", "Clear cache", "Manage storage"],
    ["MODEL CHECKSUM FAILED", "err", "The voice model didn't verify", "The download was damaged. The previous model keeps working.", "Download again"],
    ["EXTENSION OUT OF DATE", "warn", "The Chrome extension is older than the app", "Reading still works. Update to get the new pill.", "Update extension"],
    ["MICROPHONE BLOCKED", "warn", "Windows blocks the microphone", "Recording a voice sample needs it. Reading is unaffected.", "Open System Settings"],
    ["SHORTCUT TAKEN", "warn", "Another app now uses Ctrl Alt S", "Read selection moved to Ctrl Alt Shift S for now.", "Choose shortcut"],
    ["OUT OF GPU MEMORY", "warn", "The GPU ran out of memory", "Speak Kit switched this reading to the CPU, about 3x slower.", "Use CPU always", "Retry on GPU"],
    ["DOWNLOAD PAUSED", "warn", "Model download paused at 62%", "It continues from here, nothing is downloaded twice.", "Resume"],
    ["UPDATE FAILED", "err", "The update couldn't be installed", "You are still on 1.0.4 and everything works.", "Try again", "Download manually"],
    ["PAIRING TOKEN REJECTED", "err", "Chrome no longer matches this app", "Readings in the app work. Pair the browser again to read pages.", "Pair again"],
  ];
  for (let r = 0; r < 3; r++) {
    const row = b.row(c, { w: "fill", gap: 24, align: "start" });
    cases.slice(r * 4, r * 4 + 4).forEach(([lab, tone, ti, bo, p1, p2]) => { const cell = b.col(row, { w: "fill", gap: 6 }); X.caps(b, t, cell, lab); X.banner(b, t, cell, { tone, title: ti, body: bo, primary: p1, secondary: p2 }); });
  }
};
const empties = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 2160, h: 560, pad: 32, gap: 18, fill: t.bg });
  b.text(c, "Empty states: an icon tile, what will appear here, what stays local, one action", { size: 22, weight: "SemiBold", c: t.text });
  const r = b.row(c, { w: "fill", gap: 24 });
  [["book", "No readings yet", "Add a PDF, a web address or pasted text. Everything stays on this computer.", "Add a reading"], ["playlist", "Nothing in the queue", "Pages you add with Add to queue wait here, in order.", "Open Chrome"], ["mic", "No voices selected", "Pick the voices you want in the popup. Kokoro ships with 54.", "Browse voices"], ["fileExport", "No exports", "Rendered MP3 and WAV files appear here while they are on disk.", "Export a reading"], ["bell", "All caught up", "Reading finished, export done and engine errors collect here.", undefined]].forEach(([ic, ti, d, a]) => {
    const k = K.card(b, t, r, { w: "fill", h: 400, pad: 24, gap: 12, align: "center", justify: "center" });
    const tile = b.frame(k, { w: 48, h: 48, r: 12, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, ic as string, 24, t.text2);
    b.text(k, ti as string, { size: 14, weight: "SemiBold", c: t.text }); b.text(k, d as string, { size: 12, c: t.text2, w: "fill", ta: "center", lh: 17 }); if (a) K.btn(b, t, k, a as string, { v: "primary" });
  });
};

export const N3: S[] = [
  scr("H12", "H", "Settings · Memory and performance", "Idle unload 1, 5, 15 minutes or never; load at startup; battery saver; the live engine state below.", memory(false)),
  scr("H13", "H", "Settings · Memory (engine unloaded)", "Same page with the engine asleep: 0 MB in memory, wakes on play, Load now.", memory(true)),
  scr("H14", "H", "Settings · Notifications", "Event table with Toast, Bell and Sound; Do not disturb and Windows Focus below.", notify),
  scr("H15", "H", "Settings · Startup and tray", "Sign-in start, tray behavior and keep-awake, with the memory cost stated.", startup),
  scr("H16", "H", "Settings · Shortcuts (conflict)", "A conflict names the other app and offers one alternative, never a silent override.", keysPage("conflict")),
  scr("H17", "H", "Settings · Search settings", "The title-bar search finds a row and names the page it lives on.", searchRes),
  scr("H18", "H", "Update ready · pill and popover", "Never forced: a green pill in the title bar opens a popover with Install when I quit or Restart now.", upd),
  scr("H19", "H", "Updating", "Restart shows one small progress card and says Speak Kit will reopen where you left off.", updating),
  scr("O1", "O", "Engine states board", "Unloaded, Loading and Ready use the same words and icons in the popup, the pill, the sidebar and the tray.", engBoard, 1760, 760),
  scr("O2", "O", "Engines · unloaded", "Unloaded: 0 MB, wakes on play, Load now; the title-bar pill says Engine asleep.", enginesPage("unloaded")),
  scr("O3", "O", "Engines · loading", "Loading: looping bar, Cancel, memory rising; the title-bar pill is amber with a spinner.", enginesPage("loading")),
  scr("I10", "I", "Tray menu and left-click panel", "Right-click opens a short native menu; left-click opens Speak Kit's own panel with state icons.", tray),
  scr("I11", "I", "Tray icon states", "Normal, working, needs you, paused and asleep; menus change one row for asleep and update ready.", trayStates),
  scr("I12", "I", "Windows toasts", "Export done, clipboard prompt and engine error: no buttons, each click opens the exact place.", toasts),
  scr("I13", "I", "Mini player storyboard", "36 px pill, spring width, stop never moves, shrinks to a dot after 4 s of quiet.", mini),
  scr("K11", "K", "Quit confirmation", "Quitting while work runs says what stops and how to resume it; Keep running in tray is the safe choice.", quit),
  scr("K12", "K", "Edge-state board", "Twelve cases: what happened and why, what still works, one primary action.", edge, 2400, 520),
  scr("E17", "E", "Empty-state board", "Library, queue, voices, exports and notifications: icon tile, what appears, one action.", empties, 2160, 560),
];
