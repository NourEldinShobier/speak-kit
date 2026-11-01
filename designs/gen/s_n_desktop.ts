import { B, Ref } from "./lib";
import * as K from "./kit";
import { T, tint } from "./kit";
import * as X from "./kit2";
import { S } from "./types";

const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = 1280, h = 800): S => ({ id, group, title, note, w, h, build });

// ---------------- home (shell) ----------------
const widget = (b: B, t: T, p: Ref, label: string, title: string, sub: string, tone: X.BTone, pct?: number) => {
  const c = K.card(b, t, p, { w: "fill", pad: 14, gap: 6 });
  const h = b.row(c, { w: "fill", justify: "spaceBetween" }); X.caps(b, t, h, label); b.ellipse(h, { w: 7, h: 7, fill: X.toneC(t, tone) });
  b.text(c, title, { size: 13, weight: "Medium", c: t.text, w: "fill", maxLines: 1 }); b.text(c, sub, { size: 12, c: t.text3, w: "fill" });
  if (pct !== undefined) K.progress(b, t, c, pct, { w: 230 });
  return c;
};
export const homeContent = (b: B, t: T, main: Ref, colW = 880, narrow = false) => {
  const c = b.col(main, { w: "fill", h: "fill", pad: [36, 0], align: "center", clip: true });
  const col = b.col(c, { w: colW, gap: 22 });
  const hd = b.col(col, { gap: 4 }); b.text(hd, "Good evening, Maya", { size: 22, weight: "SemiBold", c: t.text }); b.text(hd, "Everything on this page runs on this computer.", { size: 13, c: t.text2 });
  const cp = b.col(col, { w: "fill", pad: 14, gap: 14, r: 14, fill: t.input, stroke: t.control, sw: 1, sa: "inside" });
  b.text(cp, "Paste text, drop a file or type a web address to read it aloud", { size: 14, c: t.text3, w: "fill" });
  const cr = b.row(cp, { w: "fill", justify: "spaceBetween" });
  K.seg(b, t, cr, ["Paste", "Web address", "File"], 0);
  const rr = b.row(cr, { gap: 10 }); K.select(b, t, rr, "Heart · US English", 160); K.iconBtn(b, t, rr, "mic", { size: 32 }); K.iconBtn(b, t, rr, "play", { size: 36, bg: t.accent, c: "#FFFFFF" });
  const wr = b.row(col, { w: "fill", gap: 12 });
  widget(b, t, wr, "READING NOW", "The quiet return of local-first software", "Paragraph 2 of 14 · 9 min left", "ok", 0.14);
  if (!narrow) widget(b, t, wr, "NEXT IN QUEUE", "How small speech models got good", "blog.example.org · 6 min", "info");
  widget(b, t, wr, "ENGINE", "Kokoro-82M · Ready", "Unloads after 5 min idle · 420 MB", "ok");
  const ct = b.col(col, { w: "fill", gap: 4 }); X.caps(b, t, ct, "CONTINUE");
  const list = b.col(ct, { w: "fill", pad: [0, 16], r: 8, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
  [["Attention Is All You Need.pdf", "PDF · page 4 of 15", 0.27], ["Meeting notes: Q4 planning", "Pasted text · 2 min left", 0.6]].forEach(([n, m, v], i) => {
    if (i) K.divider(b, t, list);
    const r = b.row(list, { w: "fill", h: 52, gap: 12 }); const tile = b.frame(r, { w: 32, h: 32, r: 6, fill: t.subtle, layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, "file", 16, t.accent);
    const x = b.col(r, { gap: 2, w: "fill" }); b.text(x, n as string, { size: 13, weight: "Medium", c: t.text }); b.text(x, m as string, { size: 12, c: t.text3 }); K.progress(b, t, r, v as number, { w: 80 }); K.iconBtn(b, t, r, "play", { size: 28 });
  });
};

// ---------------- command palette (Lumen CP1) ----------------
const palette = (b: B, t: T, win: Ref, query: string, groups: { label: string; rows: { ic: string; l: string; d?: string; k?: string; sel?: boolean }[] }[]) => {
  b.rect(win, { abs: true, x: 0, y: 0, w: 1280, h: 800, fill: t.overlay });
  const p = b.col(win, { abs: true, x: 320, y: 120, w: 640, h: 432, r: 10, fill: t.raised, stroke: t.control, sw: 1, sa: "inside", shadow: "dlg", clip: true, gap: 0 });
  const ir = b.row(p, { w: "fill", h: 54, pad: [0, 16], gap: 12 });
  b.icon(ir, "search", 16, t.text3); b.text(ir, query || "Search readings, voices and commands", { size: 16, c: query ? t.text : t.text3, w: "fill" });
  const esc = b.row(ir, { h: 19, pad: [0, 6], r: 4, stroke: t.control, sw: 1, sa: "inside" }); b.text(esc, "Esc", { size: 11, c: t.text3 });
  b.rect(p, { w: "fill", h: 1, fill: t.border });
  const body = b.col(p, { w: "fill", h: "fill", pad: [6, 8], gap: 2, clip: true });
  groups.forEach((g) => {
    const gl = b.row(body, { w: "fill", h: 26, pad: [6, 8, 0, 8] }); X.caps(b, t, gl, g.label);
    g.rows.forEach((r) => {
      const row = b.row(body, { w: "fill", h: r.d ? 44 : 32, pad: [0, 8], gap: 10, r: 6, fill: r.sel ? t.selected : "none" });
      b.icon(row, r.ic, 16, t.text2);
      const x = b.col(row, { gap: 1, w: "fill" }); b.text(x, r.l, { size: 13, c: t.text }); if (r.d) b.text(x, r.d, { size: 12, c: t.text3 });
      if (r.sel) { const e = b.row(row, { h: 19, pad: [0, 6], r: 4, stroke: t.control, sw: 1, sa: "inside" }); b.text(e, "Enter", { size: 11, c: t.text3 }); } else if (r.k) b.text(row, r.k, { size: 11, c: t.text3 });
    });
  });
  b.rect(p, { w: "fill", h: 1, fill: t.border });
  const ft = b.row(p, { w: "fill", h: 36, pad: [0, 16], gap: 16 });
  [["↑↓", "move"], ["Enter", "run"], ["Tab", "filter"]].forEach(([k, l]) => { const r = b.row(ft, { gap: 6 }); K.kbd(b, t, r, [k]); b.text(r, l, { size: 11, c: t.text3 }); });
};

// ---------------- setup window ----------------
const radioRow = (b: B, t: T, p: Ref, on: boolean, ic: string, title: string, desc: string, right?: (f: Ref) => void, tone: X.BTone = "info") => {
  const f = X.iconRow(b, t, p, ic, title, desc, (r) => { const g = b.row(r, { gap: 10 }); if (right) right(g); K.radio(b, t, g, on); }, tone); return f;
};
const dl = (b: B, t: T, p: Ref, name: string, size: string, v: number, state: string, act?: string, done = false) => {
  const r = b.row(p, { w: "fill", h: 62, gap: 12 });
  const tile = b.frame(r, { w: 32, h: 32, r: 6, fill: tint(done ? t.ok : t.accent, 0.14), layout: "horizontal", align: "center", justify: "center" }); b.icon(tile, done ? "check" : "download", 16, done ? t.ok : t.accent);
  const x = b.col(r, { gap: 5, w: "fill" }); const h = b.row(x, { w: "fill", justify: "spaceBetween" }); b.text(h, name, { size: 13, weight: "Medium", c: t.text }); b.text(h, size, { size: 12, c: t.text3 });
  K.progress(b, t, x, v, { w: 540, c: done ? t.ok : t.accent }); b.text(x, state, { size: 12, c: t.text3 });
  if (act) K.btn(b, t, r, act, { v: "secondary", sz: "sm" });
};
export const N1: S[] = [
  scr("W0", "W", "First launch", "Small window, no sidebar: real checks with the port number; the tray icon is already running.", (b, t, root) => {
    X.wallpaper(b, t, root);
    const w = b.col(root, { x: 400, y: 200, w: 480, h: 320, fill: t.bg, r: 8, stroke: t.control, sw: 1, sa: "inside", shadow: "xl", align: "center", justify: "center", gap: 14, clip: true });
    K.logo(b, t, w, 56, { r: 14 }); b.text(w, "Starting SpeakKit", { size: 20, weight: "SemiBold", c: t.text });
    const l = b.col(w, { gap: 8 });
    [["circleCheck", t.ok, "Voice engine ready (port 51730)"], ["circleCheck", t.ok, "Library checked"], ["loader", t.accent, "Looking for the Chrome extension…"]].forEach(([ic, c, s]) => { const r = b.row(l, { gap: 8 }); b.icon(r, ic as string, 16, c as string); b.text(r, s as string, { size: 13, c: t.text }); });
    b.text(w, "First start takes a few seconds. Next time it opens from the tray.", { size: 11, c: t.text3 });
  }),
  scr("W1", "W", "Setup 1 · Welcome", "Setup window 960x680: title bar, 5-step stepper, 720 px column, footer with the only navigation.", (b, t, root) => {
    X.setupWindow(b, t, root, 0, { h1: "Welcome to SpeakKit", sub: "Listen to pages, files and anything you copy. The voice runs on this computer, so nothing you read is uploaded.", back: false, next: "Get started", body: (c) => {
      X.group(b, t, c, "WHAT YOU GET", [
        (f) => X.iconRow(b, t, f, "globe", "Reads any web page in Chrome", "The extension adds a play pill to the page you are on."),
        (f) => X.iconRow(b, t, f, "clipboard", "Reads what you copy", "Press Ctrl Alt C in any app to hear the clipboard.", undefined, "ok"),
        (f) => X.iconRow(b, t, f, "lock", "Works offline, no account", "The first setup downloads the voice once (330 MB).", undefined, "ok")]);
      b.text(c, "Setup takes about 2 minutes. You can change every choice later in Settings.", { size: 12, c: t.text3 });
    } });
  }),
  scr("W2", "W", "Setup 2 · Voice engine (GPU found)", "Detected hardware in words, a recommended default and a clear effect on speed; Chatterbox waits for v1.1.", (b, t, root) => {
    X.setupWindow(b, t, root, 1, { h1: "Choose the voice engine", sub: "Kokoro is fast and sounds natural. It is the only engine in version 1.", body: (c) => {
      X.banner(b, t, c, { tone: "info", title: "Found NVIDIA GeForce RTX 3060 · 8 GB", body: "Kokoro will use it: about 6x faster than real time. You can switch to CPU later." });
      X.group(b, t, c, "ENGINE", [
        (f) => radioRow(b, t, f, true, "cpu", "Kokoro-82M", "82 million parameters, 330 MB on disk, 54 voices in 8 languages.", (g) => K.badge(b, t, g, "Recommended", "ok")),
        (f) => radioRow(b, t, f, false, "mic", "Chatterbox", "Voice cloning from a 10 second recording. Needs a GPU.", (g) => K.badge(b, t, g, "v1.1", "neutral"), "neutral")]);
      X.group(b, t, c, "DEFAULTS", [(f) => X.selectRow(b, t, f, "Voice", "You can change it in the popup at any time.", "Heart · US English", 190), (f) => X.selectRow(b, t, f, "Run on", "GPU is chosen automatically when it fits.", "GPU (auto)", 190)]);
    } });
  }),
  scr("W2b", "W", "Setup 2 · Voice engine (no GPU)", "No GPU: say so plainly, recommend CPU and give the real speed.", (b, t, root) => {
    X.setupWindow(b, t, root, 1, { h1: "Choose the voice engine", sub: "Kokoro is fast and sounds natural. It is the only engine in version 1.", body: (c) => {
      X.banner(b, t, c, { tone: "warn", title: "No supported GPU found", body: "Kokoro runs on the CPU at about 0.4x real time (2.5 s of audio per second). That is fast enough to read while you listen." });
      X.group(b, t, c, "ENGINE", [
        (f) => radioRow(b, t, f, true, "cpu", "Kokoro-82M · CPU", "330 MB on disk, about 420 MB of memory while it is loaded.", (g) => K.badge(b, t, g, "Recommended", "ok")),
        (f) => radioRow(b, t, f, false, "mic", "Chatterbox", "Voice cloning needs a GPU with 6 GB or more.", (g) => K.badge(b, t, g, "Needs GPU", "warn"), "neutral")]);
      X.group(b, t, c, "DEFAULTS", [(f) => X.selectRow(b, t, f, "Voice", undefined, "Heart · US English", 190), (f) => X.selectRow(b, t, f, "Run on", undefined, "CPU", 190)]);
    } });
  }),
  scr("W3", "W", "Setup 3 · Download", "One row per file with size, speed and Pause; Continue stays disabled until everything is on disk.", (b, t, root) => {
    X.setupWindow(b, t, root, 2, { h1: "Downloading the voice engine", sub: "Downloaded once and stored on this computer. After this SpeakKit works offline.", nextDisabled: true, body: (c) => {
      X.group(b, t, c, "ON THIS COMPUTER · 390 MB", [
        (f) => dl(b, t, f, "Kokoro-82M model", "330 MB", 0.62, "204 of 330 MB · 14 MB/s · 9 s left", "Pause"),
        (f) => dl(b, t, f, "Voices (54)", "18 MB", 1, "Done", undefined, true),
        (f) => dl(b, t, f, "Runtime (onnxruntime)", "42 MB", 1, "Done", undefined, true)]);
      const n = b.row(c, { w: "fill", gap: 8 }); b.icon(n, "hardDrive", 14, t.text3); b.text(n, "Stored in D:\\SpeakKit\\models. Change the folder in Settings, Storage and models.", { size: 12, c: t.text3 });
    } });
  }),
  scr("W3b", "W", "Setup 3 · Download paused", "Paused is amber, says where it resumes and offers Resume; losing the connection looks the same.", (b, t, root) => {
    X.setupWindow(b, t, root, 2, { h1: "Downloading the voice engine", sub: "Downloaded once and stored on this computer. After this SpeakKit works offline.", nextDisabled: true, body: (c) => {
      X.banner(b, t, c, { tone: "warn", title: "Download paused at 204 of 330 MB", body: "It continues from here, nothing is downloaded twice.", primary: "Resume", secondary: "Choose another folder" });
      X.group(b, t, c, "ON THIS COMPUTER · 390 MB", [
        (f) => dl(b, t, f, "Kokoro-82M model", "330 MB", 0.62, "Paused", "Resume"),
        (f) => dl(b, t, f, "Voices (54)", "18 MB", 1, "Done", undefined, true),
        (f) => dl(b, t, f, "Runtime (onnxruntime)", "42 MB", 1, "Done", undefined, true)]);
    } });
  }),
  scr("W4", "W", "Setup 4 · Connect browser", "Lumen BR4 pairing: numbered steps left, six-box code right; Skip for now is always available.", (b, t, root) => {
    X.setupWindow(b, t, root, 3, { h1: "Connect Chrome", sub: "The extension reads pages with SpeakKit on this computer. Pairing takes one code and stays on this computer.", left: "You can pair later in Settings, Browser integration.", next: "Continue", body: (c) => {
      const cd = b.row(c, { w: "fill", pad: 20, gap: 24, r: 12, stroke: t.accent, sw: 1, sa: "inside", fill: t.surface, align: "center" });
      const l = b.col(cd, { gap: 12, w: "fill" });
      [["Install SpeakKit for Chrome", "From the Chrome Web Store."], ["Click the SpeakKit icon in Chrome", "Choose Pair this browser."], ["Enter this code", "It is valid for 5 minutes."]].forEach(([a, d], i) => {
        const r = b.row(l, { gap: 10, align: "start" }); const n = b.frame(r, { w: 20, h: 20, r: 999, fill: t.subtle, layout: "horizontal", align: "center", justify: "center" }); b.text(n, String(i + 1), { size: 11, weight: "Medium", c: t.accent });
        const x = b.col(r, { gap: 1 }); b.text(x, a, { size: 13, weight: "Medium", c: t.text }); b.text(x, d, { size: 12, c: t.text3 });
      });
      X.code6(b, t, cd, "7Q4K9X");
      const st = b.row(c, { w: "fill", pad: [0, 4], gap: 8 }); b.icon(st, "loader", 16, t.accent); b.text(st, "Waiting for Chrome…", { size: 13, c: t.text2 });
      X.group(b, t, c, undefined, [(f) => X.iconRow(b, t, f, "external", "Open the Chrome Web Store", "Opens in your default browser.", (r) => K.btn(b, t, r, "Open", { v: "secondary", sz: "sm" }))]);
    } });
  }),
  scr("W5", "W", "Setup 5 · Done", "Ends on the feature, not a summary: hear a sample now; background behavior is two toggles.", (b, t, root) => {
    X.setupWindow(b, t, root, 4, { h1: "You're ready to listen", sub: "Try the voice now, or open any page in Chrome and press the pill.", next: "Finish", body: (c) => {
      const s = b.row(c, { w: "fill", pad: 18, gap: 16, r: 12, fill: t.surface, stroke: t.border, sw: 1, sa: "inside", align: "center" });
      K.iconBtn(b, t, s, "play", { size: 40, bg: t.accent, c: "#FFFFFF" });
      const x = b.col(s, { gap: 4, w: "fill" }); b.text(x, "Hear a sample", { size: 13, weight: "Medium", c: t.text }); b.text(x, "“Small models now run on an ordinary laptop, and nobody asks where the audio came from.”", { size: 12, c: t.text2, w: "fill", lh: 17 });
      K.select(b, t, s, "Heart", 110);
      X.group(b, t, c, "BACKGROUND", [
        (f) => X.toggleRow(b, t, f, "Start SpeakKit when I sign in", "It starts in the tray and uses about 120 MB of memory when idle.", true),
        (f) => X.toggleRow(b, t, f, "Closing the window keeps it in the tray", "The extension keeps working while the window is closed.", true),
        (f) => X.toggleRow(b, t, f, "Unload the voice engine after 5 minutes idle", "Gives back 420 MB; it wakes in about 2 seconds when you press play.", true)]);
    } });
  }),
];

// ---------------- shell ----------------
export const N2: S[] = [
  scr("L1", "L", "Home", "Title bar with centered search and status pill, 248 px sidebar on the window, content on an inset card.", (b, t, root) => {
    const { main } = K.desktopWindow(b, t, root, { nav: "home", pill: { label: "Reading 2 of 14", tone: "ok", icon: "play" }, bell: "dot" });
    homeContent(b, t, main);
  }),
  scr("L2", "L", "Command palette", "Ctrl K opens a 640 px panel: actions, voices, readings and settings in one list, Enter runs the selected row.", (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "home", pill: { label: "Reading 2 of 14", tone: "ok", icon: "play" } });
    homeContent(b, t, main);
    palette(b, t, win, "", [
      { label: "ACTIONS", rows: [{ ic: "clipboard", l: "Read clipboard", k: "Ctrl Alt C", sel: true }, { ic: "pause", l: "Pause", k: "Ctrl Alt Space" }, { ic: "fileExport", l: "Export current reading…" }] },
      { label: "VOICES", rows: [{ ic: "mic", l: "Heart", d: "US English · Quality A · current voice" }, { ic: "mic", l: "Bella", d: "US English · Quality A-" }] },
      { label: "READINGS", rows: [{ ic: "file", l: "Attention Is All You Need.pdf", d: "PDF · page 4 of 15" }] },
      { label: "SETTINGS", rows: [{ ic: "settings", l: "Memory and performance" }] }]);
  }),
  scr("L3", "L", "Command palette (filtered)", "Typing filters every group; settings results name the page and the row they open.", (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "home" });
    homeContent(b, t, main);
    palette(b, t, win, "mem", [
      { label: "SETTINGS", rows: [{ ic: "cpu", l: "Memory and performance", d: "Engine · idle unload, load at startup, battery saver", sel: true }, { ic: "cpu", l: "Unload the engine after", d: "Memory and performance · 5 minutes" }, { ic: "cpu", l: "Load the engine at startup", d: "Memory and performance · Off" }] },
      { label: "ACTIONS", rows: [{ ic: "zzz", l: "Unload the engine now", d: "Frees 420 MB; it wakes on play" }] }]);
  }),
  scr("L4", "L", "Narrow window (rail)", "Below 1280 px the sidebar collapses to a 60 px icon rail; below 641 px it becomes a drawer.", (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "home", w: 1024, h: 768, rail: true, pill: { label: "Kokoro ready", tone: "ok" } });
    homeContent(b, t, main, 600, true);
    X.rulesCard(b, t, win, "Breakpoint rules", ["1280 and up: sidebar 248 + content card, side panels dock right.", "1025 to 1279: 60 px icon rail, panels overlay the content.", "641 to 1024: rail, content column max 600, dialogs stay centered.", "640 and below: drawer from the left edge."], { abs: true, x: 84, y: 536 } as any);
  }, 1024, 768),
];
