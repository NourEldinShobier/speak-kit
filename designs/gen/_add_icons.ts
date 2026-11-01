// Adds Tabler outline icons to tabler.json + tabler-bounds.json (bounds measured by FigCraft). Usage: bun _add_icons.ts
import { $ } from "bun";
import { homedir } from "os";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const FC = process.env.FIGCRAFT_CLI ?? `${homedir()}/AppData/Local/Programs/FigCraft/figcraft-cli.exe`;
const SRC = "D:/workspaces/speak-it/code/node_modules/.pnpm/@tabler+icons@3.50.0/node_modules/@tabler/icons/icons/outline";
const names = ["arrow-back-up", "sparkles", "bell", "bell-off", "settings", "battery-2", "battery-charging", "device-desktop", "shield-check", "brand-chrome", "plug-connected", "cloud-off", "zzz", "key", "command", "browser", "app-window", "clipboard-text", "file-export", "sun", "sun-moon", "palette", "text-size", "ruler-2", "inbox", "folder-open", "world-www", "alert-octagon", "circle-x", "rocket", "bulb", "arrows-maximize", "tag", "layout-sidebar", "player-track-next", "player-track-prev", "message-circle", "refresh-dot", "box", "wand", "dots-circle-horizontal", "point", "check"];
const t = JSON.parse(readFileSync("tabler.json", "utf8"));
const bounds = JSON.parse(readFileSync("tabler-bounds.json", "utf8"));
const todo = names.filter((n) => !bounds[n]);
for (const n of todo) {
  const svg = readFileSync(`${SRC}/${n}.svg`, "utf8");
  const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]).filter((d) => d !== "M0 0h24v24H0z");
  if (svg.match(/<(circle|rect|line|polyline|ellipse)/)) console.log("WARN non-path element in", n);
  t[n] = ds.join(" ");
}
const cmds = todo.map((n) => ({ command: "node.create", params: { type: "vector", path: t[n], x: 0, y: 0, props: { fill: "none", stroke: "#000000", strokeWeight: 1.5 } }, as: "v_" + n }));
const gets = todo.map((n) => ({ command: "node.get", params: { id: { $ref: "v_" + n }, fields: ["x", "y", "width", "height"] } }));
try { mkdirSync("../next/build", { recursive: true }); } catch {}
writeFileSync("../next/build/icons.json", JSON.stringify([...cmds, ...gets]));
const r = await $`${FC} run ../next/build/icons.json`.nothrow().quiet();
const lines = r.stdout.toString().split("\n").filter((l) => l.includes('"command":"node.get"'));
if (lines.length !== todo.length) { console.log(r.stdout.toString().slice(0, 1500), r.stderr.toString().slice(0, 500)); process.exit(1); }
todo.forEach((n, i) => { const j = JSON.parse(lines[i]).result; const q = j.node ?? j; bounds[n] = [q.x, q.y, q.width, q.height]; });
writeFileSync("tabler.json", JSON.stringify(t));
writeFileSync("tabler-bounds.json", JSON.stringify(bounds));
console.log("added", todo.length, todo.slice(0, 3).map((n) => bounds[n]));
