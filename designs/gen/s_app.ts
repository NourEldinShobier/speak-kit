import { B, Ref } from "./lib";
import * as K from "./kit";
import { T } from "./kit";
import { S } from "./types";

const W = 1280, H = 800;
const STATUS = { label: "Kokoro-82M · Ready", sub: "Fast: 2.5x faster than real time", tone: "ok" as const };
const dim = (b: B, t: T, win: Ref, x = 0, y = 0, w = W, h = H) => b.rect(win, { abs: true, x, y, w, h, fill: t.overlay });
const dialog = (b: B, t: T, win: Ref, w: number, y: number, o: Record<string, any> = {}) => K.dialogBox(b, t, win, w, y, o, W);
const dHead = K.dialogHead;
const dFoot = (b: B, t: T, d: Ref, left?: string, ...btns: [string, any, boolean?][]) => K.dialogFoot(b, t, d, left, (r) => btns.forEach(([l, o, focus]) => K.btn(b, t, r, l, { sz: "dlg", ...o, state: focus ? "focus" : undefined })));
// small triangle that points at a trigger; dir = side of the popover it sits on
const caret = (b: B, t: T, win: Ref, x: number, y: number, dir: "down" | "up") => {
  b.add("node.create", { type: "vector", path: dir === "down" ? "M0 0H14L7 8Z" : "M0 8L7 0L14 8Z", width: 14, height: 8, x, y: dir === "down" ? y - 1 : y, absolute: true, parent: win, props: { fill: t.raised, stroke: "none" } });
  b.add("node.create", { type: "vector", path: dir === "down" ? "M0 0L7 7L14 0" : "M0 7L7 0L14 7", width: 14, height: 7, x, y, absolute: true, parent: win, props: { fill: "none", stroke: t.control, strokeWeight: 1, strokeCap: "round", strokeJoin: "round" } });
};
const kebab = (b: B, t: T, p: Ref, on = false) => K.iconBtn(b, t, p, "dots", { size: 30, bg: on ? t.selected : undefined });
const popBox = (b: B, t: T, win: Ref, x: number, y: number, w: number, o: Record<string, any> = {}) => K.popover(b, t, win, { abs: true, x, y, w, ...o } as any);
const centered = (b: B, win: Ref, x: number, y: number, w: number, h = 44) => b.row(win, { abs: true, x, y, w, h, justify: "center", align: "center" } as any);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// text with the matched part highlighted
const hlRow = (b: B, t: T, p: Ref | undefined, text: string, q: string | undefined, o: { size?: number; weight?: string; c?: string } = {}) => {
  const { size = 14, weight = "Regular", c = t.text } = o;
  const r = b.row(p, { gap: 0 });
  (q ? text.split(new RegExp(`(${esc(q)})`, "i")) : [text]).forEach((s) => { if (!s) return; const m = !!q && s.toLowerCase() === q.toLowerCase(); const lead = !m && /^\s/.test(s) ? Math.round(size * 0.28) : 0, trail = !m && /\s$/.test(s) ? Math.round(size * 0.28) : 0; const f = b.row(r, { pad: [1, m ? 2 : trail, 1, m ? 2 : lead], r: 3, fill: m ? t.hlWord + "88" : "none" }); b.text(f, m ? s : s.trim(), { size, weight, c }); });
  return r;
};
// paragraph word by word; mark(word, index) returns a fill/colour for words to mark
const markPara = (b: B, t: T, p: Ref, text: string, w: number, mark?: (word: string, i: number) => { fill?: string; c?: string } | undefined, o: { size?: number; lh?: number; weight?: string } = {}) => {
  const { size = 19, lh = 32, weight = "Regular" } = o;
  const row = b.frame(p, { layout: "horizontal", wrap: true, gap: 0, crossGap: 0, w, h: "hug", align: "start" });
  text.split(/\s+/).forEach((word, i) => { const m = mark?.(word, i); const f = b.row(row, { h: lh, pad: [0, 5, 0, 0], gap: 0 }); const g = b.row(f, { h: lh - 6, r: 3, pad: m ? [0, 2] : 0, fill: m?.fill ?? "none" }); b.text(g, word, { size, lh: lh - 6, weight, c: m?.c ?? t.text }); });
  return row;
};

// ===================== D: first-run setup =====================
type OB = "welcome" | "engine" | "engine-nogpu" | "download" | "dlfail" | "pair" | "pairok" | "pairskip";
const steps = ["Welcome", "Engine", "Download", "Browser", "Done"];
const IDX: Record<OB, number> = { welcome: 0, engine: 1, "engine-nogpu": 1, download: 2, dlfail: 2, pair: 3, pairok: 4, pairskip: 4 };
const onboard = (id: string, title: string, note: string, st: OB, dark = false): S => ({
  id, group: "D", title, note, w: W, h: H, dark,
  build: (b, t, root) => {
    const { main } = K.desktopWindow(b, t, root, { nav: "none" });
    const idx = IDX[st];
    // fixed top offset: stepper, then top-aligned body, then one footer row
    const c = b.col(main, { w: "fill", h: "fill", align: "center", pad: [32, 60, 28, 60], gap: 28 });
    const sr = b.row(c, { gap: 8 });
    steps.forEach((s, i) => { const on = i <= idx; const x = b.row(sr, { gap: 6 }); const d = b.frame(x, { w: 22, h: 22, r: 11, fill: on ? t.accent : t.surface2, layout: "horizontal", align: "center", justify: "center" }); if (i < idx) b.icon(d, "check", 12, t.accentText); else b.text(d, `${i + 1}`, { size: 12, weight: "Bold", c: on ? t.accentText : t.text3 }); b.text(x, s, { size: 12.5, weight: i === idx ? "SemiBold" : "Medium", c: i === idx ? t.text : t.text3 }); if (i < 4) b.rect(sr, { w: 28, h: 2, fill: i < idx ? t.accent : t.border }); });
    const body = b.col(c, { w: 760, h: "fill", align: "center", gap: 18 });
    const foot = b.row(c, { w: 760, justify: "spaceBetween" });
    const head = (s: string, sub: string) => { b.text(body, s, { size: 30, weight: "Bold", c: t.text, ta: "center", w: "fill" }); b.text(body, sub, { size: 15, c: t.text2, ta: "center", w: "fill" }); };
    const back = () => K.btn(b, t, foot, "Back", { v: "ghost", icon: "arrowLeft" });
    const next = (label: string, o: any = {}) => K.btn(b, t, foot, label, { v: "primary", sz: "lg", iconRight: "arrowRight", ...o });

    if (st === "welcome") {
      K.logo(b, t, body, 72, { r: 20 });
      b.text(body, "Read anything out loud.", { size: 40, weight: "Bold", c: t.text, ta: "center", w: "fill" });
      b.text(body, "On your own computer. No account, no cloud, no limits.", { size: 18, c: t.text2, ta: "center", w: "fill" });
      const r = b.row(body, { gap: 16, pad: [10, 0], align: "start" });
      [["lock", "Private", "Text never leaves this device"], ["zap", "Fast", "Starts speaking in about a second"], ["globe", "Everywhere", "Web pages, PDFs, any text"]].forEach(([ic, a, d]) => { const x = K.card(b, t, r, { w: 242, h: 150, pad: 18, gap: 6 }); const i = b.frame(x, { w: 36, h: 36, r: 10, fill: t.accentSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(i, ic, 18, t.accent); b.text(x, a, { size: 15, weight: "Bold", c: t.text }); b.text(x, d, { size: 13, c: t.text2, w: "fill", lh: 18 }); });
      b.text(foot, "Setup takes about 3 minutes", { size: 13, c: t.text3 }); next("Get started");
    } else if (st === "engine" || st === "engine-nogpu") {
      const gpu = st === "engine";
      head("Choose a voice engine", "You can add or switch engines any time in Engines.");
      const hw = b.row(body, { w: "fill", pad: [12, 16], gap: 12, r: 12, fill: t.surface2, align: "start" });
      b.icon(hw, "cpu", 18, t.text2);
      const hc = b.col(hw, { gap: 4, w: "fill" });
      b.text(hc, gpu ? "This PC: Intel Core i7-12700 · 32 GB RAM · NVIDIA GeForce RTX 3060 (12 GB)" : "This PC: Intel Core i5-1135G7 · 16 GB RAM · Intel Iris Xe (no NVIDIA GPU)", { size: 13, c: t.text2, w: "fill" });
      const vr = b.row(hc, { gap: 6 }); b.icon(vr, gpu ? "circleCheck" : "alertCircle", 15, gpu ? t.ok : t.warn);
      b.text(vr, gpu ? "RTX 3060 · 12 GB VRAM: meets Chatterbox requirements" : "No NVIDIA GPU: Chatterbox isn't available here. Kokoro runs well on your CPU.", { size: 13, weight: "SemiBold", c: t.text });
      const r = b.row(body, { w: "fill", gap: 16, align: "start" });
      const eng = (o: { n: string; tag: string; tn: any; pts: string[]; req: string; ok: boolean; size: string; sel: boolean; locked?: boolean; link?: string }) => {
        const x = b.col(r, { w: "fill", h: 262, pad: 20, gap: 12, r: 16, fill: t.surface, stroke: o.sel ? t.accent : t.border, sw: o.sel ? 2 : 1, sa: "inside" });
        const h = b.row(x, { w: "fill", gap: 10 });
        if (o.locked) b.icon(h, "lock", 20, t.text3);
        else K.radio(b, t, h, !!o.sel);
        b.text(h, o.n, { size: 18, weight: "Bold", c: t.text, w: "fill" }); K.badge(b, t, h, o.tag, o.tn);
        o.pts.forEach((p) => { const q = b.row(x, { w: "fill", gap: 8, align: "start" }); const d = b.frame(q, { w: 14, h: 19, layout: "horizontal", align: "center", justify: "center" }); b.ellipse(d, { w: 5, h: 5, fill: t.text3 }); b.text(q, p, { size: 13, c: t.text2, w: "fill", lh: 19 }); });
        b.rect(x, { w: "fill", h: 1, fill: t.border });
        const q = b.row(x, { w: "fill", gap: 8, align: "start" }); b.icon(q, o.ok ? "circleCheck" : "alertCircle", 16, o.ok ? t.ok : t.warn);
        const qc = b.col(q, { w: "fill", gap: 3 }); b.text(qc, o.req, { size: 13, weight: "Medium", c: t.text, w: "fill", lh: 18 }); if (o.link) b.text(qc, o.link, { size: 13, weight: "SemiBold", c: t.accent });
        b.frame(x, { w: "fill", h: "fill" });
        const f = b.row(x, { w: "fill", justify: "spaceBetween" }); b.text(f, `Download ${o.size}`, { size: 12.5, c: t.text2 }); K.btn(b, t, f, "Hear sample", { v: "ghost", sz: "sm", icon: "play" });
      };
      eng({ n: "Kokoro-82M", tag: "Recommended", tn: "ok", pts: ["Natural English voices, 28 to choose from", "About 1 second to first word"], req: "Runs on any PC, CPU only", ok: true, size: "330 MB", sel: true });
      eng({ n: "Chatterbox", tag: "Optional", tn: "neutral", pts: ["Expressive, with emotion control", "Clone a voice from 10 seconds of audio"], req: gpu ? "Requirements met: NVIDIA GPU with CUDA, 12 GB VRAM (needs 8 GB+)" : "Needs an NVIDIA GPU with CUDA and 8 GB+ VRAM. None found on this PC.", ok: gpu, size: "2.4 GB", sel: false, locked: !gpu, link: gpu ? undefined : "Which GPUs are supported?" });
      b.text(body, gpu ? "Selected: Kokoro (330 MB). Select Chatterbox as well to download both (2.7 GB)." : "Kokoro (330 MB) will run on your CPU at about 2.5x real time.", { size: 13, c: t.text2, ta: "center", w: "fill" });
      back(); next("Download Kokoro", { icon: "download", iconRight: undefined });
    } else if (st === "download" || st === "dlfail") {
      const ok = st === "download";
      head(ok ? "Downloading Kokoro-82M" : "Download paused", ok ? "One time only. After this, SpeakKit works fully offline." : "The connection dropped at 62%. Everything downloaded so far is kept.");
      const cd = K.card(b, t, body, { w: "fill", pad: 22, gap: 12 });
      const hd = b.row(cd, { w: "fill", justify: "spaceBetween" }); b.text(hd, "204 MB of 330 MB", { size: 15, weight: "SemiBold", c: t.text }); b.text(hd, ok ? "12.4 MB/s · about 10 s left" : "Paused", { size: 13, weight: ok ? "Regular" : "SemiBold", c: ok ? t.text2 : t.warn });
      K.bar(b, ok ? t : { ...t, accent: t.warn }, cd, 0.62, 716, { knob: false });
      const files: [string, string, number][] = [["kokoro-v1.0.q8.onnx", "Model · 92 MB", 1], ["voices-v1.0.bin", "28 voices · 27 MB", 1], ["espeak-ng-data", "Phonemizer · 85 of 211 MB", 0.4]];
      files.forEach(([n, d, p]) => {
        const r = b.row(cd, { w: "fill", gap: 12, pad: [4, 0] }); const done = p >= 1;
        b.icon(r, done ? "circleCheck" : ok ? "loader" : "alertCircle", 18, done ? t.ok : ok ? t.accent : t.warn);
        const x = b.col(r, { gap: 1, w: "fill" }); b.text(x, n, { size: 13.5, weight: "Medium", c: t.text, mono: true }); b.text(x, d, { size: 12, c: t.text2 });
        K.progress(b, { ...t, border: t.border }, r, p, { w: 140, c: done ? t.ok : ok ? t.accent : t.warn });
        const bw = b.row(r, { w: 74, justify: "max" }); K.badge(b, t, bw, done ? "Done" : ok ? "40%" : "Paused", done ? "ok" : ok ? "neutral" : "warn", done ? "check" : undefined);
      });
      if (ok) {
        K.divider(b, t, cd);
        const nx = b.row(cd, { w: "fill", gap: 12, opacity: 0.7 } as any); const nb = b.frame(nx, { w: 22, h: 22, r: 11, stroke: t.text3, sw: 1.5, dashes: [3, 3], layout: "horizontal", align: "center", justify: "center" } as any); b.text(nb, "4", { size: 12, weight: "Bold", c: t.text2 });
        const nc = b.col(nx, { gap: 1, w: "fill" }); b.text(nc, "Next: connect your browser", { size: 13.5, weight: "Medium", c: t.text }); b.text(nc, "Install the extension and pair it, about a minute.", { size: 12, c: t.text2 });
        b.text(cd, "At this speed it takes under a minute. Continue in the background to set up your browser now; the download finishes on its own and SpeakKit tells you when the voice is ready. Adding Chatterbox later (2.4 GB) takes several minutes.", { size: 12.5, c: t.text2, w: "fill", lh: 18 });
      } else {
        const e = b.row(cd, { w: "fill", pad: 12, gap: 10, r: 10, fill: t.warnSoft, align: "start" }); b.icon(e, "alertCircle", 18, t.warn);
        const ec = b.col(e, { gap: 3, w: "fill" }); b.text(ec, "Lost the connection to the model server.", { size: 13.5, weight: "SemiBold", c: t.text }); b.text(ec, "Check your internet connection, then retry. Downloading resumes from 85 MB.", { size: 12.5, c: t.text2, w: "fill", lh: 18 }); b.text(ec, "Details: huggingface.co, connection reset (ECONNRESET)", { size: 12, c: t.text3, mono: true });
        const o1 = b.row(cd, { w: "fill", gap: 12, justify: "spaceBetween" }); const oc = b.col(o1, { gap: 1, w: "fill" }); b.text(oc, "Already have the file?", { size: 13.5, weight: "Medium", c: t.text }); b.text(oc, "Pick espeak-ng-data.tar.gz (211 MB) from your Downloads folder.", { size: 12, c: t.text2 }); K.btn(b, t, o1, "Choose file…", { v: "secondary", icon: "folder" });
        const o2 = b.row(cd, { w: "fill", gap: 12, justify: "spaceBetween" }); const oc2 = b.col(o2, { gap: 1, w: "fill" }); b.text(oc2, "Retry automatically", { size: 13.5, weight: "Medium", c: t.text }); b.text(oc2, "Try again every 30 seconds while this window is open. On a work network? ", { size: 12, c: t.text2 }); b.text(oc2, "Proxy settings…", { size: 12.5, weight: "SemiBold", c: t.accent }); K.toggle(b, t, o2, true);
      }
      K.btn(b, t, foot, "Cancel", { v: "ghost" });
      if (ok) next("Continue in background"); else K.btn(b, t, foot, "Retry download", { v: "primary", sz: "lg", icon: "refresh" });
    } else if (st === "pair") {
      head("Connect your browser", "Two quick steps so Chrome, Edge or Brave can use the voice engine on this computer.");
      const cd = K.card(b, t, body, { w: "fill", pad: 20, gap: 14 });
      const num = (r: Ref, n: string) => { const nb = b.frame(r, { w: 30, h: 30, r: 15, fill: t.accentSoft, layout: "horizontal", align: "center", justify: "center" }); b.text(nb, n, { size: 14, weight: "Bold", c: t.accent }); };
      const r1 = b.row(cd, { w: "fill", gap: 14, align: "start" }); num(r1, "1");
      const x1 = b.col(r1, { gap: 8, w: "fill" }); b.text(x1, "Install the extension", { size: 15, weight: "SemiBold", c: t.text }); b.text(x1, "Add SpeakKit from the Chrome Web Store. It also installs in Edge and Brave.", { size: 13, c: t.text2, w: "fill", lh: 19 });
      const pin = b.row(x1, { gap: 8 }); const e1 = b.frame(pin, { w: 28, h: 28, r: 8, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(e1, "puzzle", 15, t.text2); b.icon(pin, "arrowRight", 14, t.text3); const e2 = b.frame(pin, { w: 28, h: 28, r: 8, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(e2, "pin", 15, t.text2); b.icon(pin, "arrowRight", 14, t.text3); const e3 = b.frame(pin, { w: 28, h: 28, r: 8, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); K.logo(b, t, e3, 20); b.text(pin, "Open the puzzle menu, pin SpeakKit to the toolbar", { size: 12.5, c: t.text2 });
      K.btn(b, t, r1, "Open Web Store", { v: "secondary", icon: "external" });
      K.divider(b, t, cd);
      const r2 = b.row(cd, { w: "fill", gap: 14, align: "start" }); num(r2, "2");
      const x2 = b.col(r2, { gap: 8, w: "fill" }); b.text(x2, "Pair it with this app", { size: 15, weight: "SemiBold", c: t.text }); b.text(x2, "Copy the token below and paste it in the extension under Options > General > Pairing token.", { size: 13, c: t.text2, w: "fill", lh: 19 });
      const tk = b.row(x2, { w: "fill", gap: 8 }); const tf = b.row(tk, { w: "fill", h: 38, pad: [0, 12], r: 9, fill: t.surface2, stroke: t.border, sw: 1 }); b.text(tf, "skt_••••-••••-••••-VH8W", { size: 14, mono: true, c: t.text }); K.btn(b, t, tk, "Reveal", { v: "secondary", icon: "eye" }); K.btn(b, t, tk, "Copy", { v: "primary", icon: "copy" });
      K.divider(b, t, cd);
      const w = b.row(cd, { w: "fill", gap: 10, align: "start" }); b.icon(w, "loader", 16, t.accent); const wc = b.col(w, { gap: 2, w: "fill" }); b.text(wc, "Waiting for the extension to pair…", { size: 13.5, weight: "Medium", c: t.text }); b.text(wc, "Details: listening on 127.0.0.1:51730", { size: 12, c: t.text3, mono: true });
      const fw = b.row(cd, { w: "fill", pad: 10, gap: 10, r: 10, fill: t.infoSoft, align: "start" }); b.icon(fw, "info", 16, t.info); b.text(fw, "If Windows asks about the firewall, choose Private networks, or Cancel. SpeakKit only listens on 127.0.0.1.", { size: 12.5, c: t.text2, w: "fill", lh: 18 });
      back(); const rg = b.row(foot, { gap: 10 }); K.btn(b, t, rg, "Skip for now", { v: "ghost" }); K.btn(b, t, rg, "Continue", { v: "primary", sz: "lg", iconRight: "arrowRight", disabled: true });
    } else {
      const paired = st === "pairok";
      head("You're all set", paired ? "Kokoro is ready and the extension is paired. Press play to hear your voice." : "Kokoro is ready. Press play to hear your voice.");
      const cd = K.card(b, t, body, { w: "fill", pad: 20, gap: 14 });
      const r = b.row(cd, { w: "fill", gap: 14 });
      const ic = b.frame(r, { w: 40, h: 40, r: 20, fill: paired ? t.okSoft : t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, paired ? "check" : "puzzle", 20, paired ? t.ok : t.text2);
      const x = b.col(r, { gap: 2, w: "fill" }); b.text(x, paired ? "Browser extension connected" : "Browser extension not connected", { size: 15, weight: "SemiBold", c: t.text }); b.text(x, paired ? "Paired today at 12:04 · SpeakKit 0.4.2" : "You can connect it later in Settings > Browser integration.", { size: 12.5, c: t.text2 });
      if (!paired) K.btn(b, t, r, "Connect now", { v: "secondary", sz: "sm" });
      K.divider(b, t, cd); b.text(cd, "“Notes, documents and even voices lived on someone else's server, rented back to us by the month.”", { size: 16, c: t.text, w: "fill", lh: 25 });
      const p = b.row(cd, { w: "fill", gap: 14 }); const pb = b.frame(p, { w: 44, h: 44, r: 22, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "play", 18, t.accentText); const pc = b.col(p, { gap: 1 }); b.text(pc, "Play sample", { size: 13.5, weight: "SemiBold", c: t.text }); b.text(pc, "0:08", { size: 12, c: t.text2, mono: true }); K.waveform(b, t, p, 330, 28, 0.3); b.frame(p, { w: "fill", h: 1 }); K.select(b, t, p, "Heart", 120);
      const hd = K.card(b, t, body, { w: "fill", pad: 18, gap: 12 }); b.text(hd, "Handy to know", { size: 14, weight: "Bold", c: t.text });
      const hr = (fn: (l: Ref) => void, txt: string, fn2?: (r: Ref) => void) => { const q = b.row(hd, { w: "fill", gap: 12 }); const l = b.row(q, { w: 130, gap: 8 }); fn(l); b.text(q, txt, { size: 13, c: t.text2, w: "fill" }); fn2?.(q); };
      hr((l) => K.kbd(b, t, l, ["Ctrl", "Alt", "S"]), "Reads the text you selected, in any app.");
      hr((l) => { const e = b.frame(l, { w: 28, h: 28, r: 8, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(e, "headphones", 15, t.text2); b.text(l, "Tray icon", { size: 13, weight: "SemiBold", c: t.text }); }, "Lives in the system tray. Windows 11 may hide it under the ^ arrow; drag the icon out to keep it in view.");
      hr((l) => b.text(l, "Startup", { size: 13, weight: "SemiBold", c: t.text }), "Launch SpeakKit when you sign in to Windows.", (q) => K.toggle(b, t, q, true));
      back(); next("Open library");
    }
  },
});
export const D: S[] = [
  onboard("D1", "Welcome", "First launch. One promise: local, private, fast.", "welcome"),
  onboard("D2", "Choose engine (GPU found)", "Hardware verdict line; selectable engine cards, the button follows the selection.", "engine"),
  onboard("D3", "Choose engine (no GPU)", "Chatterbox is locked with the reason and a link instead of failing later.", "engine-nogpu"),
  onboard("D4", "Downloading models", "Per-file progress, speed and ETA, the next step dimmed, can continue in the background.", "download"),
  onboard("D5", "Download paused", "Resumable. Retry, choose a file you downloaded yourself, auto-retry and proxy options.", "dlfail"),
  onboard("D6", "Connect your browser", "Install, pin, then paste the pairing token. Continue stays disabled until the extension pairs.", "pair"),
  onboard("D7", "Ready: hear a sample", "Pairing confirmed. Press play to hear the voice; tips for the shortcut, tray and startup.", "pairok"),
  onboard("D8", "Welcome (dark)", "Dark theme variant.", "welcome", true),
  onboard("D9", "Ready: extension skipped", "Setup finished without pairing; the extension can be connected later in Settings > Browser integration.", "pairskip"),
];

// ===================== E: library =====================
type Kind = "web" | "pdf" | "doc" | "paste";
type It = { n: string; s: string; k: Kind; d: string; p: number; when: string; left?: string; snip?: string };
const ITEMS: It[] = [
  { n: "The quiet return of local-first software", s: "reader.example.com", k: "web", d: "6:48", p: 0.36, when: "Today", left: "4:21 left" },
  { n: "Attention Is All You Need.pdf", s: "arxiv.org · 15 pages", k: "pdf", d: "42:30", p: 0.12, when: "Today", left: "37 min left" },
  { n: "Meeting notes: Q4 planning", s: "Pasted text", k: "paste", d: "3:05", p: 1, when: "Yesterday" },
  { n: "How small speech models got good", s: "blog.example.org", k: "web", d: "6:40", p: 0, when: "Mon", snip: "…small enough to run local on a laptop, with no server round trip…" },
  { n: "Thesis chapter 3 (draft).docx", s: "Local file · 24 pages", k: "doc", d: "1:12:09", p: 0.74, when: "Oct 27", left: "19 min left" },
  { n: "Privacy by default", s: "docs.example.com", k: "web", d: "3:21", p: 1, when: "Oct 25" },
];
const NEWIT: It = { n: "Why on-device voices finally sound human", s: "blog.example.org · 1,520 words", k: "web", d: "8:00", p: 0, when: "Today" };
type LB = "empty" | "items" | "add" | "drag" | "drag-multi" | "drag-bad" | "fetching" | "fail" | "search" | "nosearch" | "menu" | "delete" | "delete-paste" | "deleted" | "added";
const searchField = (b: B, t: T, r: Ref, value?: string, count?: string) => {
  const f = b.row(r, { w: 300, h: 38, pad: [0, value ? 8 : 12, 0, 12], gap: 8, r: 9, fill: t.surface, stroke: value ? t.accent : t.border, sw: value ? 2 : 1, sa: "inside" });
  b.icon(f, "search", 15, t.text3); b.text(f, value ?? "Search title, source or text", { size: 13, c: value ? t.text : t.text3, w: "fill" });
  if (value) { b.text(f, count ?? "", { size: 12, c: t.text3 }); K.iconBtn(b, t, f, "x", { size: 24, c: t.text2 }); }
};
const listRow = (b: B, t: T, list: Ref, it: It, i: number, q?: string, active = false) => {
  if (i) K.divider(b, t, list);
  const r = b.row(list, { w: "fill", h: it.snip && q ? 84 : 64, pad: [0, 18], gap: 14, fill: active ? t.surface2 : "none" });
  const a = b.frame(r, { w: 40, h: 40, r: 10, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" });
  if (it.k === "pdf" || it.k === "doc") b.text(a, it.k === "pdf" ? "PDF" : "DOC", { size: 12, weight: "Bold", c: t.text2 }); else b.icon(a, it.k === "web" ? "globe" : "clipboard", 18, t.text2);
  const x = b.col(r, { gap: 3, w: "fill" });
  hlRow(b, t, x, it.n, q, { size: 14, weight: "SemiBold" }); hlRow(b, t, x, it.s, q, { size: 12.5, c: t.text2 }); if (it.snip && q) hlRow(b, t, x, it.snip, q, { size: 12.5, c: t.text2 });
  const st = b.col(r, { w: 150, gap: 4 });
  if (it.p > 0 && it.p < 1) { K.bar(b, t, st, it.p, 150, { knob: false }); b.text(st, `${Math.round(it.p * 100)}% · ${it.left}`, { size: 12, c: t.text2 }); } else if (it.p >= 1) K.badge(b, t, st, "Finished", "ok", "check"); else K.badge(b, t, st, "New", "accent");
  b.text(r, it.d, { size: 12.5, c: t.text2, mono: true, w: 64, ta: "right" }); b.text(r, it.when, { size: 12.5, c: t.text2, w: 64, ta: "right" });
  kebab(b, t, r, active);
};
const library = (id: string, title: string, note: string, st: LB, dark = false): S => ({
  id, group: "E", title, note, w: W, h: H, dark,
  build: (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "library", status: STATUS });
    const searching = st === "search" || st === "nosearch";
    const q = st === "search" ? "local" : st === "nosearch" ? "quantum" : undefined;
    const base = st === "deleted" ? [ITEMS[2], ITEMS[3], ITEMS[4], ITEMS[5]] : st === "added" ? [NEWIT, ...ITEMS.slice(1)] : ITEMS.slice(1);
    const sub = st === "empty" ? "Nothing here yet" : st === "deleted" ? "5 readings · 1h 32m of audio" : st === "added" ? "7 readings · 2h 23m of audio" : "6 readings · 2h 15m of audio";
    K.pageHeader(b, t, main, "Library", sub, st === "empty" ? undefined : (r) => { searchField(b, t, r, q, st === "search" ? "3 of 6" : "0 of 6"); K.btn(b, t, r, "Add", { v: "primary", icon: "plus" }); });
    let menuAt: Ref | undefined;
    if (st === "empty") {
      const c = b.col(main, { w: "fill", h: "fill", pad: [16, 32, 32, 32], gap: 20 });
      const dz = b.col(c, { w: "fill", h: 340, r: 20, stroke: t.border, sw: 2, dashes: [8, 6], align: "center", justify: "center", gap: 12, fill: t.surface } as any);
      const ic = b.frame(dz, { w: 60, h: 60, r: 30, fill: t.accentSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "upload", 26, t.accent);
      b.text(dz, "Drop a PDF, document or text file here", { size: 20, weight: "Bold", c: t.text }); b.text(dz, "PDF, EPUB, DOCX, TXT, Markdown, HTML.", { size: 14, c: t.text2 });
      const r = b.row(dz, { gap: 10, pad: [4, 0, 0, 0] }); K.btn(b, t, r, "Choose file", { v: "primary", sz: "lg", icon: "folder" }); K.btn(b, t, r, "Paste text", { v: "ghost", sz: "lg", icon: "clipboard" }); K.btn(b, t, r, "From web address", { v: "ghost", sz: "lg", icon: "link" });
      const tips = b.row(c, { w: "fill", gap: 16 });
      [["globe", "Read the web", "Install the browser extension to listen to any page.", "Connect extension"], ["clipboard", "Read anything you copy", "Press Ctrl+Alt+C to hear the clipboard from any app.", "Change shortcut"], ["mic", "Pick your voice", "28 Kokoro voices. Add Chatterbox for cloning.", "Browse voices"]].forEach(([i, a, d, l]) => { const x = K.card(b, t, tips, { w: "fill", pad: 18, gap: 6 }); b.icon(x, i, 20, t.accent); b.text(x, a, { size: 15, weight: "Bold", c: t.text }); b.text(x, d, { size: 13, c: t.text2, w: "fill", lh: 19 }); b.text(x, l, { size: 13, weight: "SemiBold", c: t.accent }); });
    } else {
      const c = b.col(main, { w: "fill", h: "fill", pad: [8, 32, 24, 32], gap: 18 });
      if (!searching) {
        const hero = b.row(c, { w: "fill", pad: 20, gap: 20, r: 16, fill: t.accentSoft });
        const cv = b.frame(hero, { w: 84, h: 84, r: 14, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(cv, "headphones", 38, t.accentText);
        const x = b.col(hero, { gap: 4, w: "fill" }); b.text(x, "CONTINUE LISTENING", { size: 12, weight: "SemiBold", c: t.accent, ls: 1 }); b.text(x, ITEMS[0].n, { size: 20, weight: "Bold", c: t.text }); b.text(x, "reader.example.com · 2:27 of 6:48 · Heart", { size: 13, c: t.text2 }); K.bar(b, t, x, 0.36, 520, { knob: false });
        K.btn(b, t, hero, "Resume", { v: "primary", sz: "lg", icon: "play" });
      }
      if (st !== "nosearch") { const fr = b.row(c, { w: "fill", justify: "spaceBetween" }); const fl = b.row(fr, { gap: 8 }); ["All", "Web pages", "PDFs and files", "Pasted text", "Unfinished"].forEach((s, i) => K.chip(b, t, fl, s, i === 0)); K.select(b, t, fr, "Sort: Recently played", 190); }
      if (st === "search") b.text(c, "3 of 6 readings match “local”", { size: 13, weight: "Medium", c: t.text2 });
      if (st === "nosearch") {
        const e = K.card(b, t, c, { w: "fill", pad: 56, align: "center", gap: 10 });
        const ic = b.frame(e, { w: 52, h: 52, r: 26, fill: t.surface2, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "search", 22, t.text2);
        b.text(e, "No results for “quantum”", { size: 17, weight: "Bold", c: t.text }); b.text(e, "Nothing in your library mentions “quantum”. Search covers titles, sources and text.", { size: 13.5, c: t.text2 });
        const r = b.row(e, { gap: 10, pad: [6, 0, 0, 0] }); K.btn(b, t, r, "Clear search", { v: "primary" }); K.btn(b, t, r, "Add text", { v: "secondary", icon: "plus" });
      } else {
        const list = K.card(b, t, c, { w: "fill", pad: 0, gap: 0 });
        const rows = st === "search" ? [ITEMS[0], ITEMS[4], ITEMS[3]] : base;
        rows.forEach((it, i) => listRow(b, t, list, it, i, q, st === "menu" && i === 0));
      }
    }
    const dh = Math.round(H);
    if (st === "menu") {
      const m = b.col(win, { abs: true, x: 1004, y: 384, w: 226, pad: 6, gap: 0, r: 10, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" } as any);
      [["play", "Play", "Enter"], ["edit", "Rename", "F2"], ["download", "Export audio…", ""], ["pin", "Pin to top", ""], ["mic", "Change voice…", ""], ["circleCheck", "Mark as finished", ""], ["folder", "Show in folder", ""], ["-", "", ""], ["trash", "Delete", "Del"]].forEach(([i, l, k]) => { if (i === "-") { b.rect(m, { w: "fill", h: 1, fill: t.border } as any); return; } const r = b.row(m, { w: "fill", h: 34, pad: [0, 10], gap: 10, r: 6, justify: "spaceBetween" }); const lf = b.row(r, { gap: 10 }); b.icon(lf, i, 15, l === "Delete" ? t.err : t.text2); b.text(lf, l, { size: 13, c: l === "Delete" ? t.err : t.text }); if (k) b.text(r, k, { size: 12, c: t.text3 }); });
    }
    if (st === "add" || st === "fetching" || st === "fail") {
      dim(b, t, win); const d = dialog(b, t, win, 640, 110); dHead(b, t, d, "Add to library", "Paste text, a web address, or open a file.");
      const bd = b.col(d, { w: "fill", pad: [0, 24, 20, 24], gap: 14 }); K.seg(b, t, bd, ["Paste text", "Web address", "File"], st === "add" ? 0 : 1);
      if (st === "add") {
        K.input(b, t, bd, { placeholder: "Title (optional, defaults to the first line)", h: 38 });
        const ta = b.col(bd, { w: "fill", h: 150, pad: 14, r: 10, fill: t.surface, stroke: t.accent, sw: 2, sa: "inside" }); b.text(ta, "For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server…", { size: 14, c: t.text, w: "fill", lh: 22 });
        const r = b.row(bd, { w: "fill", justify: "spaceBetween" }); b.text(r, "412 words · about 2 min 10 s at 1.2x", { size: 12.5, c: t.text2 }); K.select(b, t, r, "Heart · American English", 220);
      } else {
        const ro = st === "fetching";
        const uf = b.row(bd, { w: "fill", h: 42, pad: [0, 12], gap: 8, r: 9, fill: ro ? t.surface2 : t.surface, stroke: ro ? t.border : t.err, sw: ro ? 1 : 2, sa: "inside" }); b.icon(uf, "link", 15, t.text3); b.text(uf, "https://blog.example.org/on-device-voices", { size: 13, c: ro ? t.text2 : t.text, w: "fill" }); if (ro) { b.icon(uf, "lock", 13, t.text3); b.text(uf, "Read-only while fetching", { size: 12, c: t.text3 }); }
        if (ro) {
          const r = b.row(bd, { w: "fill", gap: 12, pad: [2, 0] }); b.icon(r, "loader", 18, t.accent); const x = b.col(r, { gap: 1 }); b.text(x, "Extracting the article…", { size: 13.5, weight: "Medium", c: t.text }); b.text(x, "Page downloaded. Removing menus, ads and comments.", { size: 12, c: t.text2 });
          const pv = b.row(bd, { w: "fill", pad: 14, gap: 12, r: 10, fill: t.surface2, stroke: t.border, sw: 1, align: "start" }); const g = b.frame(pv, { w: 40, h: 40, r: 10, fill: t.surface, layout: "horizontal", align: "center", justify: "center" }); b.icon(g, "globe", 18, t.text2);
          const x2 = b.col(pv, { gap: 4, w: "fill" }); b.text(x2, "TITLE FOUND", { size: 12, weight: "SemiBold", c: t.text3, ls: 1 }); b.text(x2, "Why on-device voices finally sound human", { size: 15, weight: "Bold", c: t.text }); b.text(x2, "blog.example.org · counting words…", { size: 12.5, c: t.text2 });
        } else {
          const r = b.row(bd, { w: "fill", pad: 14, gap: 12, r: 10, fill: t.errSoft, align: "start" }); b.icon(r, "alertCircle", 18, t.err); const x = b.col(r, { gap: 3, w: "fill" });
          b.text(x, "Couldn't read this page", { size: 14, weight: "SemiBold", c: t.text }); b.text(x, "It needs a login, and SpeakKit can't sign in for you. In Chrome, the extension reads pages you're already signed in to.", { size: 13, c: t.text2, w: "fill", lh: 19 }); b.text(x, "Details: blog.example.org answered 403 (sign-in required)", { size: 12, c: t.text3, mono: true });
          const rr = b.row(x, { gap: 14, pad: [4, 0, 0, 0] }); b.text(rr, "Try again", { size: 13, weight: "SemiBold", c: t.accent }); b.text(rr, "How the extension helps", { size: 13, weight: "SemiBold", c: t.accent });
        }
      }
      if (st === "add") dFoot(b, t, d, "Saved on this computer", ["Cancel", { v: "ghost" }], ["Add", { v: "secondary" }], ["Add and play", { v: "primary", icon: "play" }]);
      else if (st === "fetching") dFoot(b, t, d, undefined, ["Cancel", { v: "ghost" }], ["Add and play", { v: "primary", icon: "play", disabled: true }]);
      else dFoot(b, t, d, undefined, ["Cancel", { v: "ghost" }], ["Open in Chrome", { v: "secondary", icon: "external" }], ["Paste text instead", { v: "primary", icon: "clipboard" }]);
    }
    if (st === "drag" || st === "drag-multi" || st === "drag-bad") {
      const bad = st === "drag-bad"; const col = bad ? t.err : t.accent;
      b.rect(win, { abs: true, x: 232, y: 41, w: 1048, h: 759, fill: t.bg + "E6" });
      const z = b.col(win, { abs: true, x: 248, y: 57, w: 1016, h: 727, r: 20, stroke: col, sw: 2, dashes: [10, 8], fill: (bad ? t.errSoft : t.accentSoft) + "F2", align: "center", justify: "center", gap: 14 } as any);
      const ic = b.frame(z, { w: 76, h: 76, r: 38, fill: col, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, bad ? "x" : "download", 34, bad ? "#FFFFFF" : t.accentText);
      b.text(z, bad ? "This file type isn't supported" : st === "drag" ? "Drop to add to your library" : "Drop 3 files to add them", { size: 26, weight: "Bold", c: t.text });
      if (st === "drag") b.text(z, "Attention Is All You Need.pdf · PDF · 15 pages", { size: 14, c: t.text2 });
      else if (bad) { b.text(z, "setup.exe (.exe) can't be read aloud.", { size: 14, c: t.text2 }); b.text(z, "SpeakKit reads PDF, EPUB, DOCX, TXT, Markdown and HTML.", { size: 14, c: t.text2 }); }
      else { const l = b.col(z, { gap: 6, pad: [4, 0, 0, 0] }); ["Attention Is All You Need.pdf · PDF", "Thesis chapter 3 (draft).docx · DOCX", "reading-list.txt · TXT"].forEach((s) => { const r = b.row(l, { gap: 8 }); b.icon(r, "circleCheck", 15, t.ok); b.text(r, s, { size: 14, c: t.text2 }); }); }
      if (bad) b.text(z, "Release to cancel", { size: 13, weight: "SemiBold", c: t.err });
    }
    if (st === "delete" || st === "delete-paste") {
      dim(b, t, win); const d = dialog(b, t, win, 460, 250); const paste = st === "delete-paste";
      dHead(b, t, d, paste ? "Delete this pasted text?" : "Delete this reading?", undefined, false);
      const bd = b.col(d, { w: "fill", pad: [0, 24, 20, 24], gap: 10 });
      b.text(bd, paste ? "“Meeting notes: Q4 planning”" : "“Attention Is All You Need.pdf”", { size: 14, weight: "SemiBold", c: t.text });
      b.text(bd, paste ? "This pasted text exists only in SpeakKit. Deleting it removes the only copy, along with your saved position." : "It will be removed from your library, along with your saved position. The original file on your computer isn't touched.", { size: 14, c: t.text2, w: "fill", lh: 21 });
      dFoot(b, t, d, "You can undo for 10 seconds", ["Cancel", { v: "secondary" }, true], ["Delete", { v: "danger", icon: "trash" }]);
    }
    if (st === "deleted") { const w = centered(b, win, 232, 736, 1048); K.toast(b, t, w, "Deleted “Attention Is All You Need.pdf”", "neutral", { action: "Undo", icon: "trash" }); }
    if (st === "added") { const w = centered(b, win, 232, 736, 1048); K.toast(b, t, w, "Added “Why on-device voices finally sound human” to your library", "ok", { action: "Play" }); }
  },
});
export const E: S[] = [
  library("E1", "Library · empty", "First run with no content: one primary action (Choose file), quieter ways to paste or use a web address.", "empty"),
  library("E2", "Library · with readings", "Continue-listening hero (not repeated in the list), filters, sort, rows with progress and time left.", "items"),
  library("E3", "Add · paste text", "Dialog with optional title, live word count, estimated time, voice; Add or Add and play.", "add"),
  library("E4", "Add · web address fetching", "Field is read-only while fetching; the found title confirms what will be added.", "fetching"),
  library("E5", "Add · web address failed", "Reason in plain words, details behind a line; Paste text instead is the way forward.", "fail"),
  library("E6", "Library · dragging a file", "The whole content area becomes the drop target.", "drag"),
  library("E7", "Library · search results", "Matches highlighted in title, source or text, result count and a clear button.", "search"),
  library("E8", "Library · no search results", "Clear search is the primary action; Add text is secondary.", "nosearch"),
  library("E9", "Library · row menu", "Anchored to the row's trigger: play, rename, export, pin, voice, finished, folder, delete.", "menu"),
  library("E10", "Library · delete confirmation", "Imported file: the original is untouched. Cancel has default focus.", "delete"),
  library("E11", "Library · with readings (dark)", "Dark theme variant.", "items", true),
  library("E12", "Library · deleted toast", "After deleting, a toast offers Undo.", "deleted"),
  library("E13", "Library · added toast", "Success toast after adding; the new reading is at the top.", "added"),
  library("E14", "Library · dragging several files", "Drop target lists each accepted file.", "drag-multi"),
  library("E15", "Library · unsupported file", "Red drop target names the file type and lists the supported ones.", "drag-bad"),
  library("E16", "Library · delete pasted text", "Pasted text has no original, so the copy says it is the only copy.", "delete-paste"),
];

// ===================== F: reader =====================
type RS = "playing" | "paused" | "buffering" | "done" | "outline" | "display" | "sleep" | "voice" | "pdf" | "pdf-scan" | "ocr" | "from-here" | "panel" | "away" | "find";
const MORE = [
  "Local-first does not mean offline-only. Sync still happens, but as a convenience layered on top of files you already hold, rather than a gate you must pass to reach your own work.",
  "The trade is real. Updates are your job to ship, and a model that fits on a laptop will never match the largest one in a data centre. For reading text aloud, almost nobody can tell the difference.",
];
const pdfPage = (b: B, t: T, p: Ref, hl: boolean) => {
  const pg = b.frame(p, { w: 560, h: 690, fill: "#FFFFFF", r: 4, shadow: "md", clip: true });
  b.text(pg, "Attention Is All You Need", { x: 70, y: 56, size: 24, weight: "Bold", c: "#1E1F20" });
  b.text(pg, "Ashish Vaswani · Noam Shazeer · Niki Parmar · Jakob Uszkoreit", { x: 70, y: 92, size: 12, c: "#5E574E" });
  b.text(pg, "Abstract", { x: 70, y: 138, size: 13, weight: "Bold", c: "#1E1F20" });
  const wd = [420, 420, 400, 420, 380, 420, 410, 300, 0, 420, 420, 390, 420, 360, 0, 420, 410, 420, 330, 420, 400, 390];
  let y = 164; wd.forEach((w, i) => { if (!w) { y += 14; return; } if (hl && i >= 3 && i <= 6) b.rect(pg, { x: 66, y: y - 3, w: w + 8, h: 15, r: 3, fill: "#FFF1C2" }); b.rect(pg, { x: 70, y, w, h: 8, r: 2, fill: "#CFC9BF" }); if (hl && i === 4) b.rect(pg, { x: 150, y: y - 3, w: 70, h: 15, r: 3, fill: "#FFD24D" }); y += 21; });
  return pg;
};
const reader = (id: string, title: string, note: string, st: RS, dark = false): S => ({
  id, group: "F", title, note, w: W, h: H, dark,
  build: (b, t, root) => {
    const { win, main } = K.desktopWindow(b, t, root, { nav: "none" });
    const t2: T = dark ? { ...t, hlSent: "#5A4A14" } : t;
    const pdf = st === "pdf" || st === "pdf-scan" || st === "ocr"; const scan = st === "pdf-scan" || st === "ocr";
    const page = st === "pdf" ? 1 : st === "ocr" ? 4 : 9;
    // header: breadcrumb and badge only (the title is in the page itself)
    const bar = b.row(main, { w: "fill", h: 52, pad: [0, 20], justify: "spaceBetween", fill: t.surface });
    const l = b.row(bar, { gap: 10 }); K.iconBtn(b, t, l, "arrowLeft", { size: 32 }); b.text(l, "Library", { size: 13.5, weight: "Medium", c: t.text2 }); K.badge(b, t, l, pdf ? "PDF · 15 pages" : "Web page · reader.example.com", "neutral");
    if (pdf) { const pn = b.row(l, { gap: 2, pad: [0, 0, 0, 8] }); K.iconBtn(b, t, pn, "up", { size: 28 }); b.text(pn, `${page} / 15`, { size: 13, weight: "SemiBold", c: t.text, mono: true }); K.iconBtn(b, t, pn, "down", { size: 28 }); }
    const r = b.row(bar, { gap: 6 });
    K.btn(b, t, r, "Export audio", { v: "ghost", sz: "sm", icon: "download", disabled: scan });
    const tg = (ic: string, on: boolean) => K.iconBtn(b, t, r, ic, { size: 32, bg: on ? t.selected : undefined, c: on ? t.text : t.text2 });
    tg("search", st === "find"); tg("mic", st === "panel"); tg("type", st === "display"); tg("sidebarRight", st === "outline");
    b.rect(main, { w: "fill", h: 1, fill: t.border });
    const mid = b.row(main, { w: "fill", h: "fill", gap: 0, align: "start" });
    if (pdf) {
      const th = b.col(mid, { w: 150, h: "fill", pad: 14, gap: 12, fill: t.surface, align: "center", clip: true });
      const first = st === "ocr" ? 1 : Math.max(1, page - 2);
      for (let i = first; i < first + 5; i++) {
        const f = b.frame(th, { w: 92, h: 120, r: 4, fill: scan ? "#F2EEE6" : "#FFFFFF", stroke: i === page ? t.accent : t.border, sw: i === page ? 2 : 1, sa: "inside" }); b.text(f, `${i}`, { x: 4, y: 100, size: 12, c: "#6F685E" });
        for (let k = 0; k < 7; k++) b.rect(f, { x: 10, y: 14 + k * 10, w: 72, h: 3, r: 1, fill: "#D8D3CB" });
        if (st === "ocr" && i < 4) { const ck = b.frame(f, { x: 66, y: 6, w: 20, h: 20, r: 10, fill: t.ok, layout: "horizontal", align: "center", justify: "center" }); b.icon(ck, "check", 12, "#FFFFFF"); }
      }
      const pc = b.col(mid, { w: "fill", h: "fill", align: "center", pad: [24, 0], fill: t.surface2, clip: true });
      if (scan) {
        const pg = b.frame(pc, { w: 560, h: 690, fill: "#F2EEE6", r: 4, shadow: "md", clip: true }); for (let k = 0; k < 24; k++) b.rect(pg, { x: 70, y: 70 + k * 22, w: 360 + ((k * 37) % 100), h: 9, r: 3, fill: "#BDB6AA" });
        const ov = b.col(win, { abs: true, x: 500, y: 250, w: 420, pad: 24, gap: 12, r: 16, fill: t.surface, stroke: t.border, sw: 1, shadow: "dlg" } as any);
        if (st === "pdf-scan") {
          const ic = b.frame(ov, { w: 44, h: 44, r: 22, fill: t.warnSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "scan", 22, t.warn);
          b.text(ov, "Page 9 is a scanned image", { size: 17, weight: "Bold", c: t.text }); b.text(ov, "There's no text layer to read. Recognize the text (OCR) on this computer to listen to it. Nothing is uploaded.", { size: 13, c: t.text2, w: "fill", lh: 19 });
          K.btn(b, t, ov, "Recognize text on this page", { v: "primary", w: "fill", icon: "scan" }); K.btn(b, t, ov, "Recognize whole document (15 pages)", { v: "secondary", w: "fill" });
        } else {
          const ic = b.frame(ov, { w: 44, h: 44, r: 22, fill: t.accentSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "loader", 22, t.accent);
          b.text(ov, "Recognizing text, page 4 of 15", { size: 17, weight: "Bold", c: t.text }); K.bar(b, t, ov, 4 / 15, 372, { knob: false });
          const pr = b.row(ov, { w: "fill", justify: "spaceBetween" }); b.text(pr, "27%", { size: 13, weight: "SemiBold", c: t.text }); b.text(pr, "About 2 min left", { size: 13, c: t.text2 });
          b.text(ov, "Runs on this PC; nothing is uploaded. You can keep reading other pages that already have text.", { size: 13, c: t.text2, w: "fill", lh: 19 }); K.btn(b, t, ov, "Cancel", { v: "secondary", w: "fill" });
        }
      } else pdfPage(b, t, pc, true);
    } else {
      const away = st === "away";
      const col = b.col(mid, { w: "fill", h: "fill", align: "center", pad: [36, 0], clip: true });
      const a = b.col(col, { w: 700, gap: 18 });
      const hlq = st === "find" ? "software" : undefined; const cur = (i: number) => i === 0;
      const mk = (c0: boolean) => ({ fill: c0 ? t.accent : t.hlWord + "99", c: c0 ? t.accentText : t.text });
      if (away) { MORE.forEach((s) => b.text(a, s, { size: 19, lh: 32, c: t.text, w: 700 })); ["The next decade of software may be defined less by what it adds than by what it no longer asks of us: an account, a connection, a subscription.", "Whether that vision wins will not be decided by benchmarks. It will be decided by small, ordinary moments: the tool that opens instantly on a train, the document that is still there next year, the voice that never asks you to sign in.", "That is the quiet part. Nobody announces it. One day a person notices that nothing they rely on needs permission from a server, and wonders why it was ever different."].forEach((s) => b.text(a, s, { size: 19, lh: 32, c: t.text, w: 700 })); }
      else {
        if (hlq) markPara(b, t, a, ARTICLE_TITLE, 700, (w) => (w.toLowerCase().startsWith(hlq) ? mk(true) : undefined), { size: 34, lh: 40, weight: "Bold" }); else b.text(a, ARTICLE_TITLE, { size: 34, weight: "Bold", lh: 40, c: t.text, w: "fill" });
        b.text(a, "Maya Okafor · October 28, 2026 · 1,290 words", { size: 14, c: t.text2 });
        const hl = st === "done" || hlq ? undefined : { sent: 1, word: 6 };
        let n = 1;
        K.ARTICLE.paras.forEach((tx, i) => {
          if (i === 0 && hl) K.para(b, t2, a, tx, 700, { size: 19, lh: 32, hl });
          else if (hlq) markPara(b, t, a, tx, 700, (w) => (w.toLowerCase().startsWith(hlq) ? mk(cur(n++)) : undefined));
          else if (st === "from-here" && i === 1) markPara(b, t, a, tx, 700, (_, k) => (k === 17 ? { fill: t.accentSoft, c: t.text } : undefined));
          else b.text(a, tx, { size: 19, lh: 32, c: t.text, w: 700 });
          if (st === "from-here" && i === 0) { /* reading continues in paragraph one */ }
        });
      }
      if (away) { b.rect(col, { abs: true, x: 1262, y: 150, w: 6, h: 140, r: 3, fill: t.border } as any); }
    }
    if (st === "outline") { const p = b.col(mid, { w: 320, h: "fill", pad: 18, gap: 10, fill: t.surface, stroke: t.border, sw: 1 }); b.text(p, "Outline", { size: 15, weight: "Bold", c: t.text }); ["Introduction", "The appeal of local work", "Speed and privacy", "A bet on disappearing software"].forEach((s, i) => { const x = b.row(p, { w: "fill", pad: [9, 10], gap: 10, r: 8, fill: i === 0 ? t.accentSoft : "none" }); b.text(x, `${i + 1}`, { size: 12, weight: "Bold", c: i === 0 ? t.accent : t.text3, mono: true }); b.text(x, s, { size: 13, weight: i === 0 ? "SemiBold" : "Regular", c: i === 0 ? t.text : t.text2, w: "fill" }); if (i === 0) b.icon(x, "volume", 14, t.accent); }); K.divider(b, t, p); const bh = b.row(p, { w: "fill", justify: "spaceBetween" }); b.text(bh, "BOOKMARKS", { size: 12, weight: "SemiBold", c: t.text3, ls: 1 }); K.btn(b, t, bh, "Add bookmark", { v: "ghost", sz: "sm", icon: "bookmark" }); const bk = b.row(p, { w: "fill", gap: 8, align: "start" }); b.icon(bk, "bookmark", 15, t.accent); const bc = b.col(bk, { gap: 1, w: "fill" }); b.text(bc, "“…rented back to us by the month.”", { size: 12.5, c: t.text, w: "fill" }); b.text(bc, "Paragraph 1 · 0:41", { size: 12, c: t.text3 }); }
    if (st === "panel") {
      const p = b.col(mid, { w: 340, h: "fill", pad: 20, gap: 16, fill: t.surface, stroke: t.border, sw: 1 });
      b.text(p, "Voice", { size: 15, weight: "Bold", c: t.text });
      const cv = b.row(p, { w: "fill", pad: 12, gap: 12, r: 12, fill: t.accentSoft }); K.avatar(b, t, cv, "H", 40, 0); const cc = b.col(cv, { gap: 2, w: "fill" }); b.text(cc, "Heart", { size: 14, weight: "Bold", c: t.text }); b.text(cc, "US English · Kokoro", { size: 12.5, c: t.text2 }); K.btn(b, t, cv, "Change", { v: "secondary", sz: "sm" });
      b.text(p, "RECENT VOICES", { size: 12, weight: "SemiBold", c: t.text3, ls: 1 });
      [["Heart", "US English · Female", true], ["Michael", "US English · Male", false], ["Emma", "British English · Female", false]].forEach(([n, m, on], i) => { const q = b.row(p, { w: "fill", pad: [6, 8], gap: 10, r: 8, fill: on ? t.surface2 : "none" }); K.avatar(b, t, q, n as string, 30, [0, 3, 5][i]); const qc = b.col(q, { gap: 0, w: "fill" }); b.text(qc, n as string, { size: 13.5, weight: "Medium", c: t.text }); b.text(qc, m as string, { size: 12, c: t.text2 }); if (on) b.icon(q, "check", 16, t.accent); else K.iconBtn(b, t, q, "play", { size: 28, c: t.text2 }); });
      K.divider(b, t, p); b.text(p, "Speed", { size: 14, weight: "Bold", c: t.text }); K.slider(b, t, p, 0.28, 220, { label: "1.2x", min: "0.5x", max: "3x" });
      K.divider(b, t, p); const ad = b.row(p, { w: "fill", justify: "spaceBetween" }); const ac = b.col(ad, { gap: 1 }); b.text(ac, "Advanced", { size: 14, weight: "Bold", c: t.text }); b.text(ac, "Pauses, pronunciation, emphasis", { size: 12.5, c: t.text2 }); b.icon(ad, "down", 16, t.text2);
    }
    // player bar reflects the open document
    const po: any = pdf ? (scan ? { title: "Rental agreement (scan).pdf", sub: `Page ${page} of 15 · ${st === "ocr" ? "Recognizing text" : "Waiting for text"}`, elapsed: "0:00", total: "--:--", pct: 0, disabled: true } : { title: "Attention Is All You Need.pdf", sub: "Page 1 of 15 · Heart · Kokoro", elapsed: "5:06", total: "42:30", pct: 0.12 }) : { sub: "Heart · Kokoro", ...(st === "sleep" ? { sleep: "29:12" } : {}) };
    K.playerBar(b, t, main, st === "paused" ? "paused" : st === "done" ? "done" : scan ? "paused" : "playing", po);

    const BAR = 716;
    if (st === "buffering") { const w = centered(b, win, 0, BAR - 60, W); K.toast(b, t, w, "Preparing next paragraph…", "neutral", { icon: "loader" }); }
    if (st === "away") { const w = centered(b, win, 0, BAR - 56, W, 40); const pl = b.row(w, { h: 40, pad: [0, 16], gap: 8, r: 20, fill: t.accent, shadow: "lg" }); b.icon(pl, "up", 16, t.accentText); b.text(pl, "Back to current", { size: 13.5, weight: "SemiBold", c: t.accentText }); }
    if (st === "done") {
      dim(b, t, win); const c = K.card(b, t, win, { abs: true, x: 380, y: 230, w: 520, pad: 28, gap: 12, align: "center", shadow: "dlg" } as any);
      const ic = b.frame(c, { w: 56, h: 56, r: 28, fill: t.okSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(ic, "check", 26, t.ok);
      b.text(c, "Finished reading", { size: 20, weight: "Bold", c: t.text }); b.text(c, "6 min 48 s at 1.2x · 1,290 words", { size: 13, c: t.text2 });
      const mf = b.row(c, { gap: 6 }); b.icon(mf, "circleCheck", 15, t.ok); b.text(mf, "Marked as finished in your library", { size: 13, weight: "Medium", c: t.ok });
      K.btn(b, t, c, "Play next: How small speech models got good", { v: "primary", sz: "lg", w: "fill", iconRight: "arrowRight" }); K.btn(b, t, c, "Replay", { v: "secondary", w: "fill", icon: "refresh" });
    }
    if (st === "from-here") {
      // anchored above the clicked word (accent-tinted) in paragraph two; caret points at it
      const x = 393, y = 392;
      const bb = b.row(win, { abs: true, x, y, h: 38, pad: [0, 8], gap: 6, r: 19, fill: "#1E1F20", shadow: "lg" } as any); const pl = b.row(bb, { h: 28, pad: [0, 10], gap: 6, r: 14, fill: t.accent }); b.icon(pl, "play", 12, t.accentText); b.text(pl, "Read from here", { size: 12.5, weight: "SemiBold", c: t.accentText }); const cp = b.row(bb, { h: 28, pad: [0, 8], gap: 5, r: 14, fill: "#FFFFFF1F" }); b.icon(cp, "copy", 14, "#FFFFFF"); b.text(cp, "Copy", { size: 12.5, weight: "Medium", c: "#FFFFFF" });
      b.add("node.create", { type: "vector", path: "M0 0H14L7 7Z", width: 14, height: 7, x: x + 40, y: y + 38, absolute: true, parent: win, props: { fill: "#1E1F20", stroke: "none" } });
    }
    if (st === "sleep") {
      const h = 300; const p = popBox(b, t, win, 996, 728 - h, 260, { h, gap: 6 }); caret(b, t, win, 1127, 728, "down");
      const hd = b.row(p, { w: "fill", justify: "spaceBetween" }); b.text(hd, "Sleep timer", { size: 14, weight: "Bold", c: t.text }); const ac = b.row(hd, { gap: 6 }); b.icon(ac, "moon", 14, t.accent); b.text(ac, "Pauses in 29:12", { size: 12.5, weight: "SemiBold", c: t.accent });
      ["Off", "15 minutes", "30 minutes", "60 minutes", "After this paragraph", "Custom…"].forEach((s, i) => { const rr = b.row(p, { w: "fill", h: 34, pad: [0, 10], r: 8, justify: "spaceBetween", fill: i === 2 ? t.accentSoft : "none" }); b.text(rr, s, { size: 13, weight: i === 2 ? "SemiBold" : "Regular", c: i === 2 ? t.accent : t.text }); if (i === 2) b.icon(rr, "check", 14, t.accent); });
    }
    if (st === "voice") {
      const h = 296; const p = popBox(b, t, win, 936, 728 - h, 320, { h, gap: 12 }); caret(b, t, win, 1097, 728, "down");
      b.text(p, "Speed", { size: 14, weight: "Bold", c: t.text }); K.slider(b, t, p, 0.28, 218, { label: "1.2x", min: "0.5x", max: "3x" });
      const pr = b.row(p, { w: "fill", gap: 6 }); ["0.8x", "1x", "1.2x", "1.5x", "2x"].forEach((s, i) => K.chip(b, t, pr, s, i === 2));
      K.divider(b, t, p); b.text(p, "Voice", { size: 14, weight: "Bold", c: t.text });
      const vr = b.row(p, { w: "fill", gap: 8 }); K.select(b, t, vr, "Heart · US English", "fill"); K.badge(b, t, vr, "High quality", "ok");
      const e = b.row(p, { w: "fill", gap: 8, pad: [4, 0, 0, 0] }); K.chip(b, t, e, "Kokoro", true); K.chip(b, t, e, "Chatterbox", false);
    }
    if (st === "display") {
      const h = 396; const c = popBox(b, t, win, 920, 93, 340, { h, pad: 18, gap: 14 }); caret(b, t, win, 1196, 86, "up");
      b.text(c, "Display", { size: 14, weight: "Bold", c: t.text }); K.seg(b, t, c, ["Light", "Sepia", "Dark"], 0);
      const f = b.col(c, { w: "fill", gap: 6 }); b.text(f, "Text size", { size: 13, c: t.text2 }); K.slider(b, t, f, 0.5, 200, { label: "18 px", min: "14", max: "28" });
      const g = b.col(c, { w: "fill", gap: 6 }); b.text(g, "Line spacing", { size: 13, c: t.text2 }); K.slider(b, t, g, 0.6, 200, { label: "1.6", min: "1.2", max: "2.0" });
      const fnt = b.row(c, { w: "fill", justify: "spaceBetween" }); b.text(fnt, "Font", { size: 13, c: t.text2 }); K.select(b, t, fnt, "Inter", 170);
      K.divider(b, t, c);
      const hh = b.row(c, { w: "fill", justify: "spaceBetween" }); b.text(hh, "Follow with auto-scroll", { size: 13, c: t.text }); K.toggle(b, t, hh, true);
      const h2 = b.row(c, { w: "fill", justify: "spaceBetween" }); b.text(h2, "Highlight current word", { size: 13, c: t.text }); K.toggle(b, t, h2, true);
    }
    if (st === "find") {
      const fb = b.row(win, { abs: true, x: 940, y: 102, w: 320, h: 48, pad: [0, 8, 0, 14], gap: 8, r: 12, fill: t.surface, stroke: t.border, sw: 1, shadow: "lg" } as any);
      b.icon(fb, "search", 15, t.text3); b.text(fb, "software", { size: 14, c: t.text, w: "fill" }); b.text(fb, "1 of 3", { size: 12.5, c: t.text2 }); K.iconBtn(b, t, fb, "up", { size: 28, c: t.text2 }); K.iconBtn(b, t, fb, "down", { size: 28, c: t.text2 }); K.iconBtn(b, t, fb, "x", { size: 28, c: t.text2 });
    }
  },
});
const ARTICLE_TITLE = "The quiet return of local-first software";
export const F: S[] = [
  reader("F1", "Reader · playing", "Article with sentence and word highlight; the player bar shows 2:27 of 6:48 at 1.2x.", "playing"),
  reader("F2", "Reader · paused", "Same screen paused.", "paused"),
  reader("F3", "Reader · preparing next paragraph", "Short toast when synthesis falls behind; Pause stays available.", "buffering"),
  reader("F4", "Reader · finished", "Completion card over a scrim: marks the reading finished, plays the next item or replays.", "done"),
  reader("F5", "Reader · read from here", "Click a word: a chip above it offers Read from here and Copy.", "from-here"),
  reader("F6", "Reader · outline and bookmarks", "Right panel with headings and saved bookmarks.", "outline"),
  reader("F7", "Reader · display settings", "Anchored to the Aa button: theme, text size and line spacing with values, font, toggles.", "display"),
  reader("F8", "Reader · sleep timer", "Anchored to the timer in the player bar; shows the 29:12 countdown.", "sleep"),
  reader("F9", "Reader · speed and voice", "Popover from the speed pill: slider with value, presets, voice and engine.", "voice"),
  reader("F10", "PDF reader · playing", "Player bar shows the PDF's own title, page and duration.", "pdf"),
  reader("F11", "PDF reader · scanned page", "Page 9 has no text layer: offer local OCR; the player is disabled until it finishes.", "pdf-scan"),
  reader("F12", "Reader · playing (dark)", "Dark theme variant.", "playing", true),
  reader("F13", "PDF reader · recognizing text", "Local OCR progress: page 4 of 15, time left, cancel.", "ocr"),
  reader("F14", "Reader · voice panel", "Docked right panel: current voice, recent voices, speed slider, advanced.", "panel"),
  reader("F15", "Reader · back to current", "After scrolling away from the spoken sentence, a pill jumps back.", "away"),
  reader("F16", "Reader · search in text", "Find bar with result count and previous/next; matches highlighted.", "find"),
];
