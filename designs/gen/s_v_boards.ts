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


const fm = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Feature map: every feature lives on one surface and carries v1 or v1.1", "Version 1 is the Chrome extension plus the desktop app that hosts the voice engine, with library, reader, PDF and export. Voice cloning screens wait for v1.1 (docs/scope.md).");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  const cols: [string, string, [string, boolean][]][] = [
    ["Chrome extension", "globe", [["Popup: play, selection, voice, speed", true], ["Read-aloud pill on the page", true], ["Edge launcher tab", true], ["Reader view and Reading popover", true], ["Selection bubble, paragraph gutter", true], ["Context menu: read with Speak Kit", true], ["Options, per-site permissions", true], ["Pairing: token and Open Speak Kit link", true], ["Queue side panel", true]]],
    ["Desktop app", "desktop", [["Setup window, 5 steps", true], ["Home, command palette, status pill", true], ["Library: paste, web address, file, drag and drop", true], ["Reader and PDF reader, OCR with consent", true], ["Export audio (MP3, WAV)", true], ["Tray menu, panel, mini player, toasts", true], ["Settings: memory, notifications, shortcuts, updates", true], ["Voices and engines", true], ["Voice cloning screens (Chatterbox)", false]]],
    ["Loopback server", "plug", [["127.0.0.1 only, token required", true], ["Streaming audio per sentence", true], ["Events: progress, state", true], ["POST /v1/engine/warm", true], ["Health with idle unload time", true], ["POST /v1/voices/clone (no screens)", true]]],
    ["Voice engine", "cpu", [["Kokoro-82M on this computer", true], ["Unload when idle, wake on play", true], ["Battery saver", true], ["GPU when it fits, CPU otherwise", true], ["Chatterbox cloning (unverified on hardware)", false]]],
  ];
  cols.forEach(([n, ic, items]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 14, gap: 8 }); const h = b.row(k, { gap: 8 }); b.icon(h, ic, 18, t.accent); b.text(h, n, { size: 14, weight: "SemiBold", c: t.text });
    items.forEach(([l, v1]) => { K.divider(b, t, k); const row = b.row(k, { w: "fill", h: 40, gap: 8, justify: "spaceBetween" }); b.text(row, l, { size: 12, c: t.text, w: "fill", lh: 16 }); pillV(b, t, row, v1); });
  });
};
const pat = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Lockix patterns adopted", "Light only. Every Speak Kit surface follows the Lockix design system (docs/lockix-design-system.md, tokens in packages/ui/src/lumen.css); no new look is invented.");
  table(b, t, c, [200, 220, "fill"], ["Speak Kit surface", "Lockix source", "What is copied"], [
    ["Desktop shell, Home", "10-settings-general, 16-header", "36 px title bar, left panel 250, 4 px inset, white panel r14 (Windows 8), 28 px footer"],
    ["Settings pages", "10, 11", "Rows in a tray card, switches 32x20, segmented 36, selects 36, radios"],
    ["Read-aloud pill, Reading popover", "13-menus, popover shadow", "White surface, popover ring shadow, 296 px popover with 12 px padding"],
    ["Menus and command palette", "13-menus", "Radius 10, items 28, min 128, 14/20 text, destructive last item"],
    ["Dialogs (quit, export, delete)", "dialog spec", "384 wide, r16 (Windows 10), padding 16, gap 14, 40 px footer buttons"],
    ["Tray panel", "07-tray-popover", "Grey tray #F4F4F4, padding 4, r14 (Windows 10), white inner card, 36 px footer"],
    ["Windows toasts", "04, 05 notification card", "Card with logo header and no buttons, shadow-popover, stack gap 8"],
    ["Pairing, popup loading", "15-loading-bar-popups", "Six boxes; 160x6 loading bar, 1.4 s, replaces skeletons in pop-ups"],
    ["Banners, status pills", "tokens tag/dot/chip", "Three tokens per hue; one primary action per banner"],
    ["Tables and lists", "12-vaults-table, 17", "Row states, focus ring following the card corners"]], { rowH: 40 });
};
const dec = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Decisions that shape the UI", "Recorded in docs/decisions (0001 stack, 0015 light only) and docs/design-system.md.");
  const g = b.row(c, { w: "fill", gap: 14, wrap: true, align: "start" });
  [["lock", "Local only", "No account, no cloud voice. The UI never shows a sign-in and says 'on device' wherever sound is made."], ["package", "Packages first", "Radix for primitives, valibot for validation, electron-log and electron-store for the desktop. Nothing is built from scratch if a maintained package does the job."], ["sun", "Light only", "One light theme, the Lockix look: no dark mode. Pages that are dark are the website, not Speak Kit."], ["zap", "Performance", "Models load on demand and unload when idle; the UI shows the state in words."], ["eye", "Calm status", "Color only for state. One primary action per banner. Toasts only for background work."], ["book", "Lockix is the source", "Components, spacing, type (Inter Variable, 13 px base) and springs come from Lockix; radii switch to 8 and 10 px on Windows."]].forEach(([ic, ti, d]) => {
    const k = K.card(b, t, g, { w: 380, pad: 16, gap: 8, h: 150 }); const h = b.row(k, { gap: 8 }); b.icon(h, ic === "package" ? "box" : ic, 18, t.accent); b.text(h, ti, { size: 14, weight: "SemiBold", c: t.text }); b.text(k, d, { size: 12, c: t.text2, w: "fill", lh: 17 });
  });
};
const elevation = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Elevation: the Lockix shadows", "Values from tokens.json. Swatches are white on the #F0F0F0 window with the radius the token is used with. Floating windows use the popover ring; there is no large window shadow in the UI.");
  const items: [string, string, string, string, number][] = [
    ["control", "0 1 2 rgb(0 0 0 / .06)", "white buttons, inputs, selected segment", "md", 8], ["menu", "0 1 2 rgb(0 0 0 / .06)", "menus (ring comes from the border)", "md", 10], ["card", "0 0 4 / .07, 0 1 2 / .04", "cards and panels", "card", 10], ["card-ring", "0 0 0 1 #EBEBEB, 0 1 2 / .05", "tray inner card, tables", "ring", 10],
    ["cta", "0 2 4 rgb(0 0 0 / .10)", "primary (near-black) button", "cta", 8], ["tab", "0 1 3 rgb(0 0 0 / .12)", "selected tab", "tab", 8], ["popover", "0 0 0 1 / .10, 0 2 6 / .06", "pill popovers, toasts, floating cards", "lg", 12], ["dialog", "0 0 0 1 / .10, 0 4 12 / .07", "dialogs (drawer adds -4 0 12 / .07)", "dlg", 16]];
  const g = b.row(c, { w: "fill", gap: 16, wrap: true, align: "start" });
  items.forEach(([n, v, u, sh, rad]) => {
    const k = b.col(g, { w: 290, h: 190, gap: 0, r: 12, fill: t.bg, stroke: t.border, sw: 1, sa: "inside", pad: 14 });
    const sw = b.frame(k, { w: "fill", h: 84, layout: "horizontal", align: "center", justify: "center" });
    b.frame(sw, { w: 132, h: 60, r: rad, fill: "#FFFFFF", shadow: sh });
    const x = b.col(k, { gap: 2, w: "fill" }); b.text(x, `shadow-${n}`, { size: 13, weight: "Medium", c: t.text }); b.text(x, v, { size: 11, c: t.text2, w: "fill" }); b.text(x, `${u} · r${rad}`, { size: 11, c: t.text3, w: "fill", lh: 15 });
  });
};
const platformRadii = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Platform radii: Windows against macOS", "The same layout; only four container radii change when data-platform=\"win32\" is set (lumen.css). Controls, cards, menus and chips are identical on both.");
  const lv: [string, number, number, string][] = [["dialog", 16, 10, "dialogs"], ["panel", 14, 8, "shell panels, banners"], ["tray", 14, 10, "tray window"], ["window", 12, 10, "toast, floating cards"], ["menu, card", 10, 10, "menus, cards"], ["control", 8, 8, "buttons, inputs"], ["chip", 6, 6, "tags, segments"], ["check", 5, 5, "checkbox"]];
  const r = b.row(c, { w: "fill", gap: 16, align: "start" });
  ([["Windows 11 (win32)", 2], ["macOS and default", 1]] as [string, number][]).forEach(([n, ix]) => {
    const k = K.card(b, t, r, { w: "fill", pad: 16, gap: 12 }); X.caps(b, t, k, n.toUpperCase());
    const g = b.row(k, { w: "fill", gap: 12, wrap: true, align: "start" });
    lv.forEach((row) => { const v = row[ix] as number; const q = b.col(g, { w: 120, gap: 6 }); b.frame(q, { w: 96, h: 72, r: v, fill: t.bg, stroke: t.text2, sw: 1, sa: "inside" }); b.text(q, `${row[0]} ${v}`, { size: 12, weight: "Medium", c: t.text }); b.text(q, row[3], { size: 11, c: t.text3, w: "fill" }); });
  });
  X.rulesCard(b, t, c, "Window shapes", ["Inner radius = max(2, outer minus inset): a 4 px inset under a 12 px frame gives 8.", "The OS draws the window corners (Windows 11: 8 px); panels inside use 8 on Windows so the inset reads as concentric.", "Extension surfaces use the same variables inside a shadow root, so the pill and popover follow the platform too.", "Hover fills are concentric: menu and select option 5, segmented option 6, palette row 8 on macOS and 4 on Windows; the first and last row of a card follow the card corners.", "Nested tiles (resume tile, engine tile, queue thumbnail) use max(radius-xs 4, card radius minus border and padding): 4 inside a 10 px card with 14 px padding.", "Press scale: 0.97 on segmented options, chips and pills, 0.92 on xs buttons and close buttons, same 130 ms spring; shadows and the other radii are unchanged."], { w: "fill" });
};
const mo1 = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Motion tokens", "Springs as linear() easings, 167 ms state fades. Nothing runs longer than 350 ms after an input; exits are shorter than entrances (docs/lockix-design-system.md).");
  const r = b.row(c, { w: "fill", gap: 24, align: "start" });
  const l = b.col(r, { w: "fill", gap: 0 });
  table(b, t, l, [120, 80, "fill"], ["Token", "Time", "Use"], [
    ["snap", "130 ms", "ease-spring: press, small toggles"], ["ui", "190 ms", "ease-spring: translate, width, background-color"], ["layout", "260 ms", "ease-layout: panels, menus, sheets, dialogs"], ["morph", "330 ms", "ease-layout: mini player pill, shape changes"], ["gentle", "460 ms", "ease-soft: progress, rings"],
    ["release", "310 ms", "ease-spring: return after press"], ["fade-in", "167 ms", "ease-out: entering a state"], ["fade-out", "83 ms", "ease-in: leaving a state"], ["exit", "120 ms", "everything that leaves"], ["focus", "120 ms", "ease-out: focus ring"], ["skeleton", "2 s pulse", "waits 150 ms, fades in 167 ms"], ["loading bar", "1.4 s", "160x6 track, bar 40%, translateX, infinite"]], { rowH: 30 });
  const rt = b.col(r, { w: 360, gap: 12 });
  ([["ease-spring", "zeta .80", 0.3], ["ease-layout", "zeta .86", 0.4], ["ease-soft", "zeta .90 to .92", 0.5]] as [string, string, number][]).forEach(([n, z, k0]) => {
    const k = K.card(b, t, rt, { w: "fill", pad: 12, gap: 6 }); const row = b.row(k, { gap: 12 }); const box = b.frame(row, { w: 100, h: 100, r: 6, stroke: t.border, sw: 1, sa: "inside" });
    b.add("node.create", { type: "vector", path: `M0 100 C ${k0 * 100} 0 60 0 100 0`, x: 0, y: 0, width: 100, height: 100, parent: box, props: { fill: "none", stroke: t.accent, strokeWeight: 2, strokeCap: "round" } });
    const x = b.col(row, { gap: 2 }); b.text(x, n, { size: 13, weight: "Medium", c: t.text }); b.text(x, z + " (shape indicative)", { size: 11, c: t.text3 });
  });
  const dr = K.card(b, t, c, { w: "fill", pad: 14, gap: 8 }); X.caps(b, t, dr, "DURATIONS TO SCALE (1 px = 2 ms)");
  [["fade-out", 83], ["exit", 120], ["snap", 130], ["fade-in", 167], ["ui", 190], ["layout", 260], ["release", 310], ["morph", 330]].forEach(([n, v]) => { const x = b.row(dr, { gap: 10 }); b.text(x, n as string, { size: 11, c: t.text3, w: 60 }); b.rect(x, { w: (v as number) / 2, h: 8, r: 4, fill: t.accent }); b.text(x, `${v} ms`, { size: 11, c: t.text2 }); });
};
const mo2 = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Per-element motion rules", undefined, 1280, 800, 10);
  const rows = [
    ["Pill appears", "First use on a page", "Fade + rise 8 px", "layout 260, exit 120", "Fade only, 167"], ["Pill play button", "Engine waking", "Spinner turns", "loop 800", "Static icon"], ["Pill progress bar", "Playing", "Width follows time", "gentle 460", "No tween"],
    ["Popovers (speed, voice, Reading)", "Click", "Scale .96 to 1 + fade", "layout 260, exit 120", "Fade, 83"], ["Sentence highlight", "Next sentence", "Fill crossfade", "fade-in 167", "Instant"], ["Word marker", "Next word", "Snap", "none", "Snap"], ["Page auto-scroll", "Sentence leaves view", "Smooth scroll", "morph 330", "Jump"],
    ["Selection bubble", "Selection ends", "Scale .96 to 1, rise 4 px", "ui 190", "Fade, 167"], ["Toast", "Background event", "Slide 16 px + fade; hides after 6 s", "layout 260, exit 120", "Fade, 83"], ["Segmented thumb, switch", "Change", "Thumb slides", "ui 190", "Instant"], ["Command palette", "Ctrl K", "Scrim fade, panel scale .96 to 1", "layout 260, exit 120", "Fade, 83"],
    ["Update popover", "Click the pill", "Same as popovers", "layout 260", "Fade, 83"], ["Setup step change", "Continue", "Content slides 24 px + fade", "layout 260", "Fade only"], ["Engine waking bar", "Play on unloaded", "Bar travels", "loading bar 1.4 s", "Static bar"], ["Tray icon working", "Reading or export", "Bars animate", "loop 800", "One steady frame"],
    ["Mini player pill", "Play, 4 s quiet", "Grows, shrinks to dot", "morph 330, ease-layout", "Fade, 83"], ["Dialog (quit, export)", "Open", "Scale .96 to 1 + fade", "layout 260, exit 120", "Fade, 83"], ["Buttons, rows", "Hover, press", "Colour fade; press scale .97", "fade-in 167, snap 130", "Colour only"]];
  table(b, t, c, [200, 150, "fill", 170, 110], ["Element", "Trigger", "Animation", "Time and easing", "Reduce motion"], rows, { rowH: 29, size: 11 });
};
const mo3 = (b: B, t: T, root: Ref) => {
  const c = board(b, t, root, "Reduce motion and other motion rules", "Everything respects the Windows and Chrome setting.");
  const r = b.row(c, { w: "fill", gap: 14, align: "start" });
  X.rulesCard(b, t, r, "Reduce motion", ["Durations drop to zero and springs become ease-out; colour fades stay.", "Enter and exit animation and the press scale are removed.", "Loops stop: spinner becomes a static icon, loading bar a static half bar.", "Highlight and scroll jump instead of animating."], { w: 600 });
  X.rulesCard(b, t, r, "Principles", ["Springs for movement, fades for state: enter 167 ms, leave 83 ms, focus 120 ms.", "Nothing runs longer than 350 ms after an input; exits are shorter than entrances.", "Motion explains state: waking is a loop, reading is progress, done is a stop.", "Only colour, opacity and transform animate."], { w: 600 });
  const st = K.card(b, t, c, { w: "fill", pad: 14, gap: 10 }); X.caps(b, t, st, "SKELETON · WAITS 150 ms, FADES IN 167 ms, PULSES AT 2 s");
  const row = b.row(st, { gap: 8 }); for (let i = 0; i < 6; i++) b.frame(row, { w: 90, h: 32, r: 6, fill: t.selected, opacity: 1 - i * 0.12 });
};

export const VB: S[] = [
  scr("R1", "R", "Feature map", "Each feature sits on one surface and is marked v1 or v1.1; library, reader and export now ship.", fm),
  scr("R5", "R", "Lockix patterns adopted", "Each Speak Kit surface names the Lockix frame it copies.", pat),
  scr("R6", "R", "Decisions that shape the UI", "Local only, packages first, light only, performance, calm status.", dec),
  scr("Q6", "Q", "Elevation", "The Lockix shadows with their radii on the #F0F0F0 window.", elevation),
  scr("Q7", "Q", "Platform radii", "Windows 8 and 10 px container radii against the macOS defaults.", platformRadii),
  scr("MO1", "MO", "Motion tokens", "Lockix durations, springs as linear() easings, state fades.", mo1),
  scr("MO2", "MO", "Per-element rules", "Trigger, animation, time, easing and reduce-motion fallback for 18 elements.", mo2),
  scr("MO3", "MO", "Reduce motion and principles", "Zero durations under reduce motion; loops stop; nothing over 350 ms.", mo3),
];
