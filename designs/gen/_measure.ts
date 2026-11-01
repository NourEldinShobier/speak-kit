// Pixel check of icon-vs-text alignment in the kit components. bun _measure.ts && python _measure.py
import { $ } from "bun";
import { homedir } from "os";
import { writeFileSync, mkdirSync } from "fs";
import { B } from "./lib";
import * as K from "./kit";
import { LIGHT } from "./kit";

const FC = process.env.FIGCRAFT_CLI ?? `${homedir()}/AppData/Local/Programs/FigCraft/figcraft-cli.exe`;
const D = "D:/workspaces/speak-it/designs/next/build/measure";
mkdirSync(D, { recursive: true });
// dark fg on white, so ink = dark pixels; "inv" cells draw white-on-colour and are measured on bright pixels
const t = { ...LIGHT, text: "#000000", text2: "#000000", text3: "#000000", accent: "#0050B0", err: "#7A0000", info: "#0050B0", ok: "#005020", warn: "#7A3C00", surface: "#FFFFFF", input: "#FFFFFF", raised: "#FFFFFF", bg: "#FFFFFF", control: "#00000000", border: "#00000000" };
const cells: { name: string; inv?: boolean; kind?: "icon-left" | "icon-right" | "icon-only"; draw: (b: B, p: any) => void }[] = [
  { name: "btn secondary sm", draw: (b, p) => K.btn(b, t, p, "HOME", { icon: "plus", sz: "sm" }) },
  { name: "btn secondary md", draw: (b, p) => K.btn(b, t, p, "HOME", { icon: "plus" }) },
  { name: "btn secondary dlg", draw: (b, p) => K.btn(b, t, p, "HOME", { icon: "plus", sz: "dlg" }) },
  { name: "btn secondary lg", draw: (b, p) => K.btn(b, t, p, "HOME", { icon: "plus", sz: "lg" }) },
  { name: "btn ghost md", draw: (b, p) => K.btn(b, t, p, "HOME", { v: "ghost", icon: "check" }) },
  { name: "btn dangerOutline md", draw: (b, p) => K.btn(b, t, p, "HOME", { v: "dangerOutline", icon: "x" }) },
  { name: "btn primary lg (inv)", inv: true, draw: (b, p) => K.btn(b, t, p, "HOME", { v: "primary", icon: "plus", sz: "lg" }) },
  { name: "btn primary md (inv)", inv: true, draw: (b, p) => K.btn(b, t, p, "HOME", { v: "primary", icon: "play" }) },
  { name: "btn icon-right md", kind: "icon-right", draw: (b, p) => K.btn(b, t, p, "HOME", { iconRight: "down" }) },
  { name: "badge", draw: (b, p) => K.badge(b, t, p, "HOME", "ok", "check") },
  { name: "chip", draw: (b, p) => K.chip(b, t, p, "HOME", false, "plus") },
  { name: "input", draw: (b, p) => K.input(b, t, p, { value: "HOME", icon: "search", w: 200 }) },
  { name: "select", kind: "icon-right", draw: (b, p) => K.select(b, t, p, "HOME", 200) },
  { name: "menuItem", draw: (b, p) => { const m = K.menu(b, t, p, { w: 200 }); K.menuItem(b, t, m, "HOME", { icon: "plus" }); } },
  { name: "navItem", draw: (b, p) => K.navItem(b, t, p, "HOME", "book", { selected: true }) },
  { name: "toast", draw: (b, p) => K.toast(b, t, p, "HOME", "neutral", { w: 240 }) },
  { name: "iconBtn 32 (dots)", kind: "icon-only", draw: (b, p) => K.iconBtn(b, t, p, "dots", { size: 32 }) },
  { name: "iconBtn 32 (plus)", kind: "icon-only", draw: (b, p) => K.iconBtn(b, t, p, "plus", { size: 32 }) },
  { name: "iconBtn 36 circle (check)", kind: "icon-only", draw: (b, p) => K.iconBtn(b, t, p, "check", { size: 36 }) },
  { name: "iconBtn 24 (x)", kind: "icon-only", draw: (b, p) => K.iconBtn(b, t, p, "x", { size: 24 }) },
  { name: "checkbox on (inv)", inv: true, kind: "icon-only", draw: (b, p) => K.checkbox(b, t, p, true) },
  { name: "play circle 40 (inv)", inv: true, kind: "icon-only", draw: (b, p) => { const f = b.frame(p, { w: 40, h: 40, r: 20, fill: t.accent, layout: "horizontal", align: "center", justify: "center" }); b.icon(f, "plus", 16, "#FFFFFF"); } },
];
const b = new B();
const root = b.frame(undefined, { name: "m", x: 0, y: 0, w: 260 * 4, h: 64 * Math.ceil(cells.length / 4), fill: "#FFFFFF" });
cells.forEach((c, i) => {
  const cell = b.frame(root, { x: (i % 4) * 260, y: Math.floor(i / 4) * 64, w: 260, h: 64, fill: "#FFFFFF", layout: "horizontal", align: "center", pad: [0, 10], gap: 0 });
  c.draw(b, cell);
});
writeFileSync(D + "/script.json", JSON.stringify([b.step("m")]));
const r = await $`${FC} run ${D}/script.json --out ${D}/m.figcraft`.nothrow().quiet();
const e = await $`${FC} export ${D}/m.figcraft -o ${D}/m.png --scale 4`.nothrow().quiet();
writeFileSync(D + "/cells.json", JSON.stringify(cells.map((c) => ({ name: c.name, inv: !!c.inv, kind: c.kind ?? "icon-left" }))));
console.log("run", r.exitCode, "export", e.exitCode);
