import { B, Ref, ICONS } from "./lib";
import * as K from "./kit";
import { T, tint, LIGHT } from "./kit";
import * as X from "./kit2";
import { S } from "./types";

const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = 1280, h = 800): S => ({ id, group, title, note, w, h, build });
const board = (b: B, t: T, root: Ref, title: string, sub: string | undefined, w = 1280, h = 800, gap = 18) => {
  const c = b.col(root, { x: 0, y: 0, w, h, pad: 36, gap, fill: t.bg, clip: true });
  const hd = b.col(c, { gap: 4, w: "fill" }); b.text(hd, title, { size: 22, weight: "SemiBold", c: t.text }); if (sub) b.text(hd, sub, { size: 13, c: t.text2, w: "fill", lh: 19 });
  return c;
};
/** a table inside a card: header row 11 px caps, rows with dividers */
const table = (b: B, t: T, p: Ref, widths: (number | "fill")[], head: string[], rows: string[][], o: { rowH?: number; size?: number } = {}) => {
  const { rowH = 32, size = 12 } = o;
  const card = b.col(p, { w: "fill", pad: [0, 14], gap: 0, r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
  const hr = b.row(card, { w: "fill", h: 30, gap: 12 }); head.forEach((h, i) => b.text(hr, h.toUpperCase(), { size: 10, weight: "SemiBold", c: t.text3, ls: 0.5, w: widths[i] }));
  rows.forEach((r) => { K.divider(b, t, card); const row = b.row(card, { w: "fill", h: rowH, gap: 12 }); r.forEach((c, i) => b.text(row, c, { size, weight: i === 0 ? "Medium" : "Regular", c: i === 0 ? t.text : t.text2, w: widths[i], maxLines: 1 })); });
  return card;
};
const pillV = (b: B, t: T, p: Ref, v1: boolean) => K.badge(b, t, p, v1 ? "v1" : "v1.1", v1 ? "ok" : "neutral");

// ---------------- research ----------------
const featureMap = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Feature map: every feature lives on one surface and carries v1 or v1.1", "Version 1 is the Chrome extension plus the desktop companion that hosts the voice engine. Library, reader, export and cloning wait for v1.1.");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  const cols: [string, string, [string, boolean][]][] = [
    ["Chrome extension", "globe", [["Popup: play, selection, voice, speed", true], ["Read-aloud pill on the page", true], ["Reader view and Reading popover", true], ["Selection bubble, paragraph gutter", true], ["Options, per-site permissions", true], ["Pairing: token and Open Speak Kit link", true], ["Queue side panel", true], ["Edge launcher tab", true]]],
    ["Desktop app", "desktop", [["Setup window, 5 steps", true], ["Home, command palette, status pill", true], ["Tray menu, panel, mini player", true], ["Settings: memory, notifications, updates", true], ["Voices and engines", true], ["Library and reader", false], ["Export audio", false], ["Voice cloning (Chatterbox)", false]]],
    ["Loopback server", "plug", [["127.0.0.1 only, token required", true], ["Streaming audio per sentence", true], ["Events: progress, state", true], ["POST /v1/engine/warm", true], ["Health with idle unload time", true]]],
    ["Voice engine", "cpu", [["Kokoro-82M on this computer", true], ["Unload when idle, wake on play", true], ["Battery saver", true], ["GPU when it fits, CPU otherwise", true], ["Chatterbox cloning", false]]],
  ];
  cols.forEach(([n, ic, items]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 14, gap: 8 }); const h = b.row(k, { gap: 8 }); b.icon(h, ic, 18, t.accent); b.text(h, n, { size: 14, weight: "SemiBold", c: t.text });
    items.forEach(([l, v1], i) => { K.divider(b, t, k); const row = b.row(k, { w: "fill", h: 34, gap: 8, justify: "spaceBetween" }); b.text(row, l, { size: 12, c: t.text, w: "fill" }); pillV(b, t, row, v1); });
  });
};
const surfaces = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Surfaces stay separate: extension, desktop app, loopback server, engine", "Everything talks over 127.0.0.1 with a token; nothing leaves this computer.");
  const r = b.row(c, { w: "fill", gap: 0, align: "center", h: 300 });
  const box = (ic: string, n: string, d: string, tone: X.BTone) => { const k = K.card(b, t, r, { w: 250, pad: 16, gap: 8 }); const tile = b.frame(k, { w: 36, h: 36, r: 8, fill: tint(X.toneC(t, tone), 0.16), layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, ic, 18, X.toneC(t, tone)); b.text(k, n, { size: 14, weight: "SemiBold", c: t.text }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 }); };
  const arrow = (l: string) => { const a = b.col(r, { w: 120, gap: 4, align: "center" }); b.text(a, l, { size: 11, c: t.text3, ta: "center", w: "fill" }); b.rect(a, { w: 90, h: 1, fill: t.text3 }); b.icon(a, "arrowRight", 14, t.text3); };
  box("globe", "Chrome extension", "Reads page text, draws the pill and the reader. Holds a token, no audio engine.", "info"); arrow("HTTP + token\n127.0.0.1");
  box("plug", "Loopback server", "Validates the token, queues sentences, streams audio back as it is made.", "ok"); arrow("in process");
  box("cpu", "Kokoro engine", "Loads on demand, unloads when idle, runs on the GPU or CPU.", "warn");
  const d = b.row(c, { w: "fill", gap: 14, align: "start" });
  X.rulesCard(b, t, d, "Rules", ["The extension never talks to the internet for reading.", "The desktop app owns the window, tray and settings; the server runs inside it.", "If the app is not running the pill says so and offers Open Speak Kit."], { w: 520 });
  X.rulesCard(b, t, d, "Where each surface is drawn", ["Chrome extension page: A, B, C frames", "Desktop app page: W, L, H, I, K, O frames", "Foundations page: Q frames; Motion page: MO frames"], { w: 520 });
};
const flows = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "First read in four steps", "The path from install to sound, with the frame that shows each step.");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  [["1", "Set up", "Setup window: engine, download 390 MB once, done.", "W1  W2  W3  W5"], ["2", "Pair", "Six-character code, or the Open Speak Kit link.", "W4  C13  C14"], ["3", "Play", "Press the pill. If the engine is asleep it wakes in about 2 s and starts reading.", "B4  B22  B23  B6"], ["4", "Adjust", "Reading popover, speed and voice from the pill; memory and shortcuts in Settings.", "B24  B15  H12  H5"]].forEach(([n, ti, d, ids]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 16, gap: 10, h: 230 }); const nb = b.frame(k, { w: 28, h: 28, r: 999, fill: t.cta, layout: "horizontal", align: "center", justify: "center", shadow: "cta" }); b.text(nb, n, { size: 13, weight: "SemiBold", c: "#FFFFFF" });
    b.text(k, ti, { size: 16, weight: "SemiBold", c: t.text }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 }); b.frame(k, { w: 1, h: "fill" }); const ch = b.row(k, { gap: 6, wrap: true }); ids.split("  ").forEach((i) => K.chip(b, t, ch, i));
  });
  const m = b.row(c, { w: "fill", gap: 14, align: "start" });
  X.rulesCard(b, t, m, "Time budget", ["Setup: about 2 minutes, mostly the one-time download.", "First sound after pressing play: under 1 s when loaded, about 3 s when the engine was asleep.", "Every later reading in the same session: under 1 s."], { w: 620 });
  X.rulesCard(b, t, m, "What can go wrong", ["App not running: A9, B9. Not installed: A13. Token rejected: A14, C13.", "Engine problems: K1, K10, O3. Disk or model: K3, K4.", "Browser problems: A11 page not readable, A15 file URLs."], { w: 620 });
};
const lifecycle = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Resource lifecycle: the engine loads on play and unloads when idle", "A loaded model costs about 420 MB. It is never loaded for nothing and never unloaded while it is needed.");
  const r = b.row(c, { w: "fill", gap: 0, align: "center" });
  const st = (n: string, tone: X.BTone, d: string, mem: string) => { const k = K.card(b, t, r, { w: 280, pad: 16, gap: 8 }); const h = b.row(k, { gap: 8 }); K.badge(b, t, h, n, tone === "ok" ? "ok" : tone === "warn" ? "warn" : "neutral"); b.text(h, mem, { size: 12, c: t.text3 }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 }); };
  const ar = (l: string) => { const a = b.col(r, { w: 140, gap: 2, align: "center" }); b.text(a, l, { size: 11, c: t.text3, ta: "center", w: "fill" }); b.icon(a, "arrowRight", 16, t.text3); };
  st("Unloaded", "neutral", "No model in memory. The app, tray and server stay up (about 120 MB).", "0 MB"); ar("play, export or Load now");
  st("Loading", "warn", "Model is read from disk and warmed up. About 2 s on this computer.", "rising"); ar("ready");
  st("Ready", "ok", "Synthesizes at 0.4x real time on the CPU. Reading starts under 1 s.", "420 MB");
  const back = b.row(c, { w: "fill", pad: [8, 16], gap: 10, r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" }); b.icon(back, "undo", 16, t.text2); b.text(back, "Ready returns to Unloaded after 5 minutes without a reading or export (1, 5, 15 minutes or never; 1 minute on battery with Battery saver).", { size: 12, c: t.text2, w: "fill" });
  table(b, t, c, [180, "fill", "fill", "fill"], ["Surface", "Unloaded", "Loading", "Ready"], [
    ["Popup header", "Engine asleep", "Waking engine", "Kokoro ready"], ["Read-aloud pill", "Engine asleep · wakes on play", "Waking the engine · about 2 s", "Paragraph 2 of 14 · 9 min left"], ["Sidebar card", "Kokoro-82M · Asleep", "Kokoro-82M · Loading…", "Kokoro-82M · Ready"], ["Title-bar pill", "Engine asleep (grey)", "Loading engine (amber)", "Kokoro ready (green)"], ["Tray icon", "Dim bars", "Animated bars", "White bars"]], { rowH: 30 });
};
const patterns = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Lumen patterns adopted", "Every Speak Kit surface names the Lumen frame it copies. The Lumen file is the source of truth for layout, components and behavior.");
  table(b, t, c, [200, 180, "fill"], ["Speak Kit surface", "Lumen frame", "What is copied"], [
    ["Read-aloud pill, Reading popover", "F5 (46082)", "White pill 649x52, 40 px play, paragraph text, speed and voice pills; 236 px popover"], ["Desktop shell, Home", "X15 / X16", "Title bar search 420x30, status pill, 248 px sidebar, inset content card"], ["Setup window", "X9 to X14", "960x680, 5-step stepper, 720 px column, footer navigation only"],
    ["Settings", "SD1 to SD9", "Settings nav 248, search in the title bar, 760 px column, caps group labels"], ["Command palette", "CP1", "640x432 panel, grouped results, Enter hint, footer keys"], ["Tray menu and panel", "TR1", "Short native menu, own panel with state icons, rules card"],
    ["Notifications", "NO1", "364 px toasts without buttons, grouped, Do not disturb respected"], ["Updates", "UP1", "Green pill in the title bar, popover, restart card"], ["Quit confirmation", "QT1", "What stops and how to resume"], ["Edge and empty states", "ES1 / EM1", "Banner cases, empty cards with one action"],
    ["Pairing", "BR4", "Outlined card, numbered steps, six boxes"], ["Mini player", "M4", "36 px pill, spring, dot after quiet"], ["Light mode", "LM1 / LM3", "Same layout, only tokens change; 3 to 4 frames per surface"]], { rowH: 36 });
};
const decisions = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Decisions that shape the UI", "Recorded in docs/decisions/0001-stack.md and docs/design-system.md.");
  const g = b.row(c, { w: "fill", gap: 14, wrap: true, align: "start" });
  [["lock", "Local only", "No account, no cloud voice. The UI never shows a sign-in and says 'on device' wherever sound is made."], ["package", "Packages first", "Radix for primitives, valibot for validation, electron-log and electron-store for the desktop. Nothing is built from scratch if a maintained package does the job."], ["sun", "Light only", "One light theme, the Lockix look: no dark mode. Pages that are dark are the website, not Speak Kit."], ["zap", "Performance", "Models load on demand and unload when idle; the UI shows the state in words."], ["eye", "Calm status", "Color only for state. One primary action per banner. Toasts only for background work."], ["book", "Lumen is the source", "Components, spacing, type (Inter 11 to 22) and motion tokens come from the Lumen file."]].forEach(([ic, ti, d]) => {
    const k = K.card(b, t, g, { w: 380, pad: 16, gap: 8, h: 150 }); const h = b.row(k, { gap: 8 }); b.icon(h, ic === "package" ? "box" : ic, 18, t.accent); b.text(h, ti, { size: 14, weight: "SemiBold", c: t.text }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 });
  });
};

const perTab = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Per-tab behavior: one audio output, everything else belongs to its tab", "Closing the pill in a tab touches that tab only. It lasts until the page reloads; Hide on this site is the saved version of the same choice.");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  const col = (ic: string, ti: string, sub: string, rows: string[][]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 16, gap: 10 }); const h = b.row(k, { gap: 8 }); b.icon(h, ic, 18, t.accent); b.text(h, ti, { size: 14, weight: "SemiBold", c: t.text });
    b.text(k, sub, { size: 12, c: t.text2, w: "fill", lh: 17 });
    table(b, t, k, [150, "fill"], ["Thing", "Rule"], rows, { rowH: 40 });
  };
  col("volume", "Shared by the whole browser", "There is one speaker, so there is one reading at a time.", [
    ["Audio output", "Starting a reading in another tab stops the one that is playing."],
    ["Voice and speed", "Chosen once in the popup or Options; every tab uses them."],
    ["Queue", "One queue in the side panel; items remember their tab."],
    ["Pairing and engine", "One connection to the app; the engine wakes on the first play."],
  ]);
  col("browser", "Owned by each tab", "Another tab never changes what this tab shows.", [
    ["Pill and edge tab", "Each tab has its own; Close for this tab removes them there only."],
    ["Highlight and position", "Band, word marker and tint stay in the reading tab."],
    ["Selection bubble, gutter", "Appear on the tab you are using; never on a background tab."],
    ["Reader view", "Opens in the tab you chose; closing it leaves other tabs alone."],
    ["Close for this tab", "Stops reading and hides the pill; a reload restores it."],
    ["Popup", "Shows the active tab's state, incl. Hidden in this tab."],
  ]);
};

// ---------------- foundations ----------------
const tokens = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Tokens: color, type, radius, elevation", "Lockix light values (docs/lockix-design-system.md). One theme, no dark mode.");
  const r = b.row(c, { w: "fill", gap: 24, align: "start" });
  [LIGHT].forEach((m) => {
    const k = K.card(b, t, r, { w: "fill", pad: 16, gap: 10 }); X.caps(b, t, k, "LIGHT · LOCKIX");
    const g = b.row(k, { w: "fill", gap: 8, wrap: true, align: "start" });
    ([["window", m.bg], ["card", m.surface], ["editor", m.editor], ["raised", m.raised], ["input", m.input], ["divider", m.border], ["text", m.text], ["text 2", m.text2], ["text 3", m.text3], ["cta", m.cta], ["accent", m.accent], ["tray", m.tray], ["well", m.well], ["field", m.field], ["control", m.control], ["green", m.ok], ["orange", m.warn], ["red", m.err], ["info", m.info]] as [string, string][]).forEach(([n, hx]) => {
      const q = b.col(g, { w: 100, gap: 4 }); b.frame(q, { w: "fill", h: 32, r: 6, fill: hx, stroke: t.control, sw: 1, sa: "inside" }); b.text(q, n, { size: 11, weight: "Medium", c: t.text }); b.text(q, hx, { size: 10, c: t.text3 });
    });
  });
  const r2 = b.row(c, { w: "fill", gap: 24, align: "start" });
  const ty = K.card(b, t, r2, { w: "fill", pad: 16, gap: 8 }); X.caps(b, t, ty, "TYPE · INTER");
  [[22, "SemiBold", "Page title 22"], [20, "SemiBold", "Setup title 20"], [16, "SemiBold", "Dialog title 16"], [13, "Medium", "Body and rows 13"], [12, "Regular", "Secondary and descriptions 12"], [11, "SemiBold", "CAPS LABELS 11"]].forEach(([s, w, l]) => b.text(ty, l as string, { size: s as number, weight: w as string, c: t.text }));
  const ra = K.card(b, t, r2, { w: "fill", pad: 16, gap: 10 }); X.caps(b, t, ra, "RADIUS"); const rr = b.row(ra, { gap: 10 }); [4, 6, 8, 10, 12, 14, 16, 999].forEach((v) => { const q = b.col(rr, { gap: 4, align: "center" }); b.frame(q, { w: 40, h: 40, r: v, stroke: t.text2, sw: 1, sa: "inside" }); b.text(q, v === 999 ? "pill" : String(v), { size: 11, c: t.text3 }); });
  const el = K.card(b, t, r2, { w: "fill", pad: 16, gap: 10 }); X.caps(b, t, el, "ELEVATION"); const er = b.row(el, { gap: 18 }); (["md", "card", "lg", "dlg"] as const).forEach((s, i) => { const q = b.col(er, { gap: 6, align: "center" }); b.frame(q, { w: 70, h: 50, r: 10, fill: t.raised, stroke: s === "md" ? t.control : undefined, sw: 1, sa: "inside", shadow: s }); b.text(q, ["menu 0 1 2", "card 0 0 4", "popover ring 0 2 6", "dialog ring 0 4 12"][i], { size: 11, c: t.text3 }); });
};
const iconSet = (b: B, t: T, root: Ref) => {
  const names = Object.keys(ICONS);
  const c = board(b, t, root, `Icons: Tabler outline, 1.5 px stroke at every size (${names.length} used)`, "Boxes are 12, 14, 16, 18, 20 and 24 px. The stroke does not scale.");
  const g = b.row(c, { w: "fill", gap: 6, wrap: true, align: "start" });
  names.forEach((n) => { const q = b.col(g, { w: 80, h: 52, gap: 4, align: "center", justify: "center", r: 8, stroke: t.border, sw: 1, sa: "inside" }); b.icon(q, n, 18, t.text); b.text(q, n, { size: 9, c: t.text3, ta: "center", w: "fill" }); });
};
const components = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Components and states", "Buttons, inputs and selection controls drawn from the Lumen component specs; hover, pressed, focus, disabled and loading shown side by side.", 1280, 800, 14);
  const lab = (p: Ref, s: string) => X.caps(b, t, p, s);
  const bs = b.col(c, { gap: 6 }); lab(bs, "BUTTONS · PRIMARY, SECONDARY, GHOST, DANGER");
  (["primary", "secondary", "ghost", "danger"] as const).forEach((v) => { const r = b.row(bs, { gap: 10 }); (["rest", "hover", "pressed", "focus", "disabled", "loading"] as const).forEach((s) => K.btn(b, t, r, s === "rest" ? "Label" : s, { v, state: s === "disabled" ? undefined : s, disabled: s === "disabled", icon: s === "rest" ? "play" : undefined })); });
  const r2 = b.row(c, { w: "fill", gap: 28, align: "start" });
  const a = b.col(r2, { gap: 8, w: 360 }); lab(a, "INPUTS"); (["default", "hover", "focus", "error", "disabled"] as const).forEach((s) => K.input(b, t, a, { value: s === "error" ? "spk_wrong" : undefined, placeholder: s, state: s, icon: "search", w: 360, msg: s === "error" ? "This token doesn't match the app." : undefined }));
  const m = b.col(r2, { gap: 10, w: 320 }); lab(m, "SELECTION"); const sr = b.row(m, { gap: 12 }); K.toggle(b, t, sr, true); K.toggle(b, t, sr, false); K.checkbox(b, t, sr, true); K.checkbox(b, t, sr, false); K.checkbox(b, t, sr, "mixed"); K.radio(b, t, sr, true); K.radio(b, t, sr, false);
  K.seg(b, t, m, ["Paste", "Web address", "File"], 0); K.tabs(b, t, m, ["General", "Voice", "Sites"], 0); K.select(b, t, m, "Heart · US English", 200); K.slider(b, t, m, 0.45, 220, { label: "1.2×", min: "0.5×", max: "3×" }); K.progress(b, t, m, 0.6, { w: 220 });
  const q = b.col(r2, { gap: 10, w: "fill" }); lab(q, "TAGS, KEYS, MENU, TOAST");
  const tr = b.row(q, { gap: 8, wrap: true, w: "fill" }); (["ok", "warn", "err", "info", "neutral"] as const).forEach((k) => K.badge(b, t, tr, k === "neutral" ? "Unloaded" : k === "ok" ? "Ready" : k === "warn" ? "Loading" : k === "err" ? "Crashed" : "Update", k)); K.chip(b, t, tr, "Chip"); K.chip(b, t, tr, "Active", true, "check"); K.kbd(b, t, tr, ["Ctrl", "K"]);
  const mn = K.menu(b, t, q, { w: 220 }); K.menuItem(b, t, mn, "Read clipboard", { icon: "clipboard", shortcut: "Ctrl Alt C" }); K.menuItem(b, t, mn, "Pause", { icon: "pause", hover: true }); K.menuItem(b, t, mn, "Delete reading", { icon: "trash", destructive: true });
  K.toast(b, t, q, "Added to queue · 2 items", "ok", { action: "View queue" }); K.tooltip(b, t, q, "Read from here", "Enter");
};
const deskComponents = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Desktop components", "Settings rows, banners, stepper, status pills, storage bar, pairing code, Windows toast.", 1280, 800, 14);
  const r = b.row(c, { w: "fill", gap: 24, align: "start" });
  const a = b.col(r, { w: 560, gap: 12 });
  X.stepper(b, t, a, 2);
  (["info", "warn", "err"] as const).forEach((k) => X.banner(b, t, a, { tone: k, title: k === "info" ? "Found NVIDIA GeForce RTX 3060 · 8 GB" : k === "warn" ? "Download paused at 204 of 330 MB" : "Speak Kit's engine stopped", body: "What happened, what still works.", primary: "Primary", secondary: "Secondary" }));
  X.group(b, t, a, "SETTING ROWS", [(f) => X.toggleRow(b, t, f, "Toggle row", "Description in 12 px secondary.", true), (f) => X.selectRow(b, t, f, "Select row", undefined, "5 minutes", 130), (f) => K.settingRow(b, t, f, "Segmented row", undefined, (g) => K.seg(b, t, g, ["1", "5", "15", "Never"], 1))]);
  const m = b.col(r, { w: "fill", gap: 12 });
  X.caps(b, t, m, "STATUS PILLS"); const pr = b.row(m, { gap: 8 }); (["ok", "warn", "err", "neutral"] as const).forEach((k) => K.badge(b, t, pr, ["Kokoro ready", "Loading engine", "Engine error", "Engine asleep"][["ok", "warn", "err", "neutral"].indexOf(k)], k));
  X.caps(b, t, m, "STORAGE BAR"); const sg = b.row(m, { w: 420, h: 12, gap: 0, r: 6, clip: true }); [[t.accent, 110], [t.info, 240], [t.ok, 20], [t.selected, 50]].forEach(([cl, w]) => b.rect(sg, { w: w as number, h: 12, fill: cl as string }));
  const lg = b.row(m, { gap: 14 }); [["Models", t.accent], ["Audio cache", t.info], ["Library", t.ok], ["Free", t.text3]].forEach(([n, cl]) => { const q = b.row(lg, { gap: 5 }); b.frame(q, { w: 8, h: 8, r: 2, fill: cl as string }); b.text(q, n as string, { size: 11, c: t.text2 }); });
  X.caps(b, t, m, "PAIRING CODE"); X.code6(b, t, m, "7Q4K9X");
  X.caps(b, t, m, "WINDOWS TOAST"); X.winToast(b, t, m, { title: "Export done", body: "MP3 · 4.2 MB. Saved to Documents.", hint: "Click to show the file", tone: "ok" });
  X.caps(b, t, m, "TRAY ICON STATES"); const tr = b.row(m, { gap: 10 }); (["normal", "working", "needs", "paused", "asleep"] as const).forEach((s) => X.trayIcon(b, t, tr, s, 36));
};
const extComponents = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Extension components", "The read-aloud pill in every state, the Reading popover and the selection bubble. All surfaces are white with the popover shadow.", 1280, 800, 12);
  const r = b.row(c, { w: "fill", gap: 24, align: "start" });
  const a = b.col(r, { gap: 8 });
  (["idle", "loading", "playing", "paused", "done", "unloaded", "waking", "error"] as const).forEach((s) => { const x = b.row(a, { gap: 10, align: "center" }); b.text(x, s, { size: 11, c: t.text3, w: 60 }); K.dock(b, t, x, s); });
  const m = b.col(r, { gap: 14, w: "fill" });
  X.caps(b, t, m, "READING POPOVER"); K.readingPopover(b, t, m, {});
  X.caps(b, t, m, "SELECTION BUBBLE"); const bb = b.row(m, { h: 44, pad: [0, 4], gap: 4, r: 12, fill: t.raised, shadow: "lg" }); K.btn(b, t, bb, "Listen", { v: "primary", icon: "play" }); K.iconBtn(b, t, bb, "sliders", { size: 32, c: t.text2 }); K.iconBtn(b, t, bb, "copy", { size: 32, c: t.text2 });
};

// ---------------- motion ----------------
const motionTokens = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Motion tokens", "Enter fast and settle, leave faster than you arrived. Distances 4 to 12 px; nothing animates longer than 333 ms except loops tied to live work.");
  const r = b.row(c, { w: "fill", gap: 24, align: "start" });
  const l = b.col(r, { w: "fill", gap: 0 });
  table(b, t, l, [120, 60, "fill"], ["Token", "Time", "Easing and use"], [
    ["instant", "83 ms", "Hover fills, pressed, text crossfade"], ["fast", "167 ms", "Decelerate (0,0,0,1): menus, popovers, chips, segmented thumb"], ["normal", "250 ms", "Decelerate: panels, sheets, toasts, expanding sections"], ["slow", "333 ms", "Point to point (0.55,0.55,0,1): docking, progress bars, auto-scroll"],
    ["exit", "120 ms", "Accelerate (0.3,0,1,1): everything that leaves"], ["spring", "420 / 34", "Stiffness 420, damping 34: mini player pill, sheets"], ["loop-breathe", "1600 ms", "Ease in out, infinite: live dots, waking bar"], ["loop-spin", "800 ms", "Linear: spinners, tray bars"], ["shimmer", "1200 ms", "Linear: skeletons"], ["stagger", "40 ms", "Per item, at most 6"]], { rowH: 34 });
  const rt = b.col(r, { w: 360, gap: 12 });
  ([["Decelerate", 0, 0, 0, 1], ["Point to point", 0.55, 0.55, 0, 1], ["Accelerate", 0.3, 0, 1, 1]] as [string, number, number, number, number][]).forEach(([n, x1, y1, x2, y2]) => {
    const k = K.card(b, t, rt, { w: "fill", pad: 12, gap: 6 }); const row = b.row(k, { gap: 12 }); const box = b.frame(row, { w: 100, h: 100, r: 6, stroke: t.border, sw: 1, sa: "inside" });
    b.add("node.create", { type: "vector", path: `M0 100 C ${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`, x: 0, y: 0, width: 100, height: 100, parent: box, props: { fill: "none", stroke: t.accent, strokeWeight: 2, strokeCap: "round" } });
    const x = b.col(row, { gap: 2 }); b.text(x, n, { size: 13, weight: "Medium", c: t.text }); b.text(x, `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`, { size: 11, c: t.text3 });
  });
  const dr = K.card(b, t, c, { w: "fill", pad: 14, gap: 8 }); X.caps(b, t, dr, "DURATIONS TO SCALE (1 px = 2 ms)");
  [["instant", 83], ["exit", 120], ["fast", 167], ["normal", 250], ["slow", 333]].forEach(([n, v]) => { const x = b.row(dr, { gap: 10 }); b.text(x, n as string, { size: 11, c: t.text3, w: 60 }); b.rect(x, { w: (v as number) / 2, h: 8, r: 4, fill: t.accent }); b.text(x, `${v} ms`, { size: 11, c: t.text2 }); });
};
const motionRules = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Per-element motion rules", undefined, 1280, 800, 10);
  const rows = [
    ["Pill appears", "First use on a page", "Fade + rise 8 px", "167 decelerate", "Fade only, 83"], ["Pill play button", "Engine waking", "Spinner turns", "loop-spin 800", "Static icon"], ["Pill progress bar", "Playing", "Width follows time", "333 point to point", "No tween"],
    ["Popovers (speed, voice, Reading)", "Click", "Scale .96 to 1 + fade", "167 decel, exit 120", "Fade, 83"], ["Sentence highlight", "Next sentence", "Fill crossfade", "167", "Instant"], ["Word marker", "Next word", "Snap", "none", "Snap"], ["Page auto-scroll", "Sentence leaves view", "Smooth scroll", "333 point to point", "Jump"],
    ["Selection bubble", "Selection ends", "Scale .96 to 1, rise 4 px", "167", "Fade, 83"], ["Toast", "Background event", "Slide 16 px + fade; hides after 6 s", "250 decel, exit 120", "Fade, 83"], ["Segmented thumb, toggle", "Change", "Thumb slides", "167", "Instant"], ["Command palette", "Ctrl K", "Scrim fade, panel scale .96 to 1 + rise 8 px", "167, exit 120", "Fade, 83"],
    ["Update popover", "Click the pill", "Same as popovers", "167", "Fade, 83"], ["Setup step change", "Continue", "Content slides 24 px + fade; circle fills", "250 / 167", "Fade only"], ["Engine waking bar", "Play on unloaded", "Segment travels", "loop-breathe 1600", "Static bar"], ["Tray icon working", "Reading or export", "Bars animate", "loop-spin 800", "One steady frame"],
    ["Mini player pill", "Play, 4 s quiet", "Grows, shrinks to dot, fades to 55%", "spring 420 / 34", "Fade, 83"], ["Dialog (quit, export)", "Open", "Scale .96 to 1 + fade", "167, exit 120", "Fade, 83"], ["Banner", "Appears", "Fade + 4 px slide", "250", "Fade, 83"]];
  table(b, t, c, [200, 150, "fill", 160, 120], ["Element", "Trigger", "Animation", "Time and easing", "Reduce motion"], rows, { rowH: 29, size: 11 });
};
const reduce = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Reduce motion and other motion rules", "Everything respects the Windows and Chrome setting.");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  X.rulesCard(b, t, r, "Reduce motion", ["Fades only, 83 ms. No slides, scale or spring.", "Loops stop: spinner becomes a static icon, waking bar becomes a static half bar.", "Highlight and scroll jump instead of animating.", "Mini player: one steady dot row instead of the level meter."], { w: 600 });
  X.rulesCard(b, t, r, "Principles", ["Enter fast and settle, leave faster than you arrived (exit 120 ms).", "Distances 4 to 12 px; nothing longer than 333 ms except loops.", "Motion explains state: waking is a loop, reading is progress, done is a stop.", "No motion on hover except fill (83 ms)."], { w: 600 });
  const st = K.card(b, t, c, { w: "fill", pad: 14, gap: 10 }); X.caps(b, t, st, "STAGGER · 40 ms PER ITEM, AT MOST 6");
  const row = b.row(st, { gap: 8 }); for (let i = 0; i < 6; i++) b.frame(row, { w: 90, h: 32, r: 6, fill: t.selected, opacity: 1 - i * 0.12 });
};

export const N5: S[] = [
  scr("R1", "R", "Feature map", "Each feature sits on one surface and is marked v1 or v1.1.", featureMap),
  scr("R2", "R", "Surfaces", "Extension, loopback server and engine are separate; everything is local.", surfaces),
  scr("R3", "R", "First read in four steps", "Set up, pair, play and adjust, each with the frames that draw it.", flows),
  scr("R4", "R", "Resource lifecycle", "Unloaded, Loading, Ready with the same words on every surface.", lifecycle),
  scr("R5", "R", "Lumen patterns adopted", "Each Speak Kit surface names the Lumen frame it copies.", patterns),
  scr("R7", "R", "Per-tab behavior", "One audio output, everything else per tab; Close for this tab lasts until the page reloads.", perTab),
  scr("R6", "R", "Decisions that shape the UI", "Local only, packages first, light only, performance, calm status.", decisions),
  scr("Q1", "Q", "Tokens", "Color, type, radius and elevation, light only (Lockix).", tokens),
  scr("Q2", "Q", "Icon set", "Tabler outline icons at a constant 1.5 px stroke.", iconSet, 1280, 800),
  scr("Q3", "Q", "Components and states", "Buttons, inputs, selection controls, menus, tags and toasts in every state.", components),
  scr("Q4", "Q", "Desktop components", "Stepper, banners, rows, pills, storage bar, pairing code, toast, tray icons.", deskComponents),
  scr("Q5", "Q", "Extension components", "The read-aloud pill in eight states, the Reading popover and the selection bubble.", extComponents),
  scr("MO1", "MO", "Motion tokens", "83, 167, 250, 333 and 120 ms with easing, spring 420 / 34 and loops.", motionTokens),
  scr("MO2", "MO", "Per-element rules", "Trigger, animation, time, easing and reduce-motion fallback for 18 elements.", motionRules),
  scr("MO3", "MO", "Reduce motion and principles", "Fades only under reduce motion; loops stop; nothing longer than 333 ms.", reduce),
];
