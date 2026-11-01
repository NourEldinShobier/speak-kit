import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as netServer } from "node:net";
import type { Page } from "@playwright/test";
import { GROUPS, S, builtPath, type Ctx, type Scenario } from "./scenarios";
import { sleep } from "./support";

const here = dirname(fileURLToPath(import.meta.url));
const harnessPath = resolve(here, "../../apps/desktop/tests/harness.ts");

type Launch = typeof import("../../apps/desktop/tests/harness").launch;
let launchFn: Launch | null = null;
const getLaunch = async () => (launchFn ??= (await import(/* @vite-ignore */ harnessPath)).launch as Launch);

/** Content size inside the 1 px window border of the designs (window 1280x800). */
export const WIN = { width: 1278, height: 798 };
/** Setup window: 960x680 with its 1 px border. */
const SETUP = { width: 958, height: 678 };
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };

interface Opts { env?: Record<string, string>; config?: object; size?: { width: number; height: number }; drive?: (p: Page, ctx: { app: import("@playwright/test").ElectronApplication }) => Promise<void> }

async function desktopShot(c: Ctx, o: Opts) {
  const launch = await getLaunch();
  const l = await launch({ env: { SPEAKKIT_TEST: "1", ...o.env }, config: { theme: c.dark ? "dark" : "light", ...o.config } });
  try {
    const size = o.size ?? WIN;
    await l.app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]!; w.setContentSize(s.width, s.height); w.center(); }, size);
    await l.page.emulateMedia({ colorScheme: c.dark ? "dark" : "light" });
    await l.page.getByRole("heading").first().waitFor({ timeout: 15_000 });
    await sleep(700);
    if (o.drive) { await o.drive(l.page, { app: l.app }); await sleep(700); }
    const path = builtPath();
    await l.page.screenshot({ path, scale: "css" });
    return path;
  } finally {
    await l.cleanup();
  }
}

const press = (p: Page, name: RegExp | string) => p.getByRole("button", { name }).first().click();
const toEngine = async (p: Page) => { await press(p, /Get started/); await p.getByRole("heading", { name: "Choose a voice engine" }).waitFor(); };
const toDownload = async (p: Page) => { await toEngine(p); await press(p, /Download Kokoro/); };
const toConnect = async (p: Page) => { await toDownload(p); await p.getByRole("heading", { name: "Kokoro-82M is ready" }).waitFor(); await press(p, /^Continue/); await p.getByRole("heading", { name: "Connect your browser" }).waitFor(); };
const side = (name: string) => async (p: Page) => { await p.locator("aside").getByText(name, { exact: true }).first().click(); await sleep(600); };
const settings = (item: string) => async (p: Page) => { await side("Settings")(p); if (item !== "General") await side(item)(p); };

const SU = GROUPS.setup, H = GROUPS.home, V = GROUPS.voices, ST = GROUPS.settings, SY = GROUPS.system, E = GROUPS.errors;
const home = (id: string, state: string, group: Scenario["group"], title: string, o: Opts, extra: { design?: boolean } = {}) =>
  S(id, state, group, title, (c) => desktopShot(c, { ...o, config: { ...DONE, ...o.config } }), extra);

export const desktopScenarios: Scenario[] = [
  // setup window
  S("W1", "welcome", SU, "Setup 1 · Welcome", (c) => desktopShot(c, { size: SETUP,})),
  S("W2", "voice-engine", SU, "Setup 2 · Voice engine", (c) => desktopShot(c, { size: SETUP, drive: toEngine })),
  S("W3", "download", SU, "Setup 3 · Download", (c) => desktopShot(c, { size: SETUP, env: { SPEAKKIT_FAKE_STATE: "downloading" }, drive: async (p) => { await toDownload(p); await sleep(800); } })),
  S("W3b", "download-failed", SU, "Setup 3 · Download paused (product: failed with Retry)", (c) => desktopShot(c, { size: SETUP, env: { SPEAKKIT_FAKE_STATE: "error" }, drive: async (p) => { await toDownload(p); await sleep(1500); } })),
  S("W4", "connect-browser", SU, "Setup 4 · Connect browser", (c) => desktopShot(c, { size: SETUP, drive: toConnect })),
  S("W4", "connect-browser-token", SU, "Setup 4 · Connect browser (token revealed and copied)", (c) => desktopShot(c, { size: SETUP, drive: async (p) => { await toConnect(p); await p.getByRole("button", { name: "Reveal" }).click(); await p.getByRole("button", { name: "Copy" }).click(); await sleep(300); } }), { design: false }),
  S("W5", "done", SU, "Setup 5 · Done", (c) => desktopShot(c, { size: SETUP, drive: async (p) => { await toConnect(p); await p.getByRole("button", { name: "Reveal" }).click(); await p.getByRole("button", { name: "Copy" }).click(); await press(p, /^Continue/); await p.getByRole("heading", { name: "You're all set" }).waitFor(); } })),
  S("W5", "done-skipped", SU, "Setup 5 · Done (browser step skipped)", (c) => desktopShot(c, { size: SETUP, drive: async (p) => { await toConnect(p); await press(p, /Skip for now/); await p.getByRole("heading", { name: "Setup is finished" }).waitFor(); } }), { design: false }),

  // home and shell
  home("L1", "home", H, "Home", {}),
  home("L2", "palette", H, "Command palette", { drive: async (p) => { await p.keyboard.press("Control+k"); await sleep(400); } }),
  home("L3", "palette-filtered", H, "Command palette (filtered)", { drive: async (p) => { await p.keyboard.press("Control+k"); await sleep(300); await p.keyboard.type("mem"); await sleep(400); } }),
  home("L4", "narrow-rail", H, "Narrow window (rail)", { size: { width: 1013, height: 766 } }),
  home("L1", "new-reading", H, "New reading dialog", { drive: async (p) => { await p.locator("aside").getByText("New reading").first().click(); await sleep(500); } }, { design: false }),
  home("L1", "notifications", H, "Notifications popover", { drive: async (p) => { await p.getByRole("button", { name: "Notifications" }).first().click(); await sleep(500); } }, { design: false }),
  home("L1", "sidebar-collapsed", H, "Home with the sidebar hidden", { drive: async (p) => { await p.getByRole("button", { name: "Toggle sidebar" }).click(); await sleep(400); } }, { design: false }),

  // voices and engines
  home("G1", "voices", V, "Voices · library", { drive: side("Voices") }),
  home("G8", "engines", V, "Engines · overview", { drive: side("Engines") }),
  home("O2", "engines-unloaded", V, "Engines · unloaded", { env: { SPEAKKIT_FAKE_STATE: "unloaded" }, drive: side("Engines") }),
  home("O3", "engines-loading", V, "Engines · loading", { env: { SPEAKKIT_FAKE_STATE: "loading" }, drive: side("Engines") }),
  home("G10", "engines-error", V, "Engines · engine error (design: out of GPU memory)", { env: { SPEAKKIT_FAKE_STATE: "error" }, drive: side("Engines") }, { design: false }),
  home("H4", "browser-page", V, "Browser page", { drive: side("Browser") }, { design: false }),

  // settings
  home("H1", "general", ST, "Settings · General", { drive: settings("General") }),
  home("H2", "voice-playback", ST, "Settings · Voice and playback", { drive: settings("Voice and playback") }),
  home("H4", "browser-integration", ST, "Settings · Browser integration", { drive: settings("Browser integration") }),
  home("H12", "memory", ST, "Settings · Memory", { drive: settings("Memory") }),
  home("H13", "memory-unloaded", ST, "Settings · Memory (engine unloaded)", { env: { SPEAKKIT_FAKE_STATE: "unloaded" }, drive: settings("Memory") }),
  home("H6", "storage", ST, "Settings · Storage", { drive: settings("Storage") }),
  home("H8", "about", ST, "Settings · About", { drive: settings("About") }),

  // system
  home("K11", "quit-confirmation", SY, "Quit confirmation", { drive: async (p, { app }) => { await app.evaluate(() => { const t = (globalThis as any).__speakkit; const q = t.trayItems().find((i: any) => i.label.startsWith('Quit')); t.clickTray(q.label); }); await p.getByRole("dialog").waitFor({ timeout: 5000 }); } }),

  // errors and edge states
  S("K2", "port-in-use", E, "Notice · port in use (the app falls back to another port)", async (c) => {
    const blocker = netServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    try {
      const port = (blocker.address() as { port: number }).port;
      return await desktopShot(c, { env: { SPEAKKIT_PORT: String(port) }, config: DONE });
    } finally {
      blocker.close();
    }
  }),
  home("K1", "engine-error", E, "Error · engine could not start (home)", { env: { SPEAKKIT_FAKE_STATE: "error" } }),
  home("H13", "home-engine-unloaded", E, "Home with the engine unloaded", { env: { SPEAKKIT_FAKE_STATE: "unloaded" } }, { design: false }),
];
