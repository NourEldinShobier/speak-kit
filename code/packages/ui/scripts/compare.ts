/**
 * Visual check: screenshots every [data-spec] cell of the gallery (2x) and diffs it against the
 * Lumen reference PNGs in docs/lumen-components. Writes ref | mine | diff images and report.json to out/compare.
 *   pnpm exec vp run compare   (or: node scripts/compare.ts [--only <text>] [--no-build])
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { build } from "vite-plus";
import { serveDir } from "./serve.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = resolve(root, "../../../docs/lumen-components");
const OUT = resolve(root, "out/compare");
const args = process.argv.slice(2);
const opt = (n: string) => args[args.indexOf(n) + 1];
const only = args.includes("--only") ? opt("--only") : undefined;
const themes = ["light"];

if (!args.includes("--no-build")) {
  await build({ configFile: resolve(root, "vite.config.ts"), logLevel: "silent" });
}
mkdirSync(OUT, { recursive: true });

const { url, server } = await serveDir(resolve(root, "out/gallery"));
const browser = await chromium.launch();
const page = await (await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1500, height: 1000 } })).newPage();
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.waitForSelector("[data-spec]");

interface Row {
  id: string;
  theme: string;
  ref: string;
  mine: string;
  sizeDelta: string;
  diffPct: number;
  hardPct: number;
  topColor: string;
}
const rows: Row[] = [];
const missing: string[] = [];

const blend = (png: PNG, bg: [number, number, number]) => {
  for (let i = 0; i < png.data.length; i += 4) {
    const a = (png.data[i + 3] ?? 255) / 255;
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round((png.data[i + c] ?? 0) * a + bg[c]! * (1 - a));
    png.data[i + 3] = 255;
  }
};
const top = (png: PNG, bg: [number, number, number]) => {
  const m = new Map<string, number>();
  for (let i = 0; i < png.data.length; i += 4) {
    const k = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
    if (k === bg.join(",")) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
};

for (const theme of themes) {
  await page.evaluate((t) => {
    document.body.style.visibility = "";
    (document.querySelectorAll("[data-panel]") as NodeListOf<HTMLElement>).forEach((p) => {
      p.style.display = p.dataset.panel === t ? "" : "none";
    });
  }, theme);
  const ids = await page.$$eval(`[data-panel="${theme}"] [data-spec]`, (els) => els.map((e) => (e as HTMLElement).dataset.spec as string));
  for (const id of ids) {
    if (only && !id.includes(only)) continue;
    const refFile = resolve(REF, `${id}-${theme}.png`);
    if (!existsSync(refFile)) {
      missing.push(id);
      continue;
    }
    const ref = PNG.sync.read(readFileSync(refFile));
    const info = await page.evaluate(
      ([t, sid]) => {
        const el = document.querySelector(`[data-panel="${t}"] [data-spec="${sid}"]`) as HTMLElement;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const bg = getComputedStyle(el.closest("[data-panel]") as Element).backgroundColor;
        return {
          x: r.x + scrollX,
          y: r.y + scrollY,
          w: r.width,
          h: r.height,
          bg,
          ring: el.dataset.ring === "1",
          shadow: el.dataset.shadow?.split(" ").map(Number),
        };
      },
      [theme, id] as const,
    );
    const bg = (info.bg.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number) as [number, number, number];
    const rw = ref.width / 2;
    const rh = ref.height / 2;
    // bleed (outside ring / shadow extent) in CSS px, derived from the cell's data-* markers
    let [t, r, b, l] = [0, 0, 0, 0];
    if (info.ring) [t, r, b, l] = [2, 2, 2, 2];
    if (info.shadow && info.shadow.length === 2) {
      const [sy = 0, blur = 0] = info.shadow;
      [t, r, b, l] = [blur - sy, blur, blur + sy, blur];
    }
    await page.evaluate(
      ([t2, sid, color]) => {
        document.body.style.visibility = "hidden";
        document.documentElement.style.background = color as string;
        const el = document.querySelector(`[data-panel="${t2}"] [data-spec="${sid}"]`) as HTMLElement;
        el.style.visibility = "visible";
      },
      [theme, id, info.bg] as const,
    );
    const buf = await page.screenshot({
      fullPage: true,
      clip: { x: info.x - l, y: info.y - t, width: rw, height: rh },
    });
    await page.evaluate(
      ([t2, sid]) => {
        document.body.style.visibility = "";
        (document.querySelector(`[data-panel="${t2}"] [data-spec="${sid}"]`) as HTMLElement).style.visibility = "";
      },
      [theme, id] as const,
    );
    const mine = PNG.sync.read(buf);
    blend(ref, bg);
    const w = Math.min(ref.width, mine.width);
    const h = Math.min(ref.height, mine.height);
    const crop = (p: PNG) => {
      const o = new PNG({ width: w, height: h });
      PNG.bitblt(p, o, 0, 0, w, h, 0, 0);
      return o;
    };
    const a = crop(ref);
    const m = crop(mine);
    const diff = new PNG({ width: w, height: h });
    const n = pixelmatch(a.data, m.data, diff.data, w, h, { threshold: 0.1, includeAA: false });
    let hard = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(Math.abs((a.data[i] ?? 0) - (m.data[i] ?? 0)), Math.abs((a.data[i + 1] ?? 0) - (m.data[i + 1] ?? 0)), Math.abs((a.data[i + 2] ?? 0) - (m.data[i + 2] ?? 0)));
      if (d > 24) hard++;
    }
    const out = new PNG({ width: w * 3 + 16, height: h });
    out.data.fill(40);
    PNG.bitblt(a, out, 0, 0, w, h, 0, 0);
    PNG.bitblt(m, out, 0, 0, w, h, w + 8, 0);
    PNG.bitblt(diff, out, 0, 0, w, h, 2 * w + 16, 0);
    writeFileSync(resolve(OUT, `${id}-${theme}.png`), PNG.sync.write(out));
    rows.push({
      id,
      theme,
      ref: `${rw}x${rh}`,
      mine: `${mine.width / 2}x${mine.height / 2}`,
      sizeDelta: `${info.w - (rw - l - r)}x${info.h - (rh - t - b)}`,
      diffPct: +((n / (w * h)) * 100).toFixed(2),
      hardPct: +((hard / (w * h)) * 100).toFixed(2),
      topColor: top(a, bg) === top(m, bg) ? "same" : `ref ${top(a, bg)} / mine ${top(m, bg)}`,
    });
  }
}

writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ rows, missing }, null, 2));
console.log("id".padEnd(44), "theme".padEnd(6), "ref".padEnd(9), "elDelta".padEnd(9), "diff%".padEnd(7), "hard%".padEnd(7), "fill");
for (const r of rows) console.log(r.id.padEnd(44), r.theme.padEnd(6), r.ref.padEnd(9), r.sizeDelta.padEnd(9), String(r.diffPct).padEnd(7), String(r.hardPct).padEnd(7), r.topColor);
console.log(`\ncompared ${rows.length}; gallery cells without a reference PNG: ${missing.join(", ") || "none"}`);
await browser.close();
server.close();
