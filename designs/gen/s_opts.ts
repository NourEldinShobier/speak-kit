import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import { kb, stat, voiceList } from "./s_ext";

type Sec = "general" | "voice" | "highlight" | "shortcuts" | "sites" | "general-error" | "general-pair" | "launcher";
const NAV: [string, string, string][] = [["general", "General", "sliders"], ["launcher", "Edge launcher", "sidebarRight"], ["voice", "Voice and speed", "mic"], ["highlight", "Highlighting", "type"], ["shortcuts", "Shortcuts", "keyboard"], ["sites", "Sites and filters", "globe"]];
const SITE = "reader.example.com";

const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(1); };
const errTx = (t: T) => (t.mode === "dark" ? t.err : "#A3281D");

const section = (b: B, t: T, p: Ref, title: string, desc?: string) => {
  const c = K.card(b, t, p, { w: "fill", pad: [18, 20], gap: 0 });
  b.text(c, title, { size: 15, weight: "Bold", c: t.text }); if (desc) b.text(c, desc, { size: 12.5, c: t.text2, w: "fill", lh: 18 });
  return c;
};
const rsel = (b: B, t: T, p: Ref, value: string, w: number, avatar?: string) => {
  const f = b.row(p, { w, h: 36, pad: [0, 12], gap: 8, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside", justify: "spaceBetween" });
  const l = b.row(f, { gap: 8 });
  if (avatar) K.avatar(b, t, l, avatar, 22, 0);
  b.text(l, value, { size: 13, c: t.text }); b.icon(f, "down", 14, t.text3);
  return f;
};
const radio = (b: B, t: T, p: Ref, on: boolean, disabled = false) => K.radio(b, t, p, on, { disabled });
const grid2 = (b: B, t: T, card: Ref, items: [string, string | undefined, boolean][]) => {
  for (let i = 0; i < items.length; i += 2) {
    if (i) K.divider(b, t, card);
    const r = b.row(card, { w: "fill", gap: 48, align: "start" });
    [items[i], items[i + 1]].forEach((it) => { const cell = b.col(r, { w: "fill", gap: 0 }); if (it) K.settingRow(b, t, cell, it[0], it[1], (f) => K.toggle(b, t, f, it[2])); });
  }
};
const swatch = (b: B, t: T, p: Ref, hex: string | null, name: string, sel: boolean) => {
  const col = b.col(p, { gap: 6, align: "center" });
  const o = b.frame(col, { w: 40, h: 40, r: 20, layout: "horizontal", align: "center", justify: "center", stroke: sel ? t.text : undefined, sw: 2, sa: "inside" });
  const e = b.frame(o, { w: 30, h: 30, r: 15, fill: hex ?? t.surface, stroke: t.border, sw: 1, layout: "horizontal", align: "center", justify: "center" });
  if (sel) b.icon(e, "check", 14, "#1E1F20"); if (!hex) b.icon(e, "plus", 14, t.text2);
  b.text(col, name, { size: 12, c: sel ? t.text : t.text2, weight: sel ? "SemiBold" : "Regular" });
};
const link = (b: B, t: T, p: Ref, label: string, icon?: string) => { const r = b.row(p, { h: 32, pad: [0, 4], gap: 6 }); b.text(r, label, { size: 13, weight: "Medium", c: t.accent }); if (icon) b.icon(r, icon, 14, t.accent); return r; };

const opts = (id: string, title: string, note: string, sec: Sec, dark = false): S => ({
  id, group: "C", title, note, w: 1280, h: 800, dark,
  build: (b, t0, root) => {
    const t: T = dark ? { ...t0, hlSent: "#78621F" } : t0;
    const c = K.browser(b, t, root, { url: "chrome-extension://speakkit/options.html", title: "SpeakKit options", ext: true });
    b.rect(c, { x: 0, y: 0, w: 1280, h: 720, fill: t.bg });
    const nav = b.col(c, { x: 0, y: 0, w: 248, h: 720, pad: [24, 12], gap: 2, fill: t.bg });
    const lg = b.row(nav, { gap: 8, pad: [0, 8, 14, 8] }); K.logo(b, t, lg, 26); b.text(lg, "SpeakKit", { size: 16, weight: "Bold", c: t.text });
    NAV.forEach(([k, l, ic]) => { K.navItem(b, t, nav, l, ic, { selected: sec.startsWith(k) }); });
    b.frame(nav, { w: "fill", h: "fill" });
    const sv = b.row(nav, { gap: 6, pad: [0, 8] }); b.icon(sv, "circleCheck", 14, t.ok); b.text(sv, "Changes save automatically", { size: 12, c: t.text2 });
    b.text(nav, "SpeakKit extension 0.4.2", { size: 12, c: t.text3 });
    const m = b.col(c, { x: 240, y: 0, w: 1040, h: 720, pad: [28, 48], gap: 16 });
    const head = (s: string, d: string, reset?: string, saved = false) => {
      const h = b.row(m, { w: "fill", justify: "spaceBetween", align: "end" });
      const l = b.col(h, { gap: 4 }); b.text(l, s, { size: 26, weight: "Bold", c: t.text }); b.text(l, d, { size: 13.5, c: t.text2 });
      if (reset) { const rr = b.row(h, { gap: 16 }); if (saved) { const sv2 = b.row(rr, { gap: 6 }); b.icon(sv2, "circleCheck", 14, t.ok); b.text(sv2, "Saved", { size: 12.5, weight: "SemiBold", c: t.ok === "#1A7F4B" ? "#12664A" : t.ok }); } link(b, t, rr, reset, "refresh"); }
    };
    if (sec.startsWith("general")) {
      const bad = sec !== "general"; const pair = sec === "general-pair";
      head("General", "How the extension talks to the SpeakKit desktop app and where it shows up.");
      const cn = section(b, t, m, "Desktop app connection");
      const st = b.row(cn, { w: "fill", pad: [14, 0, 12, 0], gap: 14, justify: "spaceBetween" });
      const l = b.row(st, { gap: 12 });
      const ic = b.frame(l, { w: 40, h: 40, r: 20, fill: bad ? t.errSoft : t.okSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, bad ? "x" : "check", 20, bad ? t.err : t.ok); if (bad) { /* x keeps the status icon distinct from the toast triangle */ }
      const tx = b.col(l, { gap: 2 });
      b.text(tx, !bad ? "Connected to SpeakKit 0.4.2" : pair ? "Pairing token rejected" : "SpeakKit isn't running", { size: 14.5, weight: "SemiBold", c: t.text });
      b.text(tx, !bad ? "Kokoro-82M is ready · answered in 38 ms" : pair ? "This browser's token doesn't match the app." : "Nothing is answering on this computer.", { size: 12.5, c: t.text2 });
      const r = b.row(st, { gap: 8 });
      if (!bad) { K.btn(b, t, r, "Test connection", { v: "secondary", icon: "refresh" }); K.btn(b, t, r, "Re-pair", { v: "secondary", icon: "link" }); }
      else if (pair) { K.btn(b, t, r, "Test connection", { v: "ghost", icon: "refresh" }); K.btn(b, t, r, "Re-pair", { v: "secondary", icon: "link" }); K.btn(b, t, r, "Paste new token", { v: "primary", icon: "clipboard" }); }
      else { K.btn(b, t, r, "Test connection", { v: "ghost", icon: "refresh" }); K.btn(b, t, r, "Download app", { v: "secondary", icon: "download" }); K.btn(b, t, r, "Open SpeakKit", { v: "primary", icon: "external" }); }
      if (bad) {
        const e = b.col(cn, { w: "fill", pad: [12, 14], gap: 6, r: 10, fill: t.errSoft });
        const e1 = b.row(e, { w: "fill", gap: 10, align: "start" }); b.icon(e1, "alert", 16, t.err);
        b.text(e1, pair ? "SpeakKit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch." : "Open SpeakKit and this page reconnects by itself. If it doesn't, download the app first.", { size: 12.5, c: errTx(t), w: "fill", lh: 18 });
        const d = b.row(e, { gap: 4, pad: [0, 0, 0, 26] }); b.text(d, "Details", { size: 12, weight: "SemiBold", c: errTx(t) }); b.icon(d, "down", 12, errTx(t));
      }
      b.frame(cn, { w: 1, h: 12 });
      K.divider(b, t, cn);
      const fr = b.row(cn, { w: "fill", gap: 48, pad: [14, 0, 0, 0], align: "start" });
      const f1 = b.col(fr, { w: "fill", gap: 4 }); b.text(f1, "Port", { size: 13.5, weight: "Medium", c: t.text }); b.text(f1, "Must match the desktop app. Loopback only; nothing leaves your computer.", { size: 12, c: t.text2, w: "fill", lh: 17 }); K.input(b, t, f1, { value: "51730", w: 120, h: 36 });
      const f2 = b.col(fr, { w: "fill", gap: 4 }); b.text(f2, "Pairing token", { size: 13.5, weight: "Medium", c: t.text }); b.text(f2, "Sent with every request so other websites can't use your voice engine.", { size: 12, c: t.text2, w: "fill", lh: 17 });
      K.input(b, t, f2, pair ? { placeholder: "Paste the new token here", state: "error", w: 300, h: 36, icon: "clipboard" } : { value: "sk_local_••••••••c42e", w: 300, h: 36 });
      if (pair) { const e = b.row(f2, { gap: 6, w: "fill", align: "start" }); b.icon(e, "alert", 13, errTx(t)); b.text(e, "Token rejected. Copy a new one from SpeakKit > Settings > Browser integration.", { size: 12, c: errTx(t), w: "fill", lh: 17 }); }
      const sh = section(b, t, m, "Where it appears");
      grid2(b, t, sh, [["Selection bubble", "Show Listen when you select text.", true], ["Read-aloud pill", "The read-aloud pill at the bottom of the page while reading.", true], ["Edge launcher", "A tab at the page edge. Hover to open, click Listen.", true], ["Paragraph play button", "A play button in the margin when you hover a paragraph.", true], ["Auto-scroll while reading", "Keep the current sentence in view.", true], ["Right-click menu entries", "Read selection, read from here, add to queue.", true]]);
    } else if (sec === "launcher") {
      head("Edge launcher", "A small tab at the edge of the page. Hover to open it, then click Play to start reading.", "Reset section");
      const l1 = section(b, t, m, "Launcher");
      K.settingRow(b, t, l1, "Show the edge launcher", "Works on every page, including pages where the pill is hidden.", (f) => K.toggle(b, t, f, true));
      K.divider(b, t, l1);
      K.settingRow(b, t, l1, "Side of the page", "Drag the tab up or down on any page to move it. Saved per site.", (f) => K.seg(b, t, f, ["Left", "Right"], 1));
      K.divider(b, t, l1);
      K.settingRow(b, t, l1, "When idle", "Peek keeps a thin 14 px tab at the edge; Hidden shows nothing until you move the pointer there.", (f) => K.seg(b, t, f, ["Peek", "Hidden", "Always open"], 0));
      K.divider(b, t, l1);
      K.settingRow(b, t, l1, "Open on", "Hover opens after 150 ms. Click suits touch screens and trackpads.", (f) => K.seg(b, t, f, ["Hover", "Click"], 0));
      K.divider(b, t, l1);
      K.settingRow(b, t, l1, "Close after the pointer leaves", "1.5 s. Longer gives more time to reach the buttons.", (f) => K.slider(b, t, f, (1.5 - 0.5) / 4.5, 240, { label: "1.5 s", min: "0.5 s", max: "5 s" }));
      K.divider(b, t, l1);
      K.settingRow(b, t, l1, "Keep a wider tab while reading", "Shows pause and a thin progress line without opening the card.", (f) => K.toggle(b, t, f, true));
    } else if (sec === "voice") {
      head("Voice and speed", "Defaults for every page. You can still change them from the popup.", "Reset section", true);
      const e = section(b, t, m, "Engine");
      const r = b.row(e, { w: "fill", gap: 12, pad: [12, 0, 0, 0], align: "stretch" });
      [["Kokoro-82M", "Fast, runs on any computer. 28 voices.", true], ["Chatterbox", "Expressive voices and voice cloning. Needs an NVIDIA GPU.", false]].forEach(([n, d, a]) => {
        const x = b.col(r, { w: "fill", h: 124, pad: 16, gap: 8, r: 12, fill: a ? t.accentSoft : t.surface, stroke: a ? t.accent : t.border, sw: a ? 2 : 1, sa: "inside" });
        const h = b.row(x, { w: "fill", justify: "spaceBetween" }); const hl = b.row(h, { gap: 10 }); radio(b, t, hl, a as boolean, !a); b.text(hl, n as string, { size: 14, weight: "Bold", c: t.text }); stat(b, t, h, a ? "Installed" : "Not installed", a ? "ok" : "neutral");
        b.text(x, d as string, { size: 12.5, c: t.text2, w: "fill", lh: 18 });
        if (a) { const f = b.row(x, { gap: 6 }); b.icon(f, "check", 14, t.accent); b.text(f, "Active engine", { size: 12.5, weight: "SemiBold", c: t.accent }); }
        else K.btn(b, t, x, "Install in the app", { v: "secondary", sz: "sm", icon: "external" });
      });
      const v = section(b, t, m, "Voice and playback");
      K.settingRow(b, t, v, "Default voice", "American English · Quality A", (f) => rsel(b, t, f, "Heart (US English)", 240, "H"));
      K.divider(b, t, v);
      K.settingRow(b, t, v, "Speed", "1.2x · about 190 words per minute. Arrow keys change it by 0.1x.", (f) => K.slider(b, t, f, (1.2 - 0.5) / 2.5, 280, { label: "1.2x", min: "0.5x", max: "3x" }));
      K.divider(b, t, v);
      K.settingRow(b, t, v, "Pause between paragraphs", "Short, 0.4 s", (f) => K.seg(b, t, f, ["None", "Short", "Long"], 1));
      const pv = section(b, t, m, "Preview");
      b.frame(pv, { w: 1, h: 10 });
      const bx = b.row(pv, { w: "fill", gap: 12, pad: 12, r: 12, fill: t.surface2, align: "center" }); // padded preview box
      K.input(b, t, bx, { value: "Notes, documents and even voices lived on someone else's server.", w: "fill" }); K.btn(b, t, bx, "Play sample", { v: "primary", icon: "play" });
    } else if (sec === "highlight") {
      head("Highlighting", "How the sentence and the current word are marked while SpeakKit reads.", "Reset section");
      const dk = t.mode === "dark";
      const pv = K.card(b, t, m, { w: "fill", pad: 16, gap: 12 });
      const ph = b.row(pv, { w: "fill", justify: "spaceBetween" });
      const pl = b.row(ph, { gap: 14 }); b.text(pl, "Preview", { size: 15, weight: "Bold", c: t.text }); K.seg(b, t, pl, ["Light page", "Dark page"], dk ? 1 : 0);
      const cr = b.row(ph, { gap: 12 }); b.text(cr, `Text on sentence ${ratio(t.text, t.hlSent)}:1`, { size: 12, c: t.text2 }); b.text(cr, `Text on word ${ratio(t.hlWordText, t.hlWord)}:1`, { size: 12, c: t.text2 });
      const box = b.col(pv, { w: "fill", pad: 16, r: 12, fill: dk ? "#14110F" : "#FFFFFF", stroke: t.border, sw: 1 });
      K.para(b, t, box, K.ARTICLE.paras[0].split(". Small")[0] + ".", 880, { size: 18, lh: 30, hl: { sent: 1, word: 4 } });
      const a = section(b, t, m, "Style");
      K.settingRow(b, t, a, "Highlight", "Sentence gives context; word helps you follow along.", (f) => K.seg(b, t, f, ["Sentence + word", "Sentence", "Word", "Off"], 0));
      K.divider(b, t, a);
      K.settingRow(b, t, a, "Sentence color", "Marks the sentence being read.", (f) => { const r = b.row(f, { gap: 10, align: "start" }); [["#FFF1C2", "Yellow"], ["#D8F0FF", "Sky"], ["#E3F7DB", "Mint"], ["#FFE0EC", "Rose"], ["#E9E1FF", "Lilac"]].forEach(([h, n], i) => swatch(b, t, r, h, n, i === 0)); swatch(b, t, r, null, "Custom", false); });
      K.divider(b, t, a);
      K.settingRow(b, t, a, "Word color", "Marks the word being spoken.", (f) => { const r = b.row(f, { gap: 10, align: "start" }); [["#FFD24D", "Amber"], ["#7CC4F5", "Blue"], ["#8FDB7A", "Green"], ["#FF8FB5", "Pink"], ["#B9A4FF", "Violet"]].forEach(([h, n], i) => swatch(b, t, r, h, n, i === 0)); swatch(b, t, r, null, "Custom", false); });
      K.divider(b, t, a);
      K.settingRow(b, t, a, "Match page theme", "Use dark variants on dark pages.", (f) => K.toggle(b, t, f, true));
    } else if (sec === "shortcuts") {
      head("Shortcuts", "Browser-wide keys are managed by Chrome. Keys that work on the page can be changed here.", "Reset to defaults");
      const c1 = K.card(b, t, m, { w: "fill", pad: [18, 20], gap: 0 });
      const h1 = b.row(c1, { w: "fill", justify: "spaceBetween", pad: [0, 0, 8, 0] });
      const h1l = b.col(h1, { gap: 2 }); b.text(h1l, "Browser-wide (Chrome shortcuts)", { size: 15, weight: "Bold", c: t.text }); b.text(h1l, "Work on any tab, even when the page has no focus. Chrome allows four per extension.", { size: 12.5, c: t.text2 });
      K.btn(b, t, h1, "Edit in Chrome", { v: "secondary", sz: "sm", icon: "external" });
      const row = (card: Ref, i: number, n: string, d: string | undefined, keys: string[] | null, flag?: "conflict") => {
        K.divider(b, t, card);
        K.settingRow(b, t, card, n, d, (f) => { const r = b.row(f, { gap: 10 }); if (keys) kb(b, t, r, keys); else b.text(r, "Not set", { size: 12.5, c: t.text2 }); if (flag) stat(b, t, r, "Conflict", "warn"); K.iconBtn(b, t, r, "edit", { size: 32, ring: true }); });
      };
      row(c1, 0, "Read selection", undefined, ["Ctrl", "Shift", "S"]);
      row(c1, 1, "Play / pause", undefined, ["Ctrl", "Shift", "P"]);
      row(c1, 2, "Read page from the top", undefined, null);
      row(c1, 3, "Stop and close pill", "Another extension already uses this shortcut.", ["Ctrl", "Shift", "X"], "conflict");
      const c2 = K.card(b, t, m, { w: "fill", pad: [18, 20], gap: 0 });
      const h2 = b.col(c2, { w: "fill", gap: 2, pad: [0, 0, 8, 0] }); b.text(h2, "On this page", { size: 15, weight: "Bold", c: t.text }); b.text(h2, "Active while you read and no text field has focus. Click the pencil, then press the new key.", { size: 12.5, c: t.text2 });
      K.divider(b, t, c2);
      const pr = (cells: [string, string[]][]) => { const r = b.row(c2, { w: "fill", gap: 48, align: "start" }); cells.forEach(([n, k]) => { const cell = b.col(r, { w: "fill" }); K.settingRow(b, t, cell, n, undefined, (f) => { const g = b.row(f, { gap: 10 }); kb(b, t, g, k); K.iconBtn(b, t, g, "edit", { size: 32, ring: true }); }); }); };
      pr([["Next paragraph", ["→"]], ["Previous paragraph", ["←"]]]); K.divider(b, t, c2); pr([["Faster / slower", ["↑", "↓"]], ["Stop and close pill", ["Esc"]]]);
    } else if (sec === "sites") {
      head("Sites and filters", "Choose where SpeakKit appears and what it skips when it reads.", "Reset section");
      const f1 = section(b, t, m, "What to skip");
      grid2(b, t, f1, [["Navigation, menus and footers", undefined, true], ["Footnote numbers and citations [12]", undefined, true], ["Code blocks", undefined, true], ["Long URLs (say “link” instead)", undefined, true], ["Image captions", undefined, false]]);
      const s1 = section(b, t, m, "Site rules");
      const hs = b.row(s1, { w: "fill", justify: "spaceBetween", pad: [0, 0, 2, 0] }); b.text(hs, "Applies to the site and its subdomains.", { size: 12.5, c: t.text2 }); K.input(b, t, hs, { placeholder: "Search 3 rules", icon: "search", w: 220, h: 32 });
      const ad = b.row(s1, { w: "fill", gap: 10, pad: [10, 0, 6, 0] }); K.input(b, t, ad, { placeholder: "Add a site, e.g. news.example.com", icon: "globe", w: "fill" }); rsel(b, t, ad, "Always show pill", 200); K.btn(b, t, ad, "Add", { v: "primary", icon: "plus" }); K.btn(b, t, ad, "Use this tab's site", { v: "ghost" });
      [["docs.google.com", "Always show pill", t.ok, undefined], ["mail.google.com", "Hide controls", t.text3, undefined], ["bank.example.com", "Never read", t.err, "Nothing on this site is sent to the voice engine."]].forEach(([d, s, dot, cap]) => {
        K.divider(b, t, s1);
        const r = b.row(s1, { w: "fill", pad: [8, 0], justify: "spaceBetween" });
        const l = b.row(r, { gap: 10 }); b.icon(l, "globe", 16, t.text3); const lc = b.col(l, { gap: 1 }); b.text(lc, d as string, { size: 13.5, weight: "Medium", c: t.text }); if (cap) b.text(lc, cap as string, { size: 12, c: t.text2 });
        const rr = b.row(r, { gap: 10 });
        const dd = b.row(rr, { h: 32, pad: [0, 10], gap: 8, r: 8, fill: t.input, stroke: t.control, sw: 1, sa: "inside" }); b.ellipse(dd, { w: 8, h: 8, fill: dot as string }); b.text(dd, s as string, { size: 12.5, weight: "Medium", c: t.text }); b.icon(dd, "down", 14, t.text3);
        K.iconBtn(b, t, rr, "trash", { size: 32 });
      });
    }
  },
});

export const C: S[] = [
  opts("C1", "Options · General (connected)", "Connection status with response time, port, pairing token and where the extension shows UI.", "general"),
  opts("C2", "Options · General (app not running)", "Same layout as connected; only the status card changes. Primary action launches the app, the error code sits behind Details.", "general-error"),
  opts("C3", "Options · General (token rejected)", "Pairing token mismatch: paste a new token into the focused field, with Re-pair as the fallback.", "general-pair"),
  opts("C4", "Options · Voice and speed", "Engine cards with radio and install action, default voice, speed slider with live value, paragraph pause, preview.", "voice"),
  opts("C5", "Options · Highlighting", "Preview with light/dark switch and contrast readout, named color swatches with a custom option.", "highlight"),
  opts("C6", "Options · Shortcuts", "Browser-wide Chrome shortcuts (edited in Chrome) and in-page keys, with Not set and conflict states.", "shortcuts"),
  opts("C7", "Options · Sites and filters", "Skip rules and per-site rules; each rule is a dropdown (Always show pill, Hide controls, Never read).", "sites"),
  opts("C8", "Options · Highlighting (dark)", "Dark theme variant.", "highlight", true),
];

type PanelState = "queue" | "empty";
const panel = (id: string, title: string, note: string, st: PanelState, dark = false): S => ({
  id, group: "C", title, note, w: 1280, h: 800, dark,
  build: (b, t0, root) => {
    const t: T = dark ? { ...t0, hlSent: "#78621F" } : t0;
    const c = K.browser(b, t, root, {});
    // the page reflows in the 880 px left of the panel
    const vp = b.frame(c, { x: 0, y: 0, w: 880, h: 720, clip: true });
    const inner = b.frame(vp, { x: -200, y: 0, w: 1280, h: 720 });
    K.article(b, t, inner, { w: 520, hl: st === "queue" ? { para: 0, sent: 1, word: 3 } : undefined });
    const p = b.col(c, { x: 880, y: 0, w: 400, h: 720, fill: t.surface, stroke: t.border, sw: 1, gap: 0 });
    const h = b.row(p, { w: "fill", h: 56, pad: [0, 12, 0, 16], justify: "spaceBetween" }); const l = b.row(h, { gap: 8 }); K.logo(b, t, l, 24); b.text(l, "SpeakKit queue", { size: 14, weight: "Bold", c: t.text }); K.iconBtn(b, t, h, "x", { size: 32, c: t.text2 });
    b.rect(p, { w: "fill", h: 1, fill: t.border });
    if (st === "empty") {
      const e = b.col(p, { w: "fill", h: "fill", align: "center", justify: "center", pad: 32, gap: 12 });
      const ic = b.frame(e, { w: 56, h: 56, r: 28, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "list", 24, t.text2);
      b.text(e, "Nothing queued", { size: 16, weight: "Bold", c: t.text }); b.text(e, "Line up several articles. Add this page now, or right-click a page or selection and choose SpeakKit, then Add to queue.", { size: 13, c: t.text2, ta: "center", w: "fill", lh: 19 });
      K.btn(b, t, e, "Add this page", { v: "primary", icon: "plus" }); return;
    }
    const tt: T = { ...t, border: dark ? "#3A4570" : "#BFCBF0" };
    const np = b.col(p, { w: "fill", pad: [16, 16, 8, 16], gap: 10 });
    b.text(np, "NOW PLAYING", { size: 12, weight: "SemiBold", c: t.text2, ls: 1 });
    const cd = K.card(b, t, np, { w: "fill", pad: 14, gap: 10, fill: t.accentSoft, stroke: "none" as any });
    b.text(cd, "The quiet return of local-first software", { size: 14, weight: "SemiBold", c: t.text, w: "fill", lh: 19 });
    b.text(cd, `${SITE} · paragraph 1 of 3`, { size: 12, c: t.text2 });
    K.bar(b, t, cd, 0.36, 336, { knob: true });
    const tr = b.row(cd, { w: "fill", justify: "spaceBetween" }); b.text(tr, "2:27", { size: 12, c: t.text2, mono: true }); b.text(tr, "4:21 left", { size: 12, c: t.text2, mono: true });
    const ct = b.row(cd, { w: "fill", justify: "spaceBetween" });
    const cl = b.row(ct, { gap: 8 }); b.icon(cl, "skipBack", 18, t.text); b.icon(cl, "back10", 24, t.text);
    const pb = b.frame(cl, { w: 40, h: 40, r: 20, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "pause", 16, t.accentText);
    b.icon(cl, "fwd10", 24, t.text); b.icon(cl, "skipFwd", 18, t.text);
    K.btn(b, t, ct, "1.2x", { v: "secondary" });
    const ol = b.col(p, { w: "fill", pad: [8, 16, 8, 16], gap: 4 });
    b.text(ol, "THIS PAGE · 3 PARAGRAPHS", { size: 12, weight: "SemiBold", c: t.text2, ls: 1 });
    ["For a decade, the default answer to every software…", "The appeal is simple. When the work happens on…", "None of this is nostalgia. It is a bet that the best…"].forEach((s, i) => { const x = b.row(ol, { w: "fill", h: 36, pad: [0, 10], gap: 10, r: 8, fill: i === 0 ? t.surface2 : "none" }); b.text(x, `${i + 1}`, { size: 12, weight: "Bold", c: i === 0 ? t.accent : t.text2, mono: true }); b.text(x, s, { size: 12.5, c: t.text, w: "fill", maxLines: 1 }); if (i === 0) b.icon(x, "volume", 14, t.accent); });
    const q = b.col(p, { w: "fill", pad: [8, 16], gap: 6 });
    const qh = b.row(q, { w: "fill", justify: "spaceBetween" }); b.text(qh, "UP NEXT · 2 · 9 MIN", { size: 12, weight: "SemiBold", c: t.text2, ls: 1 }); b.text(qh, "Clear all", { size: 12.5, weight: "SemiBold", c: t.accent });
    b.frame(p, { w: "fill", h: "fill" });
    b.rect(p, { w: "fill", h: 1, fill: t.border });
    const ft = b.row(p, { w: "fill", h: 56, pad: [0, 16], justify: "spaceBetween" }); b.text(ft, "Play next item automatically", { size: 13, weight: "Medium", c: t.text }); K.toggle(b, t, ft, true);
    [["How small speech models got good", "blog.example.org · 6 min"], ["Privacy by default", "docs.example.com · 3 min"]].forEach(([a, d]) => { const x = b.row(q, { w: "fill", pad: [8, 8, 8, 8], gap: 10, r: 10, stroke: t.border, sw: 1 }); K.iconBtn(b, t, x, "play", { size: 32, bg: t.surface2, c: t.text2 }); const y = b.col(x, { gap: 1, w: "fill" }); b.text(y, a as string, { size: 12.5, weight: "Medium", c: t.text, w: "fill" }); b.text(y, d as string, { size: 12, c: t.text2 }); K.iconBtn(b, t, x, "x", { size: 32, c: t.text2 }); });
  },
});
export const C2: S[] = [
  opts("C12", "Options · Edge launcher", "Turn the edge launcher on or off, choose its side, how it hides, when it opens and how long it stays open.", "launcher"),
  panel("C9", "Side panel · queue and outline", "Chrome side panel: now playing with transport, paragraph outline, up-next queue with Play now, Remove and Clear all.", "queue"),
  panel("C10", "Side panel · empty queue", "Empty state explains how to add pages; the page reflows beside the panel.", "empty"),
  panel("C11", "Side panel · queue (dark)", "Dark theme variant.", "queue", true),
];
