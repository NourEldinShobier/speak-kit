import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vite-plus/test";
import { compare, designFile, type Result } from "./compare";
import { pageScenarios } from "./pages";
import { desktopScenarios } from "./desktop";
import { appScenarios } from "./desktop-app";
import { optionsScenarios, panelScenarios, popupScenarios, builtName, cur, type Ctx, type Scenario } from "./scenarios";
import { OUT, launchExt, startEnv, type Ext, type Env } from "./support";

// ONLY=A1,B6 limits ids; GROUP=popup,page limits by group prefix; STATE=slug filters states.
const list = (v?: string) =>
  v
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const only = list(process.env.ONLY);
const groups = list(process.env.GROUP)?.map((g) => g.toLowerCase());
const states = list(process.env.STATE);
const partial = !!(only || groups || states);
const results: Result[] = [];
let ext: Ext;
let env: Env;

beforeAll(async () => {
  env = await startEnv();
  ext = await launchExt();
});
afterAll(async () => {
  await ext?.close();
  await env?.close();
  mkdirSync(OUT, { recursive: true });
  // a partial run merges into the stored results so one group can be re-captured alone
  const file = join(OUT, "results.json");
  let merged = results;
  if (partial && existsSync(file)) {
    const old: Result[] = JSON.parse(readFileSync(file, "utf8"));
    const k = (r: Result) => `${r.id}-${r.state}-${r.theme}`;
    const fresh = new Set(results.map(k));
    merged = [...old.filter((r) => !fresh.has(k(r))), ...results];
  }
  writeFileSync(file, JSON.stringify(merged, null, 1));
});

const all: Scenario[] = [...popupScenarios, ...pageScenarios, ...optionsScenarios, ...panelScenarios, ...desktopScenarios, ...appScenarios];

describe("visual capture", () => {
  for (const s of all) {
    if (only && !only.includes(s.id)) continue;
    if (groups && !groups.some((g) => s.group.toLowerCase().includes(g))) continue;
    if (states && !states.includes(s.state)) continue;
    it(`${s.id} ${s.state}`, async () => {
      Object.assign(cur, { id: s.id, state: s.state });
      const c: Ctx = { ext, env };
      const path = await s.run(c);
      const base = { id: s.id, state: s.state, theme: "light" as const, group: s.group, title: s.title, file: builtName(s.id, s.state) };
      const design = s.design === false ? null : designFile(s.id);
      const r = compare({ ...base, design: design ? design.split(/[\/]/).pop() : undefined }, path, design);
      if (!r.design) r.note = s.design === false ? "product-only" : "no light twin";
      results.push(r);
      console.log(`[visual] ${r.id} ${r.state} diff ${r.diffPct ?? "-"}% ${r.note ?? ""}`);
    });
  }
});
