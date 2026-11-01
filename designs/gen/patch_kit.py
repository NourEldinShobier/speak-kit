import re
s = open('kit.ts', encoding='utf8').read()

def replace_block(name, new):
    global s
    m = re.search(r'export const ' + name + r' = ', s)
    assert m, name
    start = m.start()
    # block ends at next top-level "export const " or "// ----------"
    nxt = re.search(r'\nexport const |\n// -{5,}', s[m.end():])
    end = m.end() + nxt.start() + 1 if nxt else len(s)
    s = s[:start] + new.strip('\n') + '\n' + s[end:]

# ---- tokens: darker tertiary text for 4.5:1
s = s.replace('text2: "#5E574E", text3: "#8F887D"', 'text2: "#4F4940", text3: "#6B655B"')
s = s.replace('text2: "#B9B2A7", text3: "#857E73"', 'text2: "#C4BDB2", text3: "#9D968B"')
s = s.replace('hlSent: "#3B3216"', 'hlSent: "#4A3E18"')

# ---- toggle with On/Off text
replace_block('toggle', '''
export const toggle = (b: B, t: T, p: Ref | undefined, on: boolean) => {
  const f = b.row(p, { w: 56, h: 26, r: 13, fill: on ? t.accent : t.mode === "dark" ? "#5A544D" : "#7C766B", pad: [0, 4], gap: 4, justify: "spaceBetween", align: "center" });
  if (on) { b.text(f, "On", { size: 12, weight: "Bold", c: t.accentText, w: 22 }); b.ellipse(f, { w: 20, h: 20, fill: "#FFFFFF" }); }
  else { b.ellipse(f, { w: 20, h: 20, fill: "#FFFFFF" }); b.text(f, "Off", { size: 12, weight: "Bold", c: "#FFFFFF", w: 22, ta: "right" }); }
  return f;
};
''')

# ---- slider with numeric readout (range labels optional)
s = s.replace('export const input = ', '''export const slider = (b: B, t: T, p: Ref | undefined, v: number, w: number, o: { label?: string; min?: string; max?: string } = {}) => {
  const row = b.row(p, { gap: 14, align: "center" });
  const col = b.col(row, { gap: 4 });
  bar(b, t, col, v, w, { h: 6 });
  if (o.min || o.max) { const lr = b.row(col, { w, justify: "spaceBetween" }); b.text(lr, o.min ?? "", { size: 12, c: t.text3 }); b.text(lr, o.max ?? "", { size: 12, c: t.text3 }); }
  if (o.label) b.text(row, o.label, { size: 14, weight: "Bold", c: t.text, w: 56, ta: "right" });
  return row;
};
export const input = ''', 1)

# ---- Windows 11 Chrome frame
replace_block('browser', '''
export const browser = (b: B, t: T, root: Ref, o: { url?: string; title?: string; w?: number; h?: number; ext?: boolean } = {}) => {
  const { url = "reader.example.com/essays/local-first", title = "The quiet return of local-first software", w = 1280, h = 800, ext = true } = o;
  const dk = t.mode === "dark";
  const win = b.col(root, { x: 0, y: 0, w, h, fill: t.surface, gap: 0, clip: true, r: 12, stroke: t.border, sw: 1 });
  const tabs = b.row(win, { w: "fill", h: 38, fill: t.chrome, pad: [8, 0, 0, 10], gap: 6, align: "end", justify: "spaceBetween" });
  const left = b.row(tabs, { gap: 6, align: "end" });
  const tab = b.row(left, { h: 30, w: 220, pad: [0, 12], gap: 8, r: [8, 8, 0, 0], fill: t.chrome2 });
  b.icon(tab, "globe", 13, t.text3); b.text(tab, title.slice(0, 24) + "...", { size: 12, c: dk ? "#E8EAED" : "#202124", w: "fill" }); b.icon(tab, "x", 12, t.text3);
  const plus = b.frame(left, { w: 28, h: 28, layout: "horizontal", align: "center", justify: "center" }); b.icon(plus, "plus", 14, t.text3);
  const caps = b.row(tabs, { h: 30, gap: 0, align: "center" });
  [["minus", 14], ["square", 12], ["x", 14]].forEach(([ic, sz]) => { const c = b.frame(caps, { w: 46, h: 30, layout: "horizontal", align: "center", justify: "center" }); b.icon(c, ic as string, sz as number, dk ? "#E8EAED" : "#3C4043", { sw: 1.5 }); });
  const tool = b.row(win, { w: "fill", h: 42, fill: t.chrome2, pad: [0, 12], gap: 12 });
  b.icon(tool, "arrowLeft", 16, t.text3); b.icon(tool, "arrowRight", 16, t.text3); b.icon(tool, "refresh", 15, t.text3);
  const addr = b.row(tool, { w: "fill", h: 30, r: 15, fill: dk ? "#202124" : "#FFFFFF", pad: [0, 14], gap: 8 });
  b.icon(addr, "lock", 12, t.text3); b.text(addr, url, { size: 12.5, c: dk ? "#E8EAED" : "#3C4043" });
  b.icon(tool, "puzzle", 16, t.text3);
  if (ext) { const e = b.frame(tool, { w: 30, h: 30, r: 8, fill: "none", layout: "horizontal", align: "center", justify: "center" }); logo(b, t, e, 20); }
  b.ellipse(tool, { w: 22, h: 22, fill: dk ? "#5F6368" : "#9AA0A6" });
  b.icon(tool, "moreV", 16, t.text3);
  return b.frame(win, { w: "fill", h: "fill", fill: dk ? "#17161A" : "#FFFFFF", clip: true });
};
''')

# ---- current word: background only, no weight or padding change
s = s.replace('const g = b.row(f, { h: lh - 6, pad: cur ? [0, 3] : 0, r: 5, fill: cur ? t.hlWord : "none" });', 'const g = b.row(f, { h: lh - 6, pad: 0, r: 3, fill: cur ? t.hlWord : "none" });')
s = s.replace('b.text(g, word, { size, lh: lh - 6, c: cur ? t.hlWordText : t.text, weight: cur ? "SemiBold" : "Regular" });', 'b.text(g, word, { size, lh: lh - 6, c: cur ? t.hlWordText : t.text });')

# ---- article: hovered paragraph gets tint + gutter button + tooltip, not clipped
s = s.replace('const wrap = b.frame(a, { layout: "horizontal", w, h: "hug", gap: 0, align: "start" });', 'const wrap = b.frame(a, { layout: "horizontal", w, h: "hug", gap: 0, align: "start", clip: false, fill: hover === i ? t.accent + "12" : "none", r: 8 });')
s = s.replace('''      const g = b.frame(wrap, { abs: true, x: -44, y: 0, w: 32, h: 32, r: 16, fill: t.accent, layout: "horizontal", align: "center", justify: "center", shadow: "md" });
      b.icon(g, "play", 14, t.accentText);''', '''      const g = b.frame(wrap, { abs: true, x: -48, y: 2, w: 32, h: 32, r: 16, fill: t.accent, layout: "horizontal", align: "center", justify: "center", shadow: "md" });
      b.icon(g, "play", 14, t.accentText);
      const tip = b.row(wrap, { abs: true, x: -48, y: 40, h: 26, pad: [0, 10], r: 6, fill: "#1A1714" }); b.text(tip, "Read from here", { size: 12, weight: "Medium", c: "#FFFFFF" });''')

# ---- dock redesign
replace_block('dock', '''
export const dock = (b: B, t: T, p: Ref | undefined, state: "idle" | "playing" | "paused" | "loading" | "error" | "done", o: O = {}) => {
  const f = b.row(p, { h: 56, pad: [0, 8, 0, 14], gap: 10, r: 28, fill: t.mode === "dark" ? "#2A2725" : "#1A1714", shadow: "lg", ...o });
  const wc = "#FFFFFF"; const dim = "#C4BDB2";
  logo(b, t, f, 28);
  if (state === "error") {
    b.icon(f, "alertCircle", 18, "#FF9A8F"); b.text(f, "SpeakKit isn't running", { size: 13, weight: "SemiBold", c: wc });
    const r = b.row(f, { h: 32, pad: [0, 14], r: 16, fill: t.accent }); b.text(r, "Open app", { size: 12.5, weight: "SemiBold", c: t.accentText });
    const rt = b.row(f, { h: 32, pad: [0, 12], r: 16, fill: "#FFFFFF1F" }); b.text(rt, "Retry", { size: 12.5, weight: "SemiBold", c: wc });
    b.icon(f, "moreV", 16, dim); return f;
  }
  if (state === "idle") {
    const x = b.col(f, { gap: 0 }); b.text(x, "Read this page", { size: 13, weight: "SemiBold", c: wc }); b.text(x, "6 min 48 s at 1.2x", { size: 12, c: dim });
    const pb = b.frame(f, { w: 40, h: 40, r: 20, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(pb, "play", 16, t.accentText);
    b.icon(f, "moreV", 16, dim); return f;
  }
  skip(b, f, "back", 24, wc);
  const pb = b.frame(f, { w: 40, h: 40, r: 20, fill: t.accent, layout: "horizontal", align: "center", justify: "center" });
  if (state === "loading") b.icon(pb, "loader", 18, t.accentText, { sw: 2.2 }); else b.icon(pb, state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 16, t.accentText);
  skip(b, f, "fwd", 24, wc);
  const mid = b.col(f, { gap: 5, w: 170 });
  const tr = b.row(mid, { w: "fill", justify: "spaceBetween" });
  b.text(tr, state === "loading" ? "Preparing voice..." : state === "done" ? "Finished" : state === "paused" ? "Paused" : "Reading", { size: 12, weight: "Medium", c: wc });
  b.text(tr, state === "done" ? "6:48" : state === "loading" ? "--:--" : "2:27 / 6:48", { size: 12, c: dim, mono: true });
  bar(b, { ...t, border: "#FFFFFF40" }, mid, state === "done" ? 1 : state === "loading" ? 0 : 0.36, 170, { h: 6, knob: true });
  const sp = b.row(f, { h: 28, pad: [0, 10], r: 14, fill: "#FFFFFF1F" }); b.text(sp, "1.2x", { size: 12.5, weight: "SemiBold", c: wc });
  const vc = b.row(f, { h: 28, pad: [0, 8, 0, 4], gap: 6, r: 14, fill: "#FFFFFF1F" }); avatar(b, t, vc, "H", 20, 0); b.icon(vc, "down", 12, dim);
  b.icon(f, "moreV", 16, dim);
  return f;
};
''')

# ---- player bar with options
replace_block('playerBar', '''
export const playerBar = (b: B, t: T, p: Ref | undefined, state: "playing" | "paused" | "loading" | "done" = "playing", o: { title?: string; sub?: string; elapsed?: string; total?: string; pct?: number; disabled?: boolean; sleep?: string } = {}) => {
  const { title = "The quiet return of local-first software", sub = "Heart · Kokoro-82M", elapsed = "2:27", total = "6:48", pct = 0.36, disabled = false, sleep } = o;
  const f = b.row(p, { w: "fill", h: 84, pad: [0, 24], gap: 24, fill: t.surface, justify: "spaceBetween", opacity: disabled ? 0.55 : undefined });
  const l = b.row(f, { gap: 12, w: 320 });
  const cov = b.frame(l, { w: 44, h: 44, r: 10, fill: t.accentSoft, layout: "horizontal", align: "center", justify: "center" }); b.icon(cov, "headphones", 20, t.accent);
  const lt = b.col(l, { gap: 2, w: "fill" }); b.text(lt, title, { size: 13, weight: "SemiBold", c: t.text, w: "fill", maxLines: 1 }); b.text(lt, sub, { size: 12, c: t.text3 });
  const c = b.col(f, { gap: 8, align: "center", w: 520 });
  const ctr = b.row(c, { gap: 18 });
  b.icon(ctr, "skipBack", 18, t.text2); skip(b, ctr, "back", 26, t.text);
  const pb = b.frame(ctr, { w: 44, h: 44, r: 22, fill: t.accent, layout: "horizontal", align: "center", justify: "center" });
  if (state === "loading") b.icon(pb, "loader", 20, t.accentText); else b.icon(pb, state === "playing" ? "pause" : state === "done" ? "refresh" : "play", 18, t.accentText);
  skip(b, ctr, "fwd", 26, t.text); b.icon(ctr, "skipFwd", 18, t.text2);
  const tl = b.row(c, { gap: 10, w: "fill" });
  b.text(tl, state === "done" ? total : elapsed, { size: 12, c: t.text3, mono: true }); bar(b, t, tl, state === "done" ? 1 : pct, 400, { knob: true }); b.text(tl, total, { size: 12, c: t.text3, mono: true });
  const r = b.row(f, { gap: 10, w: 320, justify: "max" });
  const sp = b.row(r, { h: 30, pad: [0, 12], r: 15, fill: t.surface2 }); b.text(sp, "1.2x", { size: 12.5, weight: "SemiBold", c: t.text });
  if (sleep) { const sl = b.row(r, { h: 30, pad: [0, 10], gap: 6, r: 15, fill: t.accentSoft }); b.icon(sl, "moon", 14, t.accent); b.text(sl, sleep, { size: 12, weight: "SemiBold", c: t.accent, mono: true }); } else iconBtn(b, t, r, "moon", { size: 32, c: t.text2 });
  iconBtn(b, t, r, "volume", { size: 32, c: t.text2 }); iconBtn(b, t, r, "playlist", { size: 32, c: t.text2 });
  return f;
};
''')

# ---- sidebar status card is state-aware
s = s.replace('export const desktopWindow = (b: B, t: T, root: Ref, o: { title?: string; nav?: "library" | "voices" | "engines" | "settings" | "none"; w?: number; h?: number } = {}) => {',
              'export const desktopWindow = (b: B, t: T, root: Ref, o: { title?: string; nav?: "library" | "voices" | "engines" | "settings" | "none"; w?: number; h?: number; status?: { label: string; sub: string; tone: "ok" | "warn" | "err" } } = {}) => {')
s = s.replace('''const r1 = b.row(st, { gap: 8 }); b.ellipse(r1, { w: 8, h: 8, fill: t.ok }); b.text(r1, "Kokoro-82M · Ready", { size: 12.5, weight: "SemiBold", c: t.text });
    b.text(st, "CPU · 0.4x real time", { size: 11.5, c: t.text3 });
    const r2 = b.row(st, { gap: 6 }); b.icon(r2, "lock", 12, t.ok); b.text(r2, "100% on this device", { size: 11.5, c: t.ok, weight: "Medium" });''',
 '''const sv = o.status ?? { label: "Kokoro-82M · Ready", sub: "CPU · 0.4x real time", tone: "ok" as const };
    const tc = sv.tone === "ok" ? t.ok : sv.tone === "warn" ? t.warn : t.err;
    const r1 = b.row(st, { gap: 8 }); b.icon(r1, sv.tone === "ok" ? "circleCheck" : "alertCircle", 14, tc); b.text(r1, sv.label, { size: 12.5, weight: "SemiBold", c: t.text });
    b.text(st, sv.sub, { size: 12, c: t.text2 });
    const r2 = b.row(st, { gap: 6 }); b.icon(r2, "lock", 12, t.ok); b.text(r2, "100% on this device", { size: 12, c: t.ok, weight: "Medium" });''')
open('kit.ts', 'w', encoding='utf8').write(s)
print('patched', len(s))
