// Throwaway proof of kit3: bun _kit3test.ts   (ROOT=<dir> required, writes ROOT/screens/K3-*.png and ROOT/build)
import { $ } from "bun";
import { homedir } from "os";
import { mkdirSync, writeFileSync, readdirSync, renameSync } from "fs";
import { B } from "./lib";
import * as K3 from "./kit3";

const ROOT = process.env.ROOT!; if (!ROOT) throw new Error("set ROOT");
const SHOTS = `${import.meta.dir}/../built/shots`.replace(/\\/g, "/");
const FC = process.env.FIGCRAFT_CLI ?? `${homedir()}/AppData/Local/Programs/FigCraft/figcraft-cli.exe`;
const b = new B();
const img = (parent: any, f: string, w: number, h: number) => b.add("image.place", { path: `${SHOTS}/${f}`, parent, x: 0, y: 0, width: w, height: h, name: f });
const frames: { id: string; ref: any }[] = [];
const W = 1440, H = 900;
const mk = (id: string, y: number) => { const f = b.frame(undefined, { name: id, x: 0, y, w: W, h: H, clip: true }); frames.push({ id, ref: f }); return f; };

// 1. Electron window with the real L1 shot
const f1 = mk("K3-win", 0);
const a = K3.winApp(b, f1, { w: 1278, h: 799, backdrop: { w: W, h: H } });
img(a.ref, "L1-home-light.png", 1278, 799);
console.log("K3-win client", a.x, a.y, a.w, a.h);

// 2. Chrome with popup, right-click menu
const f2 = mk("K3-chrome", 1000);
const c = K3.chromeWin(b, f2, { w: 1278, h: 799, url: "reader.example.com/essays/local-first", tabTitle: "The quiet return of local-first software", extensionPopup: { h: 393 }, backdrop: { w: W, h: H }, x: 81, y: 40 });
img(c.viewport.ref, "B1-selection-bubble-light.png", 1278, 718);
img(c.popup!.ref, "A1-idle-light.png", 360, 393);
console.log("K3-chrome viewport", c.viewport.x, c.viewport.y, c.viewport.w, c.viewport.h, "popup", c.popup!.x, c.popup!.y);

// 3. Tray flyout + toast
const f3 = mk("K3-tray", 2000);
const d = K3.desktopWithTaskbar(b, f3, { w: W, h: H, trayActive: true });
const fl = d.flyoutAt(370, 378);
const ph = b.frame(f3, { x: fl.x - 0, y: fl.y - 0, w: 370, h: 378, clip: true }); img(ph, "I10-tray-panel-idle-light.png", 370, 378);
const T1 = K3.TOAST.updateReady, T2 = { ...K3.TOAST.engineError, footer: "Opens the Speak Kit window" };
const t1 = K3.winToast(b, f3, { ...d.toastAt(K3.toastH(T1)), ...T1 });
K3.winToast(b, f3, { ...d.toastAt(K3.toastH(T2), K3.toastH(T1) + 8), ...T2 });
K3.nativeMenu(b, f3, { x: 120, y: 120, items: [{ l: "Back", k: "Alt+Left" }, { l: "Forward", k: "Alt+Right", disabled: true }, { l: "Reload", k: "Ctrl+R" }, "-", { l: "Speak Kit", sub: true, hi: true }, { l: "Save as...", k: "Ctrl+S" }, "-", { l: "Inspect", k: "Ctrl+Shift+I" }] });
K3.nativeMenu(b, f3, { x: 340, y: 120 + 8 + 32 * 4 + 9 - 4, items: [{ l: "Read selection" }, { l: "Read from here" }, { l: "Add to queue" }] });

mkdirSync(`${ROOT}/build`, { recursive: true }); mkdirSync(`${ROOT}/screens`, { recursive: true });
const tmp = `${ROOT}/build/png`; await $`rm -rf ${tmp}`.nothrow().quiet(); mkdirSync(tmp, { recursive: true });
b.add("file.exportMany", { ids: frames.map((f) => f.ref), scales: [2], naming: "{name}.{ext}", dir: tmp });
writeFileSync(`${ROOT}/build/k3.json`, JSON.stringify(b.cmds.map(({ command, params, as }) => ({ command, params, as }))));
const r = await $`${FC} run ${ROOT}/build/k3.json --out ${ROOT}/k3.figcraft`.nothrow().quiet();
const txt = r.stdout.toString() + r.stderr.toString();
console.log(txt.split("\n").filter((l) => l.includes('"ok":false') || l.startsWith("error")).join("\n").slice(0, 2500), "exit", r.exitCode);
for (const fn of readdirSync(tmp)) if (fn.endsWith(".png")) renameSync(`${tmp}/${fn}`, `${ROOT}/screens/${fn}`);
