import { PAGES } from "./plan";
import { readdirSync } from "fs";
const reg = new Set<string>();
for (const f of readdirSync(import.meta.dir).filter((f) => /^s_.*\.ts$/.test(f))) { const m: any = await import(`./${f}`); for (const k of Object.keys(m)) if (Array.isArray(m[k])) for (const s of m[k]) if (s?.id) reg.add(s.id); }
let n = 0, miss: string[] = [];
for (const p of PAGES) { let pn = 0; for (const s of p.sections) for (const f of s.frames) { pn++; if (!reg.has(f.src ?? f.id)) miss.push(f.id); } console.log(p.name, p.sections.length, "sections", pn, "frames"); n += pn; }
console.log("total", n, "missing", miss.join(","));
const used = new Set(PAGES.flatMap((p) => p.sections.flatMap((s) => s.frames.map((f) => f.src ?? f.id))));
console.log("builders unused", [...reg].filter((r) => !used.has(r)).join(","));
