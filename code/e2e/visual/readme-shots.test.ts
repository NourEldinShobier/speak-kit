// Recaptures the README images in docs/screenshots from the real build (extension in dist-visual, desktop app in apps/desktop/dist).
// Run: pnpm exec vp test run visual/readme-shots.test.ts   (from code/e2e, after the SPEAKKIT_TEST=1 builds of both apps)
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { pageScenarios } from "./pages";
import { appScenarios, desktopScenarios } from "./desktop";
import { popupScenarios, optionsScenarios, cur, type Scenario } from "./scenarios";
import { launch } from "../../apps/desktop/tests/harness";
import { clip } from "../../packages/engine/tests/clip-fixture";
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

/** The clone flow at its name step: Chatterbox on a pretend GPU with the stand-in sidecar, an 8 s generated clip as the reference. */
it("app-cloning.png", async () => {
  const userData = mkdtempSync(join(tmpdir(), "speakkit-shot-"));
  mkdirSync(join(userData, "engines", "chatterbox"), { recursive: true });
  writeFileSync(join(userData, "engines", "chatterbox", "installed"), "x");
  const reference = join(userData, "reference.wav");
  writeFileSync(reference, clip(8));
  const sidecar = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/engine/tests/fake-sidecar.mjs");
  const l = await launch({
    userData,
    config: { setupDone: true, setupSkipped: false, preferredPort: 0 },
    env: { SPEAKKIT_TEST: "1", SPEAKKIT_FAKE_CHATTERBOX: `${process.execPath}|${sidecar}` },
  });
  try {
    await l.app.evaluate(({ BrowserWindow, dialog }, f) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.setContentSize(1278, 798);
      w.center();
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
    }, reference);
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", level: 1 }).waitFor();
    await l.page.getByRole("button", { name: "Clone a voice" }).click();
    await l.page.getByRole("radio", { name: /^Upload a clip/ }).click();
    await l.page.getByText(/the right to clone it/).click();
    await l.page.getByRole("button", { name: "Continue" }).click();
    await l.page.getByLabel("Name").waitFor({ timeout: 60_000 });
    await l.page.getByLabel("Name").fill("My voice");
    await new Promise((r) => setTimeout(r, 800));
    await l.page.screenshot({ path: join(OUT, "app-cloning.png"), scale: "css" });
  } finally {
    await l.cleanup();
    rmSync(userData, { recursive: true, force: true });
  }
});
