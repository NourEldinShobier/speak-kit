import { afterAll, beforeAll, test } from "vite-plus/test";
import { bigPage } from "../../testing/fixtures";
import { launch, type Session } from "../../testing/harness";

let s: Session;
beforeAll(async () => { s = await launch(); }, 60000);
afterAll(async () => { await s?.close(); });

test("dump", async () => {
  const page = await s.page(bigPage(5000), { bundle: true });
  const out = await page.evaluate(() => {
    const E = (window as any).SK.extract;
    const skip = { navigation: true, citations: true, code: true, urls: true, captions: false };
    const res: any[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      const timing: any = {}; const ex = E.extract(document, { skip, timing });
      res.push({ ms: +(performance.now() - t0).toFixed(1), c: +timing.collect.toFixed(1), s: +timing.split.toFixed(1), r: +timing.ranges.toFixed(1), blocks: ex.blocks.length, sentences: ex.sentences.length });
    }
    return res;
  });
  (await import("node:fs")).writeFileSync("C:/Users/USER/AppData/Local/Temp/claude/D--workspaces-speak-it/c798ae4b-1c59-4631-bcd3-5a62c55f9422/scratchpad/dump.json", JSON.stringify(out));
}, 120000);
