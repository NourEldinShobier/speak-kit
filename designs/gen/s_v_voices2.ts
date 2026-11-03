// d-voices part 2: design-only frames (features the product does not have yet, and states that the harness cannot capture), in the real shell of s_v_voices.ts.
import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";
import { C, PT, ER, BLURB, KOKORO, VOICES, AV, GT, win, shell, page, pill, avatar, segmented, voicesTools, voiceCard, voicesPage, enginesPage, engineRow } from "./s_v_voices";

const CW = 1278, CH = 799;
const scrim = (b: B, c: Ref) => b.rect(c, { name: "Scrim", x: 0, y: 0, w: CW, h: CH, fill: "#1B223052" });
const dialog = (b: B, t: T, c: Ref, w: number, title: string, body: (d: Ref) => void, foot: (f: Ref) => void) => {
  const d = b.col(c, { name: "Dialog", x: Math.round((CW - w) / 2), y: 200, w, pad: 16, gap: 14, r: 16, fill: "#FFFFFF", shadow: "dlg", clip: false });
  b.text(d, title, { size: 15, weight: "SemiBold", c: C.text, lh: 20 }); body(d);
  const f = b.row(d, { w: "fill", gap: 8, justify: "max", pad: [6, 0, 0, 0] }); foot(f);
  return d;
};
const card = (b: B, p: Ref, o: Record<string, any> = {}) => b.col(p, { w: "fill", pad: [14, 16], gap: 12, r: 10, fill: "#FFFFFF", shadow: "ring", clip: false, ...o });
const h3 = (b: B, p: Ref, s: string, d?: string) => { const c = b.col(p, { w: "fill", gap: 2 }); b.text(c, s, { size: 14, weight: "SemiBold", c: C.text }); if (d) b.text(c, d, { size: 13, c: C.t2, lh: 16, w: "fill" }); return c; };
const checkRow = (b: B, p: Ref, ok: boolean, label: string, d: string) => {
  const r = b.row(p, { w: "fill", gap: 10, align: "start" }); b.icon(r, ok ? "circleCheck" : "alertCircle", 18, ok ? C.ok : "#A61B1B");
  const q = b.col(r, { w: "fill", gap: 1 }); b.text(q, `${label}: ${ok ? "passed" : "failed"}`, { size: 13, weight: "Medium", c: C.text }); b.text(q, d, { size: 12, c: C.t2, w: "fill", lh: 16 });
};
const meter = (b: B, p: Ref, v: number) => { const tr = b.frame(p, { w: "fill", h: 8, r: 4, fill: "#F0F0F0", clip: true }); b.rect(tr, { x: 0, y: 0, w: Math.round(v * 700), h: 8, r: 4, fill: "#17693D" }); };
const bar = (b: B, p: Ref, v: number) => { const tr = b.frame(p, { w: "fill", h: 4, r: 2, fill: "#F0F0F0", clip: true }); b.rect(tr, { x: 0, y: 0, w: Math.round(v * 700), h: 4, r: 2, fill: "#0069CC" }); };
const cloneBtn = (b: B, t: T, r: Ref, label: string, o: { disabled?: boolean } = {}) => K.btn(b, t, r, label, { v: "primary", icon: "mic", disabled: o.disabled });
const clonePage = (b: B, t: T, c: Ref, title: string, lead: string, body: (col: Ref) => void, foot: (f: Ref) => void) => {
  const col = page(b, shell(b, t, c, { nav: "voices" }), { title, lead });
  body(col);
  const f = b.row(col, { w: "fill", gap: 8, justify: "max" }); foot(f);
};
const sliderRow = (b: B, t: T, p: Ref, title: string, desc: string, v: number, label: string, min: string, max: string) => {
  const r = b.col(p, { w: "fill", gap: 8 }); const h = b.row(r, { w: "fill", justify: "spaceBetween" });
  const q = b.col(h, { gap: 1 }); b.text(q, title, { size: 13, weight: "Medium", c: C.text }); b.text(q, desc, { size: 12, c: C.t2 }); b.text(h, label, { size: 13, weight: "Medium", c: C.text });
  K.slider(b, t, r, v, 640, { min, max });
};
const engRows = (cb: ER) => [KOKORO(), cb];
const CB = (o: Partial<ER> = {}): ER => ({ name: "Chatterbox", icon: "sparkles", blurb: BLURB.chatterbox, extra: "Found NVIDIA GeForce RTX 3060, 12 GB", pill: { label: "Not installed", tone: "orange" }, actions: [{ label: "Install" }], ...o });
const noop = (_: any) => {};
void noop;

export const GV2: S[] = [
  win("G2", "Voices · detail drawer", "Design-only (v1.1): a drawer from the right edge over the Voices page with previous/next voice, the try-it sentence and the default voice action.", (b, t, c) => {
    voicesPage(b, t, shell(b, t, c, { nav: "voices" })); scrim(b, c);
    const d = b.col(c, { name: "Voice drawer", x: 878, y: 36, w: 392, h: 735, pad: 20, gap: 16, r: [14, 0, 0, 14], fill: "#FFFFFF", shadow: "dlg", clip: false });
    const h = b.row(d, { w: "fill", justify: "spaceBetween" }); const hl = b.row(h, { gap: 4 }); K.iconBtn(b, t, hl, "left", { size: 28, c: C.t2 }); K.iconBtn(b, t, hl, "right", { size: 28, c: C.t2 }); b.text(hl, "1 of 28", { size: 12, c: C.t3 }); K.iconBtn(b, t, h, "x", { size: 28, c: C.t2 });
    const hd = b.row(d, { gap: 14 }); avatar(b, hd, "Heart", 56, AV[0]); const q = b.col(hd, { gap: 4 }); b.text(q, "Heart", { size: 20, weight: "SemiBold", c: C.text }); b.text(q, "US English · Female", { size: 13, c: C.t2 }); pill(b, q, "Grade A", "green");
    b.text(d, "Warm and clear. Best all-round voice for articles and long documents.", { size: 13, c: C.t2, lh: 20, w: "fill" });
    const sm = b.col(d, { w: "fill", pad: 14, gap: 10, r: 10, fill: C.well }); b.text(sm, "TRY IT", { size: 11, weight: "SemiBold", c: C.t3, ls: 0.5 }); b.text(sm, "Hello, I am Heart. This is how I sound when reading to you.", { size: 13, c: C.text, lh: 20, w: "fill" });
    K.btn(b, t, sm, "Preview", { v: "secondary", sz: "sm", icon: "play" });
    K.btn(b, t, d, "Default voice", { v: "secondary", w: "fill", icon: "check", disabled: true });
  }),
  win("G13", "Voices · list view", "Design-only (v1.1): the Grid / List toggle and the dense list: play, name, accent, gender, grade, favorite.", (b, t, c) => {
    const col = page(b, shell(b, t, c, { nav: "voices" }), { title: "Voices", lead: "28 Kokoro voices. Press Preview to hear one.", wide: true });
    const tl = b.row(col, { w: "fill", gap: 12, clip: false }); K.input(b, t, tl, { placeholder: "Search voices", icon: "search", w: 260, h: 28 }); segmented(b, tl, ["All", "US English", "UK English", "Female", "Male"], 0); b.frame(tl, { w: "fill", h: 1 }); segmented(b, tl, ["Grid", "List"], 1);
    const l = b.col(col, { w: "fill", r: 10, fill: "#FFFFFF", shadow: "ring", gap: 0, clip: true });
    const hd = b.row(l, { w: "fill", h: 32, pad: [0, 16], gap: 12, fill: C.well });
    [["", 28], ["Voice", 200], ["Accent", 150], ["Gender", 100], ["Grade", 100]].forEach(([s, w]) => b.text(hd, s as string, { size: 12, weight: "SemiBold", c: C.t3, w: w as number }));
    VOICES.slice(0, 9).forEach((v, i) => { b.rect(l, { w: "fill", h: 1, fill: "#F0F0F0" }); const r = b.row(l, { w: "fill", h: 44, pad: [0, 16], gap: 12 });
      const pb = b.frame(r, { w: 28, h: 28, r: 14, fill: C.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "play", 12, C.t2);
      const nm = b.row(r, { w: 200, gap: 6 }); avatar(b, nm, v[0], 24, AV[i % 6]); b.text(nm, v[0], { size: 13, weight: "SemiBold", c: C.text }); if (i === 0) pill(b, nm, "Default", "neutral");
      b.text(r, v[1] === "US" ? "US English" : "UK English", { size: 13, c: C.t2, w: 150 }); b.text(r, v[2], { size: 13, c: C.t2, w: 100 }); const gw = b.row(r, { w: 100 }); pill(b, gw, `Grade ${v[3]}`, GT[v[3]]); b.frame(r, { w: "fill", h: 1 }); b.icon(r, "heart", 16, i === 0 ? "#0069CC" : C.quiet); });
  }),
  win("G14", "Voices · cloning unavailable", "Design-only (v1.1): Chatterbox is not installed, so Clone a voice is disabled and a banner links to Engines with the requirement checks.", (b, t, c) => {
    const col = page(b, shell(b, t, c, { nav: "voices" }), { title: "Voices", lead: "28 Kokoro voices. Cloned voices need Chatterbox.", wide: true, action: (r) => cloneBtn(b, t, r, "Clone a voice", { disabled: true }) });
    const bn = b.row(col, { w: "fill", pad: [12, 16], gap: 12, r: 10, fill: "#FFEBCF" }); b.icon(bn, "alertCircle", 18, "#9A5200");
    const q = b.col(bn, { w: "fill", gap: 2 }); b.text(q, "Cloning needs Chatterbox (2.4 GB)", { size: 13, weight: "SemiBold", c: C.text }); b.text(q, "NVIDIA GPU found: GeForce RTX 3060. 8 GB or more of video memory: 12 GB. Chatterbox: not installed.", { size: 12, c: C.t2, lh: 15, w: "fill" });
    K.btn(b, t, bn, "Open Engines", { v: "secondary", sz: "sm", iconRight: "arrowRight" });
    voicesTools(b, t, col);
    const g = b.row(col, { w: "fill", gap: 12, align: "start", clip: false }); [0, 1, 2].forEach((i) => voiceCard(b, t, g, VOICES[i], i, 141, { def: i === 0 }));
  }),
  win("G3", "Clone · choose reference", "Design-only (v1.1): pick a clip to upload or record. Continue stays disabled until a clip is added and the consent box is ticked.", (b, t, c) => clonePage(b, t, c, "Clone a voice", "Give Chatterbox 10 to 30 seconds of one person speaking clearly.", (col) => {
    const g = b.row(col, { w: "fill", gap: 12, align: "start", clip: false });
    [["upload", "Upload a clip", "WAV, MP3 or M4A, up to 30 seconds."], ["mic", "Record now", "Read a few sentences aloud."]].forEach(([ic, a, d]) => { const k = card(b, g, { pad: 16, gap: 8 }); const t1 = b.frame(k, { w: 32, h: 32, r: 8, fill: C.well, layout: "horizontal", align: "center", justify: "center" }); b.icon(t1, ic, 18, C.quiet); h3(b, k, a, d); });
    const cb = b.row(col, { w: "fill", gap: 10, align: "start" }); K.checkbox(b, t, cb, false); b.text(cb, "This is my own voice, or I have the permission of the person speaking.", { size: 13, c: C.text, w: "fill" });
  }, (f) => { K.btn(b, t, f, "Cancel"); K.btn(b, t, f, "Continue", { v: "primary", disabled: true }); })),
  win("G4", "Clone · recording", "Design-only (v1.1): Stop button, 0:08 / 0:30 timer with the 0:10 minimum, live input level. Continue is disabled while recording.", (b, t, c) => clonePage(b, t, c, "Clone a voice", "Recording. Read a few sentences aloud in your normal voice.", (col) => {
    const k = card(b, col, { pad: 20, gap: 16 }); const h = b.row(k, { w: "fill", justify: "spaceBetween" }); b.text(h, "0:08 / 0:30", { size: 22, weight: "SemiBold", c: C.text }); K.btn(b, t, h, "Stop", { v: "primary", icon: "stop" });
    meter(b, k, 0.42); b.text(k, "Keep recording until at least 0:10.", { size: 12, c: C.t2 });
  }, (f) => { K.btn(b, t, f, "Cancel"); K.btn(b, t, f, "Continue", { v: "primary", disabled: true }); })),
  win("G15", "Clone · review take", "Design-only (v1.1): play the take back, record again or use it. All three clip checks pass.", (b, t, c) => clonePage(b, t, c, "Clone a voice", "Listen to your take before it is used.", (col) => {
    const k = card(b, col, { pad: 20, gap: 16 }); const h = b.row(k, { w: "fill", gap: 12 }); K.btn(b, t, h, "Play take", { v: "secondary", icon: "play" }); b.text(h, "0:14", { size: 13, c: C.t2 });
    checkRow(b, k, true, "Length", "14 seconds, between 10 and 30."); checkRow(b, k, true, "Noise", "Background noise is low."); checkRow(b, k, true, "Single speaker", "Only one voice found.");
  }, (f) => { K.btn(b, t, f, "Record again"); K.btn(b, t, f, "Use this take", { v: "primary" }); })),
  win("G5", "Clone · analyzing", "Design-only (v1.1): three visible steps including loading Chatterbox onto the GPU, with percentage.", (b, t, c) => clonePage(b, t, c, "Clone a voice", "Analyzing your clip. This takes about a minute.", (col) => {
    const k = card(b, col, { pad: 20, gap: 14 });
    [["circleCheck", C.ok, "Clip received"], ["loader", "#0069CC", "Loading Chatterbox onto the GPU, 64%"], ["circleCheck", C.field, "Learning the voice"]].forEach(([ic, co, s], i) => { const r = b.row(k, { gap: 10 }); b.icon(r, ic as string, 18, co as string); b.text(r, s as string, { size: 13, weight: i === 1 ? "Medium" : "Regular", c: i === 2 ? C.t3 : C.text }); });
    bar(b, k, 0.64); b.text(k, "About 40 seconds left", { size: 12, c: C.t2 });
  }, (f) => K.btn(b, t, f, "Cancel"))),
  win("G6", "Clone · name and test", "Design-only (v1.1): name the voice, hear a test sentence and tune exaggeration (0.50 is neutral).", (b, t, c) => clonePage(b, t, c, "Clone a voice", "Your voice is ready. Name it and hear a test.", (col) => {
    const k = card(b, col, { pad: 20, gap: 16 }); const f = b.col(k, { w: "fill", gap: 8 }); b.text(f, "Name", { size: 12, weight: "Medium", c: C.t2 }); K.input(b, t, f, { value: "Maya", w: "fill" });
    const h = b.row(k, { w: "fill", gap: 12 }); K.btn(b, t, h, "Play test", { v: "secondary", icon: "play" }); b.text(h, "Hello, I am Maya. This is how I sound when reading to you.", { size: 13, c: C.t2, w: "fill" });
    sliderRow(b, t, k, "Exaggeration", "Higher is more expressive.", 0.5, "0.50", "Calm", "Dramatic");
  }, (f) => { K.btn(b, t, f, "Cancel"); K.btn(b, t, f, "Save voice", { v: "primary" }); })),
  win("G7", "Clone · bad reference", "Design-only (v1.1): the clip check names what failed. Next actions are choose another file or record again.", (b, t, c) => clonePage(b, t, c, "Clone a voice", "This clip cannot be used yet.", (col) => {
    const k = card(b, col, { pad: 20, gap: 16 });
    checkRow(b, k, false, "Length", "6 seconds. Use a clip of 10 to 30 seconds."); checkRow(b, k, false, "Noise", "Too much background noise. Try a quieter room."); checkRow(b, k, true, "Single speaker", "Only one voice found.");
  }, (f) => { K.btn(b, t, f, "Choose another file", { icon: "upload" }); K.btn(b, t, f, "Record", { v: "primary", icon: "mic" }); })),
  win("G11", "Chatterbox · voice style", "Design-only (v1.1): a dialog opened from Style on a cloned voice. Sliders show their values.", (b, t, c) => {
    voicesPage(b, t, shell(b, t, c, { nav: "voices" })); scrim(b, c);
    dialog(b, t, c, 440, "Voice style: Maya", (d) => { sliderRow(b, t, d, "Exaggeration", "0.50 is neutral.", 0.5, "0.50", "Calm", "Dramatic"); sliderRow(b, t, d, "Pace", "How fast the voice speaks.", 0.4, "0.40", "Slow", "Fast"); }, (f) => { K.btn(b, t, f, "Reset"); K.btn(b, t, f, "Done", { v: "primary" }); });
  }),
  win("G17", "Engines · Chatterbox not installed", "Design-only (needs a GPU machine): the optional engine row with the GPU it found, the Not installed pill and Install.", (b, t, c) => enginesPage(b, t, shell(b, t, c, { nav: "engines" }), engRows(CB()))),
  win("G9", "Engines · Chatterbox installing", "Design-only (needs a GPU machine): Installing 42% pill with a spinner, the setup note and a thin progress bar.", (b, t, c) =>
    enginesPage(b, t, shell(b, t, c, { nav: "engines" }), engRows(CB({ note: "Setting up the engine.", progress: 0.42, pill: { label: "Installing 42%", tone: "blue", spin: true }, actions: [] })))),
  win("G16", "Engines · Chatterbox ready", "Design-only (needs a GPU machine): installed and ready, not in use: Use this engine and Remove.", (b, t, c) =>
    enginesPage(b, t, shell(b, t, c, { nav: "engines" }), engRows(CB({ pill: { label: "Ready", tone: "green" }, actions: [{ label: "Use this engine" }, { label: "Remove", danger: true }] })))),
  win("G18", "Engines · remove confirmation", "Design-only (not captured): Remove asks first; its files are deleted and cloned voices stop working until it is installed again.", (b, t, c) => {
    enginesPage(b, t, shell(b, t, c, { nav: "engines" }), engRows(CB({ pill: { label: "Ready", tone: "green" }, actions: [{ label: "Use this engine" }, { label: "Remove", danger: true }] }))); scrim(b, c);
    dialog(b, t, c, 440, "Remove Chatterbox?", (d) => b.text(d, "Its files are deleted from this computer. Cloned voices made with it stop working until you install it again.", { size: 14, c: C.t3, lh: 20, w: "fill" }), (f) => { K.btn(b, t, f, "Cancel", { sz: "dlg" }); K.btn(b, t, f, "Remove", { v: "danger", sz: "dlg" }); });
  }),
  { id: "O1", group: "G", title: "Engine states · board", note: "Design-only board: every state of an engine row (shared/engines.ts) with the title bar pill and footer text that go with it.", w: 1720, h: 1000, build: (b, t, root) => {
    b.rect(root, { x: 0, y: 0, w: 1720, h: 1000, fill: "#F0F0F0" });
    b.text(root, "Engine states", { x: 60, y: 36, size: 24, weight: "SemiBold", c: C.text }); b.text(root, "Row on the Engines page, title bar pill and footer text. Active engine: Kokoro-82M.", { x: 60, y: 70, size: 13, c: C.t2 });
    const nb = { extra: undefined } as Partial<ER>;
    const S8: [string, ER, string, PT, string, string?][] = [
      ["Ready", KOKORO(), "Ready", "green", "Kokoro ready"],
      ["Unloaded", KOKORO({ note: "Not in memory (0 MB). It loads when you press play.", pill: { label: "Unloaded", tone: "neutral" }, actions: [{ label: "Load now" }] }), "Unloaded · Wakes on play", "neutral", "Voice engine asleep", "moon"],
      ["Loading", KOKORO({ note: "Loading into memory.", pill: { label: "Loading", tone: "blue", spin: true } }), "Loading", "blue", "Loading the voice engine", "loader"],
      ["Downloading", KOKORO({ note: "Downloading the model files.", progress: 0.42, pill: { label: "Download 42%", tone: "blue", spin: true } }), "Download 42%", "blue", "Downloading the voice engine", "loader"],
      ["Installing (Chatterbox)", CB({ ...nb, note: "Setting up the engine.", progress: 0.63, pill: { label: "Installing 63%", tone: "blue", spin: true }, actions: [] }), "Ready", "green", "Kokoro ready"],
      ["Not installed (Chatterbox)", CB({ ...nb }), "Ready", "green", "Kokoro ready"],
      ["Unavailable (Chatterbox)", CB({ ...nb, note: "Needs a graphics card with enough memory; none was found.", pill: { label: "Unavailable", tone: "orange" }, actions: [] }), "Ready", "green", "Kokoro ready"],
      ["Error", KOKORO({ note: "huggingface.co, connection reset (ECONNRESET)", pill: { label: "Error", tone: "red" }, actions: [{ label: "Retry" }] }), "Error", "red", "Voice engine error"],
    ];
    S8.forEach(([k, e, tp, tone, ft, ic], i) => {
      const x = 60 + (i % 2) * 820, y = 120 + Math.floor(i / 2) * 215;
      const cell = b.col(root, { x, y, w: 780, gap: 8, clip: false });
      b.text(cell, k.toUpperCase(), { size: 11, weight: "SemiBold", c: C.t3, ls: 0.5 });
      const cd = b.col(cell, { w: "fill", r: 10, fill: "#FFFFFF", shadow: "ring", clip: false }); engineRow(b, t, cd, e);
      const m = b.row(cell, { gap: 12 }); b.text(m, "Title bar", { size: 12, c: C.t3 }); pill(b, m, tp, tone, ic);
      b.text(m, "Footer", { size: 12, c: C.t3 }); b.text(m, ft, { size: 12, c: C.t2 });
    });
  } },
];
