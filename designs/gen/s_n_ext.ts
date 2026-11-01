import { B, Ref } from "./lib";
import * as K from "./kit";
import { T, tint } from "./kit";
import * as X from "./kit2";
import { S } from "./types";

const scr = (id: string, group: string, title: string, note: string, build: (b: B, t: T, root: Ref) => void, w = 1280, h = 800): S => ({ id, group, title, note, w, h, build });
const NAV: [string, string, string][] = [["general", "General", "sliders"], ["launcher", "Edge launcher", "sidebarRight"], ["voice", "Voice and speed", "mic"], ["highlight", "Highlighting", "type"], ["shortcuts", "Shortcuts", "keyboard"], ["sites", "Sites and filters", "globe"]];
/** extension options page inside a browser frame: 248 nav + 1040 content, like the C-series */
const optsShell = (b: B, t: T, root: Ref, key: string, head: string, sub: string, body: (m: Ref) => void) => {
  const c = K.browser(b, t, root, { url: "chrome-extension://speakkit/options.html", title: "Speak Kit options" });
  b.rect(c, { x: 0, y: 0, w: 1280, h: 720, fill: t.bg });
  const nav = b.col(c, { x: 0, y: 0, w: 248, h: 720, pad: [24, 12], gap: 2, fill: t.bg });
  const lg = b.row(nav, { gap: 8, pad: [0, 8, 14, 8] }); K.logo(b, t, lg, 26); b.text(lg, "Speak Kit", { size: 16, weight: "SemiBold", c: t.text });
  NAV.forEach(([k, l, ic]) => K.navItem(b, t, nav, l, ic, { selected: k === key }));
  const m = b.col(c, { x: 248, y: 0, w: 1032, h: 720, pad: [28, 0], align: "center" });
  const col = b.col(m, { w: 760, gap: 18 });
  const h = b.col(col, { gap: 4, w: "fill" }); b.text(h, head, { size: 22, weight: "SemiBold", c: t.text }); b.text(h, sub, { size: 13, c: t.text2, w: "fill", lh: 19 });
  body(col);
  return c;
};

const pair = (b: B, t: T, root: Ref) => optsShell(b, t, root, "general", "General", "How the extension talks to the Speak Kit desktop app.", (c) => {
  const card = b.col(c, { w: "fill", pad: 20, gap: 16, r: 12, stroke: t.accent, sw: 1, sa: "inside", fill: t.surface });
  const h = b.row(card, { w: "fill", justify: "spaceBetween" }); const hl = b.col(h, { gap: 2 }); b.text(hl, "Pair this browser", { size: 15, weight: "SemiBold", c: t.text }); b.text(hl, "The token stays on this computer. It is never sent to a server.", { size: 12, c: t.text3 }); K.badge(b, t, h, "Not paired", "warn");
  [["Open Speak Kit, Settings, Browser integration", "Choose Copy token, or Open Speak Kit link below."], ["Paste the token here", "It looks like spk_ followed by 24 characters."]].forEach(([a, d], i) => {
    const r = b.row(card, { gap: 10, align: "start" }); const n = b.frame(r, { w: 20, h: 20, r: 999, fill: t.subtle, layout: "horizontal", align: "center", justify: "center" }); b.text(n, String(i + 1), { size: 11, weight: "Medium", c: t.accent });
    const x = b.col(r, { gap: 1 }); b.text(x, a, { size: 13, weight: "Medium", c: t.text }); b.text(x, d, { size: 12, c: t.text3 });
  });
  const f = b.row(card, { w: "fill", gap: 8 }); K.input(b, t, f, { value: "spk_••••••••••••••••••••••••", icon: "key", w: "fill", state: "focus" }); K.btn(b, t, f, "Paste", { v: "secondary", sz: "lg", icon: "clipboard" }); K.btn(b, t, f, "Test connection", { v: "primary", sz: "lg", icon: "plug" });
  const ok = b.row(card, { w: "fill", pad: [10, 12], gap: 10, r: 8, fill: tint(t.ok, 0.1), stroke: tint(t.ok, 0.4), sw: 1, sa: "inside" }); b.icon(ok, "circleCheck", 16, t.ok); b.text(ok, "Connected to Speak Kit 0.4.2 · Kokoro-82M is ready · answered in 38 ms", { size: 12, c: t.text, w: "fill" });
  K.divider(b, t, card);
  const dl = b.row(card, { w: "fill", justify: "spaceBetween" }); const dx = b.col(dl, { gap: 1 }); b.text(dx, "Or let Speak Kit do it", { size: 13, weight: "Medium", c: t.text }); b.text(dx, "Chrome asks once before it opens the app. The token travels over this computer only.", { size: 12, c: t.text3 }); K.btn(b, t, dl, "Open Speak Kit", { v: "secondary", icon: "external" });
});

const deeplink = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 1280, h: 800, pad: 40, gap: 20, fill: t.bg });
  b.text(c, "Open Speak Kit link: pairing without copying a token", { size: 22, weight: "SemiBold", c: t.text });
  const r = b.row(c, { w: "fill", gap: 20, align: "start" });
  const step = (n: number, lab: string, draw: (p: Ref) => void) => { const k = b.col(r, { w: "fill", gap: 10 }); X.caps(b, t, k, `${n} · ${lab}`); const f = b.col(k, { w: "fill", pad: 16, gap: 12, r: 12, fill: t.surface, stroke: t.border, sw: 1, sa: "inside", h: 330 }); draw(f); if (n < 3) { /* arrow drawn by the gap */ } };
  step(1, "IN CHROME", (f) => { const h = b.row(f, { gap: 8 }); K.logo(b, t, h, 24); b.text(h, "Speak Kit", { size: 14, weight: "SemiBold", c: t.text }); K.badge(b, t, h, "Not paired", "warn"); b.text(f, "Pair Speak Kit with this browser", { size: 16, weight: "SemiBold", c: t.text, w: "fill" }); b.text(f, "The app and this browser don't share a token yet.", { size: 13, c: t.text2, w: "fill", lh: 19 }); K.btn(b, t, f, "Open Speak Kit", { v: "primary", sz: "lg", w: "fill", icon: "external" }); K.btn(b, t, f, "Paste a token instead", { v: "ghost", w: "fill" }); });
  step(2, "CHROME ASKS ONCE", (f) => { b.text(f, "Open Speak Kit?", { size: 16, weight: "SemiBold", c: t.text }); b.text(f, "https://speakkit.local wants to open this app.", { size: 13, c: t.text2, w: "fill", lh: 19 }); const cb = b.row(f, { gap: 8 }); K.checkbox(b, t, cb, true); b.text(cb, "Always allow speakkit.local to open links in this app", { size: 12, c: t.text2, w: 240 }); b.frame(f, { w: 1, h: 60 }); const bt = b.row(f, { gap: 8, justify: "max", w: "fill" }); K.btn(b, t, bt, "Cancel", { v: "secondary" }); K.btn(b, t, bt, "Open Speak Kit", { v: "primary" }); });
  step(3, "IN SPEAKKIT", (f) => { const h = b.row(f, { gap: 8 }); K.logo(b, t, h, 24); b.text(h, "Pair with Chrome?", { size: 16, weight: "SemiBold", c: t.text }); b.text(f, "Chrome · Profile Maya asks to read pages with Speak Kit. Check that this code matches the one in the popup.", { size: 13, c: t.text2, w: "fill", lh: 19 }); X.code6(b, t, f, "7Q4K9X"); const bt = b.row(f, { gap: 8, justify: "max", w: "fill" }); K.btn(b, t, bt, "Deny", { v: "secondary" }); K.btn(b, t, bt, "Allow", { v: "primary" }); });
  const r2 = b.row(c, { w: "fill", gap: 20, align: "start" });
  X.rulesCard(b, t, r2, "Rules", ["Deep link opens Speak Kit and shows the same six-character code as the popup; Allow completes pairing.", "If Speak Kit is not installed, Chrome shows nothing and the popup falls back to Download.", "Denying keeps the browser unpaired and says so in the popup."], { w: 620 });
  K.toast(b, t, r2, "Paired with Chrome · Profile Maya", "ok", {});
};

const sites = (b: B, t: T, root: Ref) => optsShell(b, t, root, "sites", "Sites and filters", "Choose where Speak Kit may read page text. Page text stays on this computer.", (c) => {
  const rows: [string, string, string][] = [["reader.example.com", "Always read", "R"], ["news.example.org", "Ask each time", "N"], ["mail.example.com", "Never", "M"], ["docs.example.dev", "Always read", "D"], ["bank.example.com", "Never", "B"]];
  X.group(b, t, c, "SITE PERMISSIONS", rows.map(([d, v, l], i) => (f: Ref) => { const r = b.row(f, { w: "fill", h: 52, gap: 12 }); K.favicon(b, t, r, l, 20, [t.ok, t.info, t.warn, t.purple, t.err][i]); b.text(r, d, { size: 13, weight: "Medium", c: t.text, w: "fill" }); K.select(b, t, r, v, 150); K.iconBtn(b, t, r, "trash", { size: 28 }); }));
  const a = b.row(c, { w: "fill", gap: 8 }); K.input(b, t, a, { placeholder: "Add a site, for example example.com", icon: "globe", w: "fill" }); K.btn(b, t, a, "Add", { v: "secondary", sz: "lg", icon: "plus" });
  X.group(b, t, c, "DEFAULT", [(f) => X.selectRow(b, t, f, "Sites not in the list", "Ask each time shows the pill but reads nothing until you press play.", "Ask each time", 150)]);
  X.banner(b, t, c, { tone: "info", title: "Page text is treated as information, never as instructions", body: "Speak Kit only turns the text into speech. Nothing on a page can change a setting or start a request." });
});
const shortcutConflict = (b: B, t: T, root: Ref) => optsShell(b, t, root, "shortcuts", "Shortcuts", "Set in Chrome; Speak Kit shows what Chrome has assigned.", (c) => {
  X.banner(b, t, c, { tone: "warn", title: "Ctrl Shift S is also used by Google Docs", body: "Chrome lets the page win inside Google Docs, so Read selection does nothing there. Pick another shortcut for all sites, or keep it.", primary: "Use Alt Shift S instead", secondary: "Keep Ctrl Shift S" });
  const k = (a: string[], rec = false) => (r: Ref) => { const x = b.row(r, { gap: 8 }); if (rec) { const pk = b.row(x, { h: 24, pad: [0, 10], r: 6, stroke: t.accent, sw: 1.5, sa: "inside" }); b.text(pk, "Press keys…", { size: 11, c: t.accent }); } else K.kbd(b, t, x, a); };
  X.group(b, t, c, "IN THE BROWSER", [(f) => K.settingRow(b, t, f, "Read selection", undefined, k(["Ctrl", "Shift", "S"])), (f) => K.settingRow(b, t, f, "Play or pause", undefined, k([], true)), (f) => K.settingRow(b, t, f, "Open reader view", undefined, k(["Alt", "R"]))]);
  X.group(b, t, c, "GLOBAL (SET IN THE APP)", [(f) => K.settingRow(b, t, f, "Read clipboard", "Works in any app.", k(["Ctrl", "Alt", "C"]))]);
});

const breakpoints = (b: B, t: T, root: Ref) => {
  const c = b.col(root, { x: 0, y: 0, w: 1280, h: 800, pad: 40, gap: 20, fill: t.bg });
  b.text(c, "Breakpoint rules: the options page and the desktop window share them", { size: 22, weight: "SemiBold", c: t.text });
  const r = b.row(c, { w: "fill", gap: 20, align: "end" });
  [["1280 and up", 360, 220, "nav 248 + 760 column"], ["1025 to 1279", 300, 220, "60 px icon rail"], ["641 to 1024", 220, 220, "rail, column max 600"], ["640 and below", 130, 220, "drawer from the left edge"]].forEach(([lab, w, h, d], i) => {
    const k = b.col(r, { gap: 8 }); const f = b.row(k, { w: w as number, h: h as number, pad: 6, gap: 6, r: 10, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
    if (i < 3) { b.rect(f, { w: i === 0 ? 70 : 16, h: "fill", r: 6, fill: t.selected }); } else { b.rect(f, { w: 12, h: 12, r: 3, fill: t.selected }); }
    const m = b.col(f, { w: "fill", h: "fill", pad: 8, gap: 6, r: 6, fill: t.editor }); [0.9, 0.6, 0.75].forEach((v) => b.rect(m, { w: Math.round(((w as number) - 40) * v * (i === 0 ? 0.6 : 1)), h: 8, r: 4, fill: t.hover }));
    b.text(k, lab as string, { size: 12, weight: "SemiBold", c: t.text }); b.text(k, d as string, { size: 11, c: t.text3 });
  });
  X.rulesCard(b, t, c, "Breakpoint rules", ["1280 and up: sidebar or nav 248 + content card; side panels dock right.", "1025 to 1279: 60 px icon rail; side panels overlay the content.", "641 to 1024: rail, content column max 600, dialogs stay centered.", "640 and below: nav becomes a select (options) or a drawer (desktop); 44 px touch targets; menus become sheets."], { w: 620 });
};
const narrow = (b: B, t: T, root: Ref) => {
  const c = K.browser(b, t, root, { url: "chrome-extension://speakkit/options.html", title: "Speak Kit options", w: 760, h: 800 });
  b.rect(c, { x: 0, y: 0, w: 760, h: 720, fill: t.bg });
  const m = b.col(c, { x: 0, y: 0, w: 760, h: 720, pad: [20, 20], gap: 14 });
  const hr = b.row(m, { w: "fill", gap: 10 }); K.logo(b, t, hr, 26); b.text(hr, "Speak Kit", { size: 16, weight: "SemiBold", c: t.text, w: "fill" }); K.select(b, t, hr, "General", 180);
  const h = b.col(m, { gap: 4, w: "fill" }); b.text(h, "General", { size: 22, weight: "SemiBold", c: t.text }); b.text(h, "How the extension talks to the Speak Kit desktop app.", { size: 13, c: t.text2 });
  const st = b.row(m, { w: "fill", pad: 16, gap: 12, r: 12, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" }); const ic = b.frame(st, { w: 36, h: 36, r: 999, fill: t.okSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "check", 18, t.ok);
  const x = b.col(st, { gap: 2, w: "fill" }); b.text(x, "Connected to Speak Kit 0.4.2", { size: 13, weight: "Medium", c: t.text }); b.text(x, "Kokoro-82M is ready · 38 ms", { size: 12, c: t.text3 });
  X.group(b, t, m, "LAUNCHER", [(f) => X.toggleRow(b, t, f, "Show the edge tab", "A 14 px tab at the page edge.", true), (f) => X.toggleRow(b, t, f, "Show the pill after first use", undefined, true), (f) => X.selectRow(b, t, f, "Side", undefined, "Right", 100)]);
};

export const N4: S[] = [
  scr("C13", "C", "Options · Pair this browser", "Pairing card: token field, Paste, Test connection with a real result line, and the Open Speak Kit link as the easy path.", pair),
  scr("C14", "C", "Open Speak Kit link flow", "Three steps, one Chrome confirmation, one code to compare; denying leaves the browser unpaired.", deeplink),
  scr("C15", "C", "Options · Per-site permissions", "Domain rows with Always read, Ask each time or Never; the default for unknown sites is stated.", sites),
  scr("C16", "C", "Options · Shortcut conflict", "A conflict names the page that wins and offers one alternative; the recording chip is outlined in blue.", shortcutConflict),
  scr("C17", "C", "Breakpoint rules", "Four widths, one rule each: nav 248, 60 px rail, column max 600, then a select or drawer.", breakpoints),
  scr("C18", "C", "Options · Narrow layout", "Below 1025 px the nav collapses to a select at the top; rows stack in one column.", narrow, 760, 800),
];
