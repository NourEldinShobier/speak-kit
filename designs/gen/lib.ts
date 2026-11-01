// Command builder for figcraft-cli `run`. Raw hex colours only (no variable library here).
export type Ref = { $ref: string; field?: string };
export type P = Ref | number | undefined;
export type O = {
  name?: string; x?: number; y?: number; w?: number | "fill" | "hug"; h?: number | "fill" | "hug"; abs?: boolean;
  fill?: string; stroke?: string; sw?: number; sa?: string; r?: number | number[]; clip?: boolean; opacity?: number;
  layout?: "horizontal" | "vertical"; gap?: number; pad?: number | number[]; align?: string; justify?: string; wrap?: boolean;
  shadow?: string; [k: string]: any;
};
const KEYMAP: Record<string, string> = { sw: "strokeWeight", sa: "strokeAlign", r: "cornerRadius", pad: "padding", align: "crossAlign", justify: "mainAlign" };
// Lumen elevation (plain black, same in light and dark): menu 0 8 24 .35, overlay 0 16 48 .45, window 0 18 50 .5. sm is not from Lumen (selected segment lift).
const SHADOWS: Record<string, any[]> = {
  sm: [{ type: "dropShadow", color: "#00000014", offset: [0, 1], radius: 3 }],
  md: [{ type: "dropShadow", color: "#00000059", offset: [0, 8], radius: 24 }],
  lg: [{ type: "dropShadow", color: "#00000073", offset: [0, 16], radius: 48 }],
  xl: [{ type: "dropShadow", color: "#00000080", offset: [0, 18], radius: 50 }],
};
// Lumen radii are 4, 5, 6, 8, 10, 12, 14, 999: snap the stray ones the screens used.
const RSNAP: Record<number, number> = { 7: 8, 9: 8, 11: 10, 13: 12 };

import tabler from "./tabler.json";
import tablerBounds from "./tabler-bounds.json";
// Tabler Icons (MIT, tabler.io/icons) outline set, 24x24 geometry, drawn with a constant 1.5 px stroke like Lumen.
export const TABLER_NAME: Record<string, string> = {
  play: "player-play", pause: "player-pause", skipBack: "player-skip-back", skipFwd: "player-skip-forward",
  back10: "rewind-backward-10", fwd10: "rewind-forward-10", sliders: "adjustments-horizontal", volume: "volume", x: "x", down: "chevron-down", up: "chevron-up",
  right: "chevron-right", left: "chevron-left", check: "check", search: "search", mic: "microphone", file: "file-text", upload: "upload", download: "download",
  alert: "alert-triangle", info: "info-circle", globe: "world", book: "book", clock: "clock", plus: "plus", trash: "trash", bookmark: "bookmark", list: "list",
  cpu: "cpu", moon: "moon", wave: "wave-sine", link: "link", copy: "copy", keyboard: "keyboard", shield: "shield", refresh: "refresh", power: "power", home: "home",
  user: "user", star: "star", pin: "pin", type: "typography", eye: "eye", scan: "scan", clipboard: "clipboard", folder: "folder", heart: "heart", dots: "dots",
  zap: "bolt", lock: "lock", moreV: "dots-vertical", minus: "minus", square: "square", external: "external-link", edit: "pencil", headphones: "headphones",
  gauge: "gauge", loader: "loader-2", hardDrive: "database", wifiOff: "wifi-off", sidebarRight: "layout-sidebar-right", playlist: "playlist",
  puzzle: "puzzle", arrowLeft: "arrow-left", arrowRight: "arrow-right", history: "history", circleCheck: "circle-check", alertCircle: "alert-circle", stop: "player-stop",
  hourglass: "hourglass", eyeOff: "eye-off", grid: "layout-grid", rows: "list-details", userCheck: "user-check", lockOff: "lock-off",
  undo: "arrow-back-up", sparkles: "sparkles", bell: "bell", bellOff: "bell-off", settings: "settings", battery: "battery-2", batteryCharge: "battery-charging",
  desktop: "device-desktop", shieldCheck: "shield-check", chrome: "brand-chrome", plug: "plug-connected", cloudOff: "cloud-off", zzz: "zzz", key: "key",
  command: "command", browser: "browser", appWindow: "app-window", clipboardText: "clipboard-text", fileExport: "file-export", sun: "sun", sunMoon: "sun-moon",
  palette: "palette", textSize: "text-size", ruler: "ruler-2", inbox: "inbox", folderOpen: "folder-open", www: "world-www", octagon: "alert-octagon", circleX: "circle-x",
  rocket: "rocket", bulb: "bulb", maximize: "arrows-maximize", tag: "tag", sidebar: "layout-sidebar", nextTrack: "player-track-next", prevTrack: "player-track-prev",
  message: "message-circle", box: "box", wand: "wand", point: "point",
};
export const ICONS: Record<string, string> = Object.fromEntries(Object.entries(TABLER_NAME).map(([k, v]) => [k, (tabler as Record<string, string>)[v]]));
const FILLED = new Set<string>(); // Lumen uses the Tabler outline set only

export class B {
  cmds: any[] = [];
  n = 0;
  add(command: string, params: any, as?: string): Ref {
    const a = as ?? `r${this.n++}`;
    this.cmds.push({ command, params, as: a });
    return { $ref: a };
  }
  private split(o: O, isText = false) {
    const top: any = {}; const props: any = {};
    for (const [k0, v] of Object.entries(o)) {
      if (v === undefined) continue;
      const k = KEYMAP[k0] ?? k0;
      if (k === "name" || k === "x" || k === "y") top[k] = v;
      else if (k === "abs") top.absolute = v;
      else if (k === "crossAlign") { const m = ({ start: "min", end: "max" } as any)[v as string] ?? v; if (m !== "stretch") props[k] = m; }
      else if (k === "mainAlign") props[k] = ({ start: "min", end: "max" } as any)[v as string] ?? v;
      else if (k === "cornerRadius" && typeof v === "number" && RSNAP[v] !== undefined) props[k] = RSNAP[v];
      else if (k === "shadow") props.effects = SHADOWS[v as string];
      else if (k === "w") { if (v === "fill" || v === "hug") props.sizingH = v; else { top.width = v; if (!isText) props.sizingH = "fixed"; } }
      else if (k === "h") { if (v === "fill" || v === "hug") props.sizingV = v; else { top.height = v; if (!isText) props.sizingV = "fixed"; } }
      else props[k] = v;
    }
    return { top, props };
  }
  node(type: string, parent: P, o: O = {}, extra: any = {}): Ref {
    const { top, props } = this.split(o, type === "text");
    if (type === "frame" && props.fill === undefined) props.fill = "none";
    if (type === "frame" && props.layout && props.sizingV === undefined && top.height === undefined) props.sizingV = "hug";
    if (type === "frame" && props.layout && props.sizingH === undefined && top.width === undefined) props.sizingH = "hug";
    const params: any = { type, ...top, ...extra, props };
    if (parent !== undefined) params.parent = parent;
    return this.add("node.create", params);
  }
  frame(parent: P, o: O = {}) { return this.node("frame", parent, o); }
  row(parent: P, o: O = {}) { return this.frame(parent, { layout: "horizontal", align: "center", gap: 8, ...o }); }
  col(parent: P, o: O = {}) { return this.frame(parent, { layout: "vertical", gap: 8, ...o }); }
  rect(parent: P, o: O = {}) { return this.node("rectangle", parent, o); }
  ellipse(parent: P, o: O = {}) { return this.node("ellipse", parent, o); }
  text(parent: P, s: string, o: O & { size?: number; weight?: string; c?: string; mono?: boolean; lh?: number; ta?: string; ls?: number; ff?: string } = {}) {
    const { size: size0 = 13, weight = "Regular", c = "#000000", mono = false, lh, ta, ls, ff = "Inter", ...rest } = o;
    // Lumen type: Inter 400/500/600 at whole sizes (10..24), auto line height; no mono face in Lumen: the mono flag is accepted and ignored.
    const size = Math.max(10, size0 <= 24 ? Math.round(size0) : size0);
    const fw = ({ Bold: "SemiBold", ExtraBold: "SemiBold", Black: "SemiBold", Light: "Regular" } as Record<string, string>)[weight] ?? weight;
    const props: any = { ...rest, fontFamily: ff, fontStyle: fw, fontSize: size, fill: c };
    if (lh) props.lineHeight = lh;
    if (ta) props.textAlign = ta;
    if (ls !== undefined) props.letterSpacing = ls;
    const wasFill = props.w === "fill";
    const r = this.node("text", parent, props, { text: s });
    if (wasFill) this.add("node.set", { ids: [r], textAutoResize: "height" });
    return r;
  }
  icon(parent: P, name: string, size = 16, color = "#000000", o: O = {}): Ref {
    const d = ICONS[name]; if (!d) throw new Error("missing icon " + name);
    size = Math.round(size / 2) * 2; // Lumen icon boxes are 12, 14, 16, 18, 20, 24 px
    // Lumen: every icon keeps a 1.5 px stroke on screen at every size (geometry scales, stroke does not).
    const props = FILLED.has(name) ? { fill: color, stroke: "none" } : { fill: "none", stroke: color, strokeWeight: o.sw ?? 1.5, strokeCap: "round", strokeJoin: "round" };
    // Tabler paths live in a 24x24 box. node.create places a path at (x,y) PLUS the path's own origin offset (x0,y0), unscaled,
    // while width/height scale the geometry. So to land the bbox at k*x0 we pass k*x0 - x0.
    const [x0, y0, w0, h0] = (tablerBounds as Record<string, number[]>)[TABLER_NAME[name]];
    const k = size / 24;
    const wrap = this.frame(parent, { w: size, h: size, clip: false });
    const p: any = { type: "vector", path: d, x: x0 * k - x0, y: y0 * k - y0, parent: wrap, props };
    if (w0 > 0) p.width = w0 * k;
    if (h0 > 0) p.height = h0 * k;
    this.add("node.create", p);
    return wrap;
  }
  step(label: string) { return { command: "command.batch", params: { label, commands: this.cmds } }; }
}
