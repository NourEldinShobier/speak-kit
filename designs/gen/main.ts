// Builds the SpeakKit design file in Lumen's structure: pages > numbered sections (1140 px, white) > frames 1440x900 (x=100,y=140, 100 px gaps).
// bun main.ts [id ...]   (ids restrict the build; OUT / PNG env override the staging folder designs/next)
import { $ } from "bun";
import { writeFileSync, mkdirSync, readdirSync, renameSync, existsSync, readFileSync } from "fs";
import { B } from "./lib";
import { LIGHT, DARK } from "./kit";
import { S } from "./types";
import { PAGES, FD } from "./plan";

const FC = "C:/Users/USER/AppData/Local/Programs/FigCraft/figcraft-cli.exe";
const ROOT = "D:/workspaces/speak-it/designs/next";
const OUT = process.env.OUT ?? ROOT + "/speakkit.figcraft";
const PNG = process.env.PNG ?? ROOT + "/screens";
const BUILD = process.env.BUILD ?? ROOT + "/build";
const SCALE = process.env.SCALE ?? "2";

// ---- registry of every screen builder (old s_*.ts plus new modules) ----
const reg = new Map<string, S>();
for (const f of readdirSync(import.meta.dir).filter((f) => /^s_.*\.ts$/.test(f))) {
  const mod: any = await import(`./${f}`);
  for (const k of Object.keys(mod)) if (Array.isArray(mod[k])) for (const s of mod[k] as S[]) if (s && s.id && s.build) reg.set(s.id, s);
}
const only = process.argv.slice(2);
const wanted = (id: string) => !only.length || only.some((o) => (o.endsWith("*") ? id.startsWith(o.slice(0, -1)) : o === id));

const clean = (s: string) => s.replace(/:\s/g, ", ").replace(/[:"<>|?*\\/]/g, " ").replace(/\s+/g, " ").trim();
const firstSentence = (n: string) => { const m = n.match(/^.*?[.!?](\s|$)/); const s = (m ? m[0] : n).trim(); return s.length > 96 ? s.slice(0, 93).replace(/[ ,;:]+\S*$/, "") + "..." : s; };
const frameName = (fd: FD, s: S) => {
  const tag = fd.tag ? fd.tag + " · " : "";
  return clean(`${fd.id} · ${tag}${(fd.title ?? s.title).replace(" · ", ", ").replace(/ \((dark|light)\)$/, "")} — ${fd.rule ?? firstSentence(s.note)}`).slice(0, 150);
};

const b = new B();
const P = (c: string, p: any, as?: string) => b.add(c, p, as);
const exportRefs: { id: string; ref: any; name: string }[] = [];
const manifest: any = { pages: [], features: [], screens: [] };
let missing = 0;
PAGES.forEach((pg, pi) => {
  if (pi === 0) P("page.rename", { name: pg.name });
  else { P("page.add", { name: pg.name }); P("page.select", { index: pi }); }
  P("page.setBackground", { color: "#F5F5F5" });
  let y = 0; let n = 0;
  const mp: any = { name: pg.name, sections: [] };
  for (const sec of pg.sections) {
    n++;
    const frames = sec.frames.filter((fd) => wanted(fd.id) && reg.has(fd.src ?? fd.id));
    for (const fd of sec.frames) if (wanted(fd.id) && !reg.has(fd.src ?? fd.id)) { console.log("MISSING builder", fd.src ?? fd.id); missing++; }
    if (!frames.length) continue;
    const dims = frames.map((fd) => { const s = reg.get(fd.src ?? fd.id)!; return { fw: Math.max(1440, s.w + 160), fh: Math.max(900, s.h + 100) }; });
    const secW = 100 + dims.reduce((a, d) => a + d.fw + 100, 0);
    const secH = Math.max(1140, 140 + Math.max(...dims.map((d) => d.fh)) + 100);
    const secName = clean(`${n} · ${sec.title} — ${sec.cover}`);
    const sref = b.frame(undefined, { name: secName, x: 0, y, w: secW, h: secH, fill: "#FFFFFF", stroke: "#0000001A", sw: 1, sa: "inside", clip: false });
    b.text(sref, `${n} · ${sec.title}`, { x: 100, y: 48, size: 32, weight: "SemiBold", c: "#202020" });
    b.text(sref, sec.cover, { x: 100, y: 96, size: 15, c: "#606060" });
    const ms: any = { n, title: sec.title, cover: sec.cover, frames: [] };
    let x = 100;
    frames.forEach((fd, i) => {
      const s = reg.get(fd.src ?? fd.id)!;
      const dark = (fd.theme ?? "dark") === "dark";
      const t = dark ? DARK : LIGHT;
      const { fw, fh } = dims[i];
      const name = frameName(fd, s);
      const narrow = s.w <= 800;
      const wrap = b.frame(sref, { name, x, y: 140, w: fw, h: fh, fill: dark ? "#0F1011" : "#DEDFE3", clip: true });
      const ox = narrow ? 120 : Math.round((fw - s.w) / 2); const oy = narrow ? Math.max(40, Math.round((fh - s.h) / 2)) : Math.round((fh - s.h) / 2);
      const root = b.frame(wrap, { name: `${fd.id} screen`, x: ox, y: oy, w: s.w, h: s.h, fill: t.bg, clip: true, r: 12 });
      s.build(b, t, root);
      if (narrow) {
        const rc = b.col(wrap, { x: ox + s.w + 64, y: oy, w: 420, pad: 16, gap: 8, r: 12, fill: t.surface, stroke: t.border, sw: 1, sa: "inside" });
        b.text(rc, `${fd.id} rules`, { size: 11, weight: "SemiBold", c: t.text3, ls: 0.5 });
        const rules = (fd.rules ?? s.note.split(/(?<=[.!?])\s+/)).filter(Boolean).slice(0, 4);
        rules.forEach((r) => { const row = b.row(rc, { w: "fill", gap: 8, align: "start" }); b.ellipse(row, { w: 4, h: 4, fill: t.text3, y: 7 }); b.text(row, r, { size: 12, c: t.text2, w: "fill", lh: 17 }); });
        b.text(rc, `${dark ? "Dark" : "Light"} theme · ${s.w} px wide`, { size: 11, c: t.text3 });
      }
      exportRefs.push({ id: fd.id, ref: wrap, name });
      ms.frames.push({ id: fd.id, src: fd.src ?? fd.id, title: (fd.title ?? s.title).replace(/ \((dark|light)\)$/, ""), rule: fd.rule ?? firstSentence(s.note), note: s.note, theme: dark ? "dark" : "light", tag: fd.tag ?? "", w: fw, h: fh, name });
      x += fw + 100;
    });
    y += secH + 160;
    mp.sections.push(ms);
    manifest.features.push({ key: `${pi + 1}.${n}`, page: pg.name, n, title: sec.title, cover: sec.cover, ids: ms.frames.map((f: any) => f.id) });
    for (const f of ms.frames) manifest.screens.push({ ...f, feature: `${pi + 1}.${n}`, page: pg.name });
  }
  manifest.pages.push(mp);
});
mkdirSync(BUILD, { recursive: true });
mkdirSync(PNG, { recursive: true });
const tmp = BUILD + "/png";
await $`rm -rf ${tmp}`.nothrow().quiet();
mkdirSync(tmp, { recursive: true });
if (process.env.EXPORT !== "0") b.add("file.exportMany", { ids: exportRefs.map((e) => e.ref), scales: [Number(SCALE)], naming: "{name}.{ext}", dir: tmp }, "exp");
const script = BUILD + "/script.json";
writeFileSync(script, JSON.stringify(b.cmds.map(({ command, params, as }) => ({ command, params, as }))));
console.log("commands", b.cmds.length, "frames", exportRefs.length, "missing", missing);
const t0 = Date.now();
const r = await $`${FC} run ${script} --out ${OUT}`.nothrow().quiet();
const txt = r.stdout.toString() + r.stderr.toString();
const bad = txt.split("\n").filter((l) => l.includes('"ok":false') || l.toLowerCase().startsWith("error"));
if (bad.length) console.log(bad.join("\n").slice(0, 3000));
console.log("run exit", r.exitCode, ((Date.now() - t0) / 1000).toFixed(0) + "s");
if (process.env.EXPORT !== "0" && r.exitCode === 0) {
  const files = readdirSync(tmp);
  let got = 0;
  for (const e of exportRefs) {
    const f = files.find((fn) => fn.startsWith(e.name.slice(0, 60).replace(/ +$/, "")) && fn.endsWith(".png"));
    if (!f) { console.log("missing png for", e.id); continue; }
    renameSync(`${tmp}/${f}`, `${PNG}/${e.id}.png`); got++;
  }
  console.log("exported", got);
}
if (!only.length) writeFileSync(`${ROOT}/manifest.json`, JSON.stringify(manifest, null, 1));
