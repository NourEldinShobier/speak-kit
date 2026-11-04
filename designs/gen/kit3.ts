// kit3: "real context" kit. Draws the OS / browser around a built screen so a frame shows what the user really sees.
// Units: 1 design px = 1 CSS px of designs/built/shots. Every function returns Rect(s): {x, y, w, h, ref}.
//   x,y are relative to the `parent` you passed in; `ref` is a frame whose own origin (0,0) is the rect's top-left,
//   so you draw the real UI into `ref` at the same coordinates as in the shot. Light theme only.
//
//   const win = winApp(b, wrap, { w: 1280, h: 800, backdrop: { w: 1440, h: 900 } });   // Electron window on a desktop (+ taskbar)
//   desktopWindow(b, t, win.ref, ...)  /  draw the shot's content at (0,0)-(win.w,win.h) inside win.ref
//     (the app's own 36 px title bar is part of the shot; the 3 caption buttons are drawn ABOVE it at the right, 46x36 each = last 138 px)
//   const c = chromeWin(b, wrap, { w: 1280, h: 800, url: "example.com/a", tabTitle: "A page", extensionPopup: { h: 393 } });
//     c.viewport.ref = page area (draw the page here); c.popup.ref = 360 px popup client (draw the popup shot at 0,0); c.extIcon = Speak Kit toolbar icon rect
//   const d = desktopWithTaskbar(b, wrap, { w: 1440, h: 900, trayActive: true });  // d.flyoutAt(w,h) / d.cornerAt(w,h) / d.toastAt(h, above) -> {x,y} in `wrap` coords
//   winToast(b, wrap, { ...d.toastAt(toastH(T)), title: "Update ready", body: "Speak Kit 1.1.0 is ready to install. Click to choose when." });
//   nativeMenu(b, wrap, { x, y, items: ["Back", "-", { l: "Speak Kit", sub: true, hi: true }] });
// Fonts: Segoe UI (Windows chrome). Real texts of the toasts: apps/desktop/src/main/notify-rules.ts and updates-service.ts (see TOAST below).
import { B, Ref } from "./lib";

export type Rect = { x: number; y: number; w: number; h: number; ref: Ref };
const SEG = "Segoe UI";
const ds = (color: string, y: number, radius: number, spread = 0, x = 0) => ({ type: "dropShadow", color, offset: [x, y], radius, ...(spread ? { spread } : {}) });
const WIN_SHADOW = [ds("#0000002E", 0, 3), ds("#00000040", 10, 28)]; // Windows 11 active window: tight contact + wide soft
const logoDir = `${import.meta.dir}/../logo/final/svg/logo`.replace(/\\/g, "/");

/** The real Speak Kit mark (designs/logo/final, editable vectors): small variant up to 32 px, flat full variant above. */
export const skLogo = (b: B, parent: Ref | undefined, size: number, o: { x?: number; y?: number; abs?: boolean } = {}): Ref => {
  const wrap = b.frame(parent, { w: size, h: size, x: o.x, y: o.y, abs: o.abs });
  const im = b.add("file.import", { path: `${logoDir}/speakkit-logo${size <= 32 ? "-small" : "-flat"}.svg`, x: -9000, y: -9000 });
  b.add("transform.scale", { ids: [im], factor: size / 1024 });
  b.add("node.reparent", { ids: [im], parent: wrap });
  b.add("node.set", { ids: [im], x: 0, y: 0 });
  return wrap;
};

/** Free-form vector glyph in a size x size box: paths are given in box pixels. */
const glyph = (b: B, parent: Ref | undefined, size: number, paths: { d: string; fill?: string; stroke?: string; sw?: number }[], o: { x?: number; y?: number; abs?: boolean } = {}) => {
  const wrap = b.frame(parent, { w: size, h: size, x: o.x, y: o.y, abs: o.abs });
  for (const p of paths) b.add("node.create", { type: "vector", path: p.d, parent: wrap, x: 0, y: 0, props: { fill: p.fill ?? "none", stroke: p.stroke ?? "none", strokeWeight: p.sw ?? 1, strokeCap: "round", strokeJoin: "round" } });
  return wrap;
};
const txt = (b: B, p: Ref | undefined, s: string, o: Record<string, any> = {}) => b.text(p, s, { ff: SEG, ...o });
const center = (b: B, p: Ref | undefined, o: Record<string, any> = {}) => b.frame(p, { layout: "horizontal", align: "center", justify: "center", ...o });

// ---------------------------------------------------------------- desktop + taskbar
const wallpaper = (b: B, p: Ref, w: number, h: number) => {
  b.rect(p, { x: 0, y: 0, w, h, fills: [{ type: "linearGradient", stops: ["#C9D9EE", "#E3E2F1", "#F3E8E1"], from: [0, 0], to: [1, 1] }] } as any);
  b.ellipse(p, { x: w * 0.42, y: -h * 0.25, w: w * 0.7, h: h * 0.9, fills: [{ type: "radialGradient", stops: ["#FFFFFF8C", "#FFFFFF00"] }] } as any);
};
const chromeLogo = (b: B, p: Ref | undefined, size: number) => {
  const s = size / 24; const pt = (a: number, r: number) => `${(12 + r * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(12 + r * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
  const wedge = (a0: number, a1: number) => `M12 12 L${pt(a0, 12)} A12 12 0 0 1 ${pt(a1, 12)} Z`;
  const g = glyph(b, p, 24, [{ d: wedge(-150, -30), fill: "#DB4437" }, { d: wedge(-30, 90), fill: "#F4B400" }, { d: wedge(90, 210), fill: "#0F9D58" },
    { d: "M12 5.6 A6.4 6.4 0 1 1 11.99 5.6 Z", fill: "#FFFFFF" }, { d: "M12 7.4 A4.6 4.6 0 1 1 11.99 7.4 Z", fill: "#4285F4" }]);
  if (s !== 1) b.add("transform.scale", { ids: [g], factor: s });
  return g;
};
const folderIcon = (b: B, p: Ref | undefined) => glyph(b, p, 24, [{ d: "M2 6 Q2 4 4 4 H9 L11 6.5 H20 Q22 6.5 22 8.5 V18 Q22 20 20 20 H4 Q2 20 2 18 Z", fill: "#F0B232" }, { d: "M2 10 Q2 8.5 3.5 8.5 H20.5 Q22 8.5 22 10 V18 Q22 20 20 20 H4 Q2 20 2 18 Z", fill: "#FFD561" }]);
const wifi = (b: B, p: Ref | undefined, c: string) => glyph(b, p, 16, [{ d: "M0.8 5 A10 10 0 0 1 15.2 5", stroke: c, sw: 1.4 }, { d: "M3 7.6 A6.6 6.6 0 0 1 13 7.6", stroke: c, sw: 1.4 }, { d: "M5.3 10.2 A3.4 3.4 0 0 1 10.7 10.2", stroke: c, sw: 1.4 }, { d: "M8 12.6 L8 12.7", stroke: c, sw: 2 }]);

export type Desktop = { x: number; y: number; w: number; h: number; ref: Ref; work: Rect; taskbar: Rect; trayIcon: Rect;
  /** card position of a tray flyout (as apps/desktop windows.ts aboveTray): centred on the tray icon, 12 px above the taskbar, 8 px from the work-area edge */
  flyoutAt: (w: number, h: number) => { x: number; y: number };
  /** position of a floating window in the work-area corner (windows.ts cornerOf, default margin 16) */
  cornerAt: (w: number, h: number, margin?: number) => { x: number; y: number };
  /** Windows toast slot (right edge 12 px in, 12 px above the taskbar); `above` = height already used by toasts below it (their h + 8 each) */
  toastAt: (h: number, above?: number) => { x: number; y: number } };

/** Windows 11 desktop: neutral light wallpaper, centred 48 px taskbar, system tray with the Speak Kit icon. Positions in the returned helpers are in `parent` coordinates. */
export const desktopWithTaskbar = (b: B, parent: Ref | undefined, o: { w: number; h: number; x?: number; y?: number; taskbar?: boolean; trayActive?: boolean; running?: ("chrome" | "speakkit")[]; active?: "chrome" | "speakkit" }): Desktop => {
  const { w, h, x = 0, y = 0, taskbar = true, trayActive = false, running = [], active } = o;
  const d = b.frame(parent, { name: "Windows desktop", x, y, w, h, clip: true });
  wallpaper(b, d, w, h);
  const tbH = taskbar ? 48 : 0; const tbY = h - tbH;
  const tbRect = { x: x, y: y + tbY, w, h: tbH };
  const trayX = w - 4 - 80 - 96 - 32; // chevron(32) | tray icon(32) | quick settings(96) | clock(80)
  if (taskbar) {
    const tb = b.frame(d, { name: "Taskbar", x: 0, y: tbY, w, h: 48, fill: "#F3F3F3E8" });
    b.rect(tb, { x: 0, y: 0, w, h: 1, fill: "#0000000F" });
    const slot = (i0: number, draw: (f: Ref) => void, o2: { hl?: boolean; dot?: "active" | "idle" } = {}) => {
      const f = b.frame(tb, { x: i0, y: 4, w: 40, h: 40, r: 4, fill: o2.hl ? "#FFFFFFB3" : "none" });
      const c = center(b, f, { x: 8, y: 8, w: 24, h: 24 }); draw(c);
      if (o2.dot) b.rect(f, { x: o2.dot === "active" ? 14 : 17, y: 36, w: o2.dot === "active" ? 12 : 6, h: 3, r: 2, fill: o2.dot === "active" ? "#0067C0" : "#00000066" });
    };
    const apps: { k: string; draw: (f: Ref) => void; run?: boolean }[] = [
      { k: "start", draw: (f) => { const g = b.frame(f, { w: 22, h: 22 }); [[0, 0], [12, 0], [0, 12], [12, 12]].forEach(([px, py]) => b.rect(g, { x: px, y: py, w: 10, h: 10, r: 1, fill: "#0A78D4" })); } },
      { k: "search", draw: (f) => b.icon(f, "search", 20, "#1F1F1F") },
      { k: "taskview", draw: (f) => { const g = b.frame(f, { w: 20, h: 20 }); b.rect(g, { x: 0, y: 3, w: 14, h: 14, r: 3, stroke: "#1F1F1F", sw: 1.4, sa: "inside" }); b.rect(g, { x: 5, y: 0, w: 14, h: 14, r: 3, stroke: "#1F1F1F", sw: 1.4, sa: "inside", fill: "#F3F3F3" }); } },
      { k: "explorer", draw: (f) => folderIcon(b, f) },
      { k: "chrome", draw: (f) => chromeLogo(b, f, 22), run: running.includes("chrome") },
      ...(running.includes("speakkit") ? [{ k: "speakkit", draw: (f: Ref) => skLogo(b, f, 22), run: true }] : []),
    ];
    const gx = Math.round((w - apps.length * 44) / 2);
    apps.forEach((a, i) => slot(gx + i * 44, a.draw, { hl: a.k === active, dot: a.run ? (a.k === active ? "active" : "idle") : undefined }));
    // tray
    const tray = (i0: number, wd: number, draw: (f: Ref) => void, hl = false) => { const f = b.row(tb, { x: i0, y: 4, w: wd, h: 40, r: 4, fill: hl ? "#FFFFFFB3" : "none", justify: "center", gap: 12 }); draw(f); };
    tray(trayX - 32, 32, (f) => b.icon(f, "up", 14, "#1F1F1F"));
    tray(trayX, 32, (f) => skLogo(b, f, 18), trayActive);
    tray(trayX + 32, 96, (f) => { wifi(b, f, "#1F1F1F"); b.icon(f, "volume", 16, "#1F1F1F"); const bt = b.frame(f, { w: 18, h: 16 }); b.rect(bt, { x: 0, y: 4, w: 16, h: 8, r: 2, stroke: "#1F1F1F", sw: 1.2, sa: "inside" }); b.rect(bt, { x: 2, y: 6, w: 10, h: 4, r: 1, fill: "#1F1F1F" }); b.rect(bt, { x: 16.5, y: 6.5, w: 1.5, h: 3, r: 0.75, fill: "#1F1F1F" }); });
    tray(trayX + 128, 80, (f) => { const c = b.col(f, { gap: 0, align: "end" }); txt(b, c, "9:41 PM", { size: 12, c: "#1F1F1F", ta: "right" }); txt(b, c, "11/3/2026", { size: 12, c: "#1F1F1F", ta: "right" }); });
  }
  const work = { x, y, w, h: h - tbH, ref: d };
  const slotX = trayX + 16;
  const tIcon: Rect = { x: x + trayX, y: y + tbY + 8, w: 32, h: 32, ref: d };
  return {
    x, y, w, h, ref: d, work, taskbar: { ...tbRect, ref: d }, trayIcon: tIcon,
    flyoutAt: (fw, fh) => ({ x: x + Math.min(Math.max(8, Math.round(slotX - fw / 2)), w - fw - 8), y: y + tbY - 12 - fh }),
    cornerAt: (fw, fh, m = 16) => ({ x: x + w - fw - m, y: y + tbY - fh - m }),
    toastAt: (th, above = 0) => ({ x: x + w - 12 - TOAST_W, y: y + tbY - 12 - th - above }),
  };
};

// ---------------------------------------------------------------- shared window shell
type Stage = { backdrop?: { w: number; h: number } | false; taskbar?: boolean; x?: number; y?: number; running?: ("chrome" | "speakkit")[]; active?: "chrome" | "speakkit" };
const stage = (b: B, parent: Ref | undefined, o: Stage, w: number, h: number) => {
  if (!o.backdrop) return { x: o.x ?? 0, y: o.y ?? 0, desktop: undefined as Desktop | undefined };
  const d = desktopWithTaskbar(b, parent, { w: o.backdrop.w, h: o.backdrop.h, taskbar: o.taskbar ?? true, running: o.running, active: o.active });
  return { x: o.x ?? Math.round((o.backdrop.w - w) / 2), y: o.y ?? Math.round((d.work.h - h) / 2), desktop: d };
};
const shell = (b: B, parent: Ref | undefined, x: number, y: number, w: number, h: number, name: string) =>
  b.frame(parent, { name, x, y, w, h, fill: "#F0F0F0", r: 8, clip: true, stroke: "#00000026", sw: 1, sa: "outside", effects: WIN_SHADOW });
const captions = (b: B, win: Ref, w: number, hgt: number, fg = "#000000", opts: { bg?: string } = {}) => {
  const bar = b.row(win, { name: "Caption buttons", abs: true, x: w - 138, y: 0, w: 138, h: hgt, gap: 0, fill: opts.bg });
  const cell = (draw: (f: Ref) => void) => draw(center(b, bar, { w: 46, h: hgt }));
  cell((f) => b.rect(f, { w: 10, h: 1, fill: fg }));
  cell((f) => b.rect(f, { w: 10, h: 10, r: 1.5, stroke: fg, sw: 1, sa: "inside" }));
  cell((f) => glyph(b, f, 10, [{ d: "M0 0 L10 10 M10 0 L0 10", stroke: fg, sw: 1 }]));
  return bar;
};

// ---------------------------------------------------------------- Electron app window
/** Windows 11 window around the Electron client: 8 px corners, 1 px border, shadow, native caption buttons over the app's 36 px title bar.
 *  Returns the client rect (w x h = what the app draws, e.g. the shot). `backdrop` puts it on a desktop (with taskbar unless taskbar:false). */
export const winApp = (b: B, parent: Ref | undefined, o: Stage & { w: number; h: number; title?: string; titleBar?: number }): Rect & { win: Ref; desktop?: Desktop } => {
  const { w, h } = o; const tbH = o.titleBar ?? 36;
  const st = stage(b, parent, { ...o, running: o.running ?? ["speakkit"], active: o.active ?? "speakkit" }, w, h);
  const win = shell(b, st.desktop ? st.desktop.ref : parent, st.x, st.y, w, h, o.title ?? "Speak Kit");
  const client = b.frame(win, { name: "Client area", x: 0, y: 0, w, h });
  captions(b, win, w, tbH); // sibling above `client`: draws over the app's empty title-bar area
  return { x: st.x, y: st.y, w, h, ref: client, win, desktop: st.desktop };
};

// ---------------------------------------------------------------- Chrome window
export type ChromeWin = { x: number; y: number; w: number; h: number; win: Ref; viewport: Rect; popup?: Rect; extIcon: Rect; toolbar: Rect; desktop?: Desktop };
/** Windows 11 Chrome (light): tab strip, caption buttons, toolbar with omnibox, puzzle + Speak Kit icons, profile, menu. All rects relative to `parent`.
 *  extensionPopup {h, w=360} hangs a popup under the Speak Kit icon (draw the popup shot at popup.ref 0,0). */
export const chromeWin = (b: B, parent: Ref | undefined, o: Stage & { w: number; h: number; url: string; tabTitle: string; extensionPopup?: { h: number; w?: number } | false; favicon?: string; pinnedPopupIcon?: boolean }): ChromeWin => {
  const { w, h } = o; const TAB = 41, TOOL = 40;
  const st = stage(b, parent, { ...o, running: o.running ?? ["chrome"], active: o.active ?? "chrome" }, w, h);
  const FRAME = "#DEE1E6", INK = "#1F1F1F", ICON = "#444746";
  const win = shell(b, st.desktop ? st.desktop.ref : parent, st.x, st.y, w, h, "Chrome window");
  const strip = b.frame(win, { name: "Tab strip", x: 0, y: 0, w, h: TAB, fill: FRAME });
  const tsb = center(b, strip, { x: 8, y: 7, w: 28, h: 28, r: 8 }); b.icon(tsb, "down", 12, ICON);
  const tx0 = 42, tw = 240;
  const tab = b.frame(strip, { name: "Active tab", x: tx0, y: 7, w: tw, h: 34, r: [10, 10, 0, 0], fill: "#FFFFFF" });
  glyph(b, strip, 8, [{ d: "M8 0 L8 8 L0 8 A8 8 0 0 0 8 0 Z", fill: "#FFFFFF" }], { abs: true, x: tx0 - 8, y: 33 });
  glyph(b, strip, 8, [{ d: "M0 0 L0 8 L8 8 A8 8 0 0 1 0 0 Z", fill: "#FFFFFF" }], { abs: true, x: tx0 + tw, y: 33 });
  const fav = b.row(tab, { x: 12, y: 0, w: tw - 24, h: 34, gap: 8 });
  const fv = center(b, fav, { w: 16, h: 16, r: 4, fill: "#5F6368" }); txt(b, fv, o.favicon ?? o.tabTitle.slice(0, 1).toUpperCase(), { size: 10, weight: "SemiBold", c: "#FFFFFF" });
  txt(b, fav, o.tabTitle, { size: 12, c: INK, w: "fill", maxLines: 1 });
  b.icon(fav, "x", 12, ICON);
  const np = center(b, strip, { x: tx0 + tw + 8 + 4, y: 10, w: 28, h: 28, r: 14 }); b.icon(np, "plus", 14, ICON);
  captions(b, win, w, 32, "#1F1F1F");
  // toolbar
  const tool = b.frame(win, { name: "Toolbar", x: 0, y: TAB, w, h: TOOL, fill: "#FFFFFF" });
  [["arrowLeft", 8], ["arrowRight", 40], ["refresh", 72]].forEach(([ic, bx]) => { const f = center(b, tool, { x: bx as number, y: 4, w: 32, h: 32, r: 16 }); b.icon(f, ic as string, 18, ICON); });
  // right side, laid out from the right edge: menu | profile | speak kit | puzzle
  const R = w - 8; const menuX = R - 32, profX = menuX - 36, skX = profX - 32 - 4, puzX = skX - 32;
  const omniX = 108, omniW = puzX - 8 - omniX;
  const omni = b.row(tool, { name: "Omnibox", x: omniX, y: 4, w: omniW, h: 32, r: 16, fill: "#F1F3F4", pad: [0, 4, 0, 4], gap: 0 });
  const site = center(b, omni, { w: 24, h: 24, r: 12, fill: "#FFFFFF" }); b.icon(site, "sliders", 14, ICON);
  const [host, ...rest] = o.url.split("/"); const u = b.row(omni, { w: "fill", pad: [0, 0, 0, 10], gap: 0 });
  txt(b, u, host, { size: 14, c: INK }); if (rest.length) txt(b, u, "/" + rest.join("/"), { size: 14, c: "#5F6368", maxLines: 1 });
  const star = center(b, omni, { w: 28, h: 28 }); b.icon(star, "star", 16, ICON);
  const pz = center(b, tool, { x: puzX, y: 4, w: 32, h: 32, r: 16 }); b.icon(pz, "puzzle", 18, ICON);
  const open = !!o.extensionPopup;
  const skb = center(b, tool, { name: "Speak Kit extension icon", x: skX, y: 4, w: 32, h: 32, r: 16, fill: open ? "#0000001A" : "none" }); skLogo(b, skb, 18);
  const pr = center(b, tool, { x: profX, y: 4, w: 32, h: 32 }); const av = center(b, pr, { w: 24, h: 24, r: 12, fill: "#8AB4F8" }); b.icon(av, "user", 14, "#1F1F1F");
  const mn = center(b, tool, { x: menuX, y: 4, w: 32, h: 32, r: 16 }); b.icon(mn, "moreV", 18, ICON);
  b.rect(win, { x: 0, y: TAB + TOOL - 1, w, h: 1, fill: "#0000001A" });
  const vp = b.frame(win, { name: "Viewport", x: 0, y: TAB + TOOL, w, h: h - TAB - TOOL, fill: "#FFFFFF", clip: true });
  const abs = (rx: number, ry: number) => ({ x: st.x + rx, y: st.y + ry });
  const res: ChromeWin = { ...abs(0, 0), w, h, win, desktop: st.desktop,
    viewport: { ...abs(0, TAB + TOOL), w, h: h - TAB - TOOL, ref: vp }, toolbar: { ...abs(0, TAB), w, h: TOOL, ref: tool },
    extIcon: { ...abs(skX, TAB + 4), w: 32, h: 32, ref: skb } };
  if (o.extensionPopup) {
    const pw = o.extensionPopup.w ?? 360, ph = o.extensionPopup.h; const px = Math.min(skX + 32 - pw + 4, w - pw - 8);
    const pop = b.frame(win, { name: "Extension popup", x: px, y: TAB + TOOL + 4, w: pw, h: ph, r: 12, clip: true, fill: "#FFFFFF", stroke: "#0000001F", sw: 1, sa: "outside", effects: [ds("#0000002E", 0, 2), ds("#00000038", 6, 20)] });
    res.popup = { ...abs(px, TAB + TOOL + 4), w: pw, h: ph, ref: pop };
  }
  return res;
};

// ---------------------------------------------------------------- Windows toast
export const TOAST_W = 364;
/** Texts the desktop app really sends (notify-rules.ts, updates-service.ts); the body already ends with its "Click to ..." sentence. */
export const TOAST = {
  engineError: { title: "Voice engine problem", body: "The engine stopped. Click to open Speak Kit." },
  updateReady: { title: "Update ready", body: "Speak Kit 1.1.0 is ready to install. Click to choose when." },
};
/** Windows 11 toast, light: 364 wide, r8, app header (logo 16 + "Speak Kit"), semibold title, 2-line body, optional footer, no buttons (Lumen NO1).
 *  hover:true adds the "..." and X that Windows shows only while the pointer is over the toast. Returns the rect (h is exact). */
export const toastH = (o: { body: string; footer?: string }) =>
  12 + 16 + 8 + 20 + Math.min(2, Math.max(1, Math.ceil((o.body.length * 6.6) / (TOAST_W - 32)))) * 20 + (o.footer ? 4 + 16 : 0) + 14;
export const winToast = (b: B, parent: Ref | undefined, o: { x: number; y: number; title: string; body: string; footer?: string; appIcon?: boolean; hover?: boolean }): Rect => {
  const h = toastH(o);
  const f = b.col(parent, { name: "Windows toast", x: o.x, y: o.y, w: TOAST_W, h, pad: [12, 16, 14, 16], gap: 0, r: 8, fill: "#F9F9F9F2", stroke: "#0000000F", sw: 1, sa: "inside", clip: true, effects: [ds("#00000024", 8, 16), ds("#0000001F", 0, 2)] });
  const hd = b.row(f, { w: "fill", h: 16, gap: 8, justify: "spaceBetween" });
  const hl = b.row(hd, { gap: 8 }); if (o.appIcon !== false) skLogo(b, hl, 16); txt(b, hl, "Speak Kit", { size: 12, c: "#000000B3" });
  if (o.hover) { const hr = b.row(hd, { gap: 8 }); b.icon(hr, "dots", 14, "#000000B3"); b.icon(hr, "x", 12, "#000000B3"); }
  b.frame(f, { w: 1, h: 8 });
  txt(b, f, o.title, { size: 14, weight: "SemiBold", c: "#000000", w: "fill", maxLines: 1, lh: 20 });
  txt(b, f, o.body, { size: 14, c: "#000000B3", w: "fill", maxLines: 2, lh: 20 });
  if (o.footer) { b.frame(f, { w: 1, h: 4 }); txt(b, f, o.footer, { size: 12, c: "#00000099", w: "fill", maxLines: 1, lh: 16 }); }
  return { x: o.x, y: o.y, w: TOAST_W, h, ref: f };
};

// ---------------------------------------------------------------- native / Chrome context menu
export type MenuItem = { l: string; k?: string; sub?: boolean; hi?: boolean; disabled?: boolean; check?: boolean } | "-";
/** Windows 11 context menu (Chrome page menu look): r8, 4 px inset rows of 32 px, 1 px separators, shortcut text right, chevron for submenus.
 *  style "chrome" (white) or "win" (#F9F9F9 shell menu). Width auto from the labels unless w is given. */
export const nativeMenu = (b: B, parent: Ref | undefined, o: { x: number; y: number; items: MenuItem[]; w?: number; style?: "chrome" | "win" }): Rect => {
  const items = o.items;
  const w = o.w ?? Math.max(220, Math.round(Math.max(...items.map((i) => (i === "-" ? 0 : i.l.length * 7 + (i.k ? i.k.length * 6.5 + 32 : 0) + (i.sub ? 20 : 0)))) + 56));
  const h = 8 + items.reduce((a, i) => a + (i === "-" ? 9 : 32), 0);
  const m = b.col(parent, { name: "Context menu", x: o.x, y: o.y, w, h, pad: 4, gap: 0, r: 8, fill: o.style === "win" ? "#F9F9F9" : "#FFFFFF", stroke: "#0000001A", sw: 1, sa: "inside", effects: [ds("#00000029", 8, 16), ds("#0000001F", 0, 2)] });
  items.forEach((it) => {
    if (it === "-") { const s = b.frame(m, { w: "fill", h: 9, layout: "horizontal", align: "center" }); b.rect(s, { w: "fill", h: 1, fill: "#0000001A" }); return; }
    const r = b.row(m, { w: "fill", h: 32, pad: [0, 12], gap: 8, r: 4, fill: it.hi ? "#0000000F" : "none", justify: "spaceBetween" });
    txt(b, r, it.l, { size: 13, c: it.disabled ? "#00000066" : "#1F1F1F", w: "fill" });
    if (it.k) txt(b, r, it.k, { size: 12, c: "#00000099" });
    if (it.sub) b.icon(r, "right", 12, "#1F1F1F");
  });
  return { x: o.x, y: o.y, w, h, ref: m };
};
