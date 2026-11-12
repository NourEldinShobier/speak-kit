import type { OverlayResult, OverlayView } from "../../../shared/capture/contract";
import { areaBetween, describeDisplay, windowAt, type DisplayGeometry } from "../../../shared/capture/picker";
import { drawInk, type Stroke } from "./ink";
import "./overlay.css";

/**
 * The page of the overlay window: the picker (window, area or screen, over a dimmed display) and the ink layer. One page, one mode at a time.
 * Esc, and a click where nothing can be picked, never leave the picker open.
 */
const bridge = window.speakkitCapture.overlay;
const root = document.getElementById("root")!;
let view: OverlayView | null = null;
let teardown: (() => void) | undefined;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const geometry = (v: OverlayView): DisplayGeometry => ({
  id: v.display.id,
  name: v.display.name,
  bounds: { x: 0, y: 0, width: v.display.width, height: v.display.height },
  scaleFactor: v.display.scaleFactor,
});
const finish = (r: OverlayResult) => bridge.result(r);

function hint(v: OverlayView, mode: OverlayView["mode"]): HTMLElement {
  const bar = el("div", "ov-hint");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "What to record");
  for (const [m, label] of [
    ["window", "Window"],
    ["area", "Area"],
    ["screen", "Screen"],
  ] as const) {
    if (m === "window" && v.windows.length === 0 && mode !== "window") continue;
    const b = el("button", "ov-hint__btn", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(m === mode));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      show({ ...v, mode: m });
    });
    bar.append(b);
  }
  bar.append(el("span", "ov-hint__esc", "Esc to cancel"));
  return bar;
}

function pickWindow(v: OverlayView) {
  const box = el("div", "ov-box");
  const title = el("div", "ov-title");
  box.append(title);
  const wins = v.windows.map((w) => ({ id: w.id, title: w.title, rect: { x: w.x, y: w.y, width: w.width, height: w.height } }));
  const move = (e: MouseEvent) => {
    const w = windowAt({ x: e.clientX, y: e.clientY }, wins);
    box.hidden = !w;
    if (!w) return;
    Object.assign(box.style, { left: `${w.rect.x}px`, top: `${w.rect.y}px`, width: `${w.rect.width}px`, height: `${w.rect.height}px` });
    title.textContent = w.title;
  };
  const click = (e: MouseEvent) => {
    const w = windowAt({ x: e.clientX, y: e.clientY }, wins);
    if (w) finish({ kind: "window", windowId: w.id });
  };
  root.addEventListener("mousemove", move);
  root.addEventListener("click", click);
  root.append(box);
  return () => {
    root.removeEventListener("mousemove", move);
    root.removeEventListener("click", click);
  };
}

function pickArea(v: OverlayView) {
  const display = geometry(v);
  const box = el("div", "ov-box ov-box--area");
  const badge = el("div", "ov-badge");
  box.append(badge);
  box.hidden = true;
  root.append(box);
  let from: { x: number; y: number } | null = null;
  const place = (e: MouseEvent) => {
    if (!from) return;
    const r = areaBetween(from, { x: e.clientX, y: e.clientY }, display);
    const x = Math.min(from.x, e.clientX);
    const y = Math.min(from.y, e.clientY);
    const w = Math.abs(e.clientX - from.x);
    const h = Math.abs(e.clientY - from.y);
    box.hidden = false;
    Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    box.dataset.small = String(!r);
    badge.textContent = `${Math.round(w * v.display.scaleFactor)} × ${Math.round(h * v.display.scaleFactor)}${r ? "" : " (minimum 36 × 36)"}`;
  };
  const down = (e: MouseEvent) => {
    from = { x: e.clientX, y: e.clientY };
  };
  const up = (e: MouseEvent) => {
    if (!from) return;
    const r = areaBetween(from, { x: e.clientX, y: e.clientY }, display);
    from = null;
    box.hidden = true;
    if (r) finish({ kind: "area", ...r });
  };
  root.addEventListener("mousedown", down);
  root.addEventListener("mousemove", place);
  root.addEventListener("mouseup", up);
  return () => {
    root.removeEventListener("mousedown", down);
    root.removeEventListener("mousemove", place);
    root.removeEventListener("mouseup", up);
  };
}

function pickScreen(v: OverlayView) {
  const box = el("div", "ov-box ov-box--screen");
  box.append(el("div", "ov-title", describeDisplay(geometry(v))));
  root.append(box);
  const click = () => finish({ kind: "screen" });
  root.addEventListener("click", click);
  return () => root.removeEventListener("click", click);
}

function show(next: OverlayView) {
  teardown?.();
  view = next;
  root.replaceChildren();
  root.dataset.mode = next.mode;
  if (next.mode === "ink") {
    teardown = startInk(next);
    return;
  }
  root.append(hint(next, next.mode));
  teardown = { window: pickWindow, area: pickArea, screen: pickScreen }[next.mode](next);
}

function startInk(v: OverlayView): () => void {
  const canvas = el("canvas", "ov-ink");
  canvas.width = v.display.width || window.innerWidth;
  canvas.height = v.display.height || window.innerHeight;
  root.append(canvas);
  const strokes: Stroke[] = [];
  let live: Stroke | null = null;
  const point = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY, at: performance.now() });
  const down = (e: MouseEvent) => {
    live = { points: [point(e)], laser: false };
    strokes.push(live);
  };
  const move = (e: MouseEvent) => {
    if (live) live.points.push(point(e));
    else if (v.trail) {
      const last = strokes[strokes.length - 1];
      if (last?.laser) last.points.push(point(e));
      else strokes.push({ points: [point(e)], laser: true });
    }
  };
  const up = () => {
    live = null;
  };
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  let raf = requestAnimationFrame(function frame() {
    drawInk(canvas.getContext("2d")!, strokes, { now: performance.now(), fadeMs: v.inkFadeMs ?? 1000 });
    raf = requestAnimationFrame(frame);
  });
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("mouseup", up);
  };
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && view && view.mode !== "ink") finish(null);
  const keys: Record<string, OverlayView["mode"]> = { w: "window", a: "area", s: "screen" };
  const m = keys[e.key.toLowerCase()];
  if (m && view && view.mode !== "ink" && (m !== "window" || view.windows.length > 0)) show({ ...view, mode: m });
});
bridge.onShow(show);
