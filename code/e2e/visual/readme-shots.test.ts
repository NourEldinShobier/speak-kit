// Recaptures the README images in docs/screenshots from the real build (extension in dist-visual, desktop app in apps/desktop/dist).
// Run: pnpm exec vp test run visual/readme-shots.test.ts   (from code/e2e, after the SPEAKKIT_TEST=1 builds of both apps)
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { pageScenarios } from "./pages";
import { desktopScenarios } from "./desktop";
import { appScenarios } from "./desktop-app";
import { popupScenarios, cur, type Scenario } from "./scenarios";
import { launchExt, startEnv, type Env, type Ext } from "./support";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/screenshots");
let env: Env;
let ext: Ext;
beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  env = await startEnv();
  ext = await launchExt();
});
afterAll(async () => {
  await ext?.close();
  await env?.close();
});

const shots: [Scenario[], string, string, boolean, string][] = [
  [appScenarios, "F1", "playing", false, "app-reader.png"],
  [appScenarios, "F1", "playing", false, "app-reader-light.png"],
  [desktopScenarios, "G1", "voices", false, "app-voices.png"],
  [appScenarios, "H5", "shortcuts", false, "app-shortcuts.png"],
  [popupScenarios, "A4", "playing", false, "popup-playing.png"],
  [pageScenarios, "B6", "reading-highlight", false, "page-highlight.png"],
];

for (const [list, id, state, dark, file] of shots) {
  it(file, async () => {
    const s = list.find((x) => x.id === id && x.state === state);
    if (!s) throw new Error(`no scenario ${id} ${state}`);
    Object.assign(cur, { id, state, dark });
    const path = await s.run({ ext, env, dark });
    copyFileSync(path, join(OUT, file));
    expect(path).toContain(id);
  });
}
