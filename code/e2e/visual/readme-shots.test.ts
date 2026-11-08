// Recaptures the README images in docs/screenshots from the real build (extension in dist-visual, desktop app in apps/desktop/dist).
// Run: pnpm exec vp test run visual/readme-shots.test.ts   (from code/e2e, after the SPEAKKIT_TEST=1 builds of both apps)
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { pageScenarios } from "./pages";
import { appScenarios, desktopScenarios } from "./desktop";
import { popupScenarios, optionsScenarios, cur, type Scenario } from "./scenarios";
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

const shots: [Scenario[], string, string, string][] = [
  [appScenarios, "F1", "playing", "app-reader.png"],
  [desktopScenarios, "G1", "voices", "app-voices.png"],
  [appScenarios, "H5", "shortcuts", "app-shortcuts.png"],
  [popupScenarios, "A4", "playing", "popup-playing.png"],
  [pageScenarios, "B6", "reading-highlight", "page-highlight.png"],
  [optionsScenarios, "C4", "voice-speed", "options-voice.png"],
];

for (const [list, id, state, file] of shots) {
  it(file, async () => {
    const s = list.find((x) => x.id === id && x.state === state);
    if (!s) throw new Error(`no scenario ${id} ${state}`);
    Object.assign(cur, { id, state });
    const path = await s.run({ ext, env });
    copyFileSync(path, join(OUT, file));
    expect(path).toContain(id);
  });
}
