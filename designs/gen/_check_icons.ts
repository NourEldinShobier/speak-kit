import { $ } from "bun";
import { homedir } from "os";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { B, ICONS, TABLER_NAME } from "./lib";
import tablerBounds from "./tabler-bounds.json";

const FC = process.env.FIGCRAFT_CLI ?? `${homedir()}/AppData/Local/Programs/FigCraft/figcraft-cli.exe`;
const D = "D:/workspaces/speak-it/designs/next/build/probe-icons";
mkdirSync(D, { recursive: true });
const b = new B();
const root = b.frame(undefined, { name: "icons", x: 0, y: 0, w: 2000, h: 2000, fill: "#FFFFFF" });
const grid = b.row(root, { x: 0, y: 0, w: 1800, wrap: true, gap: 6 });
const sizes = [12, 14, 16, 18, 24];
const wraps: Record<string, { name: string; size: number }> = {};
for (const n of Object.keys(ICONS)) for (const s of sizes) { const r: any = b.icon(grid, n, s, "#000000"); wraps[r.$ref] = { name: n, size: s }; }
writeFileSync(D + "/script.json", JSON.stringify([b.step("i")]));
const r = await $`${FC} run ${D}/script.json --out ${D}/i.figcraft`.nothrow().quiet();
const res = JSON.parse(r.stdout.toString().split("\n")[0]);
await $`${FC} convert ${D}/i.figcraft ${D}/i.json`.nothrow().quiet();
const doc = JSON.parse(readFileSync(D + "/i.json", "utf8"));
const nodes = doc.nodes;
let bad = 0, n = 0;
const nameBy = new Map<number, { name: string; size: number }>();
// match wrappers in creation order: children of grid
const gridId = Object.values<any>(nodes).find((x) => x.name === "Frame 1")?.id;
const kids: number[] = nodes[gridId].children;
let i = 0;
const names = Object.keys(ICONS);
for (const nm of names) for (const s of sizes) {
  const wid = kids[i++]; const w = nodes[wid]; const v = nodes[w.children[0]];
  const [x0, y0, w0, h0] = (tablerBounds as any)[TABLER_NAME[nm]] ?? [0, 0, 0, 0];
  const k = s / 24; const tr = v.transform;
  const ex = [x0 * k, y0 * k, w0 * k, h0 * k]; const got = [tr[4], tr[5], v.width, v.height];
  n++;
  if (got.some((g, j) => Math.abs(g - ex[j]) > 0.02)) { bad++; if (bad < 12) console.log("BAD", nm, s, ex.map((q) => +q.toFixed(2)), got.map((q: number) => +q.toFixed(2))); }
}
console.log("checked", n, "bad", bad, "exit", r.exitCode);
