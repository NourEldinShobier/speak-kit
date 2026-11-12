import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vite-plus/test";

const here = path.dirname(fileURLToPath(import.meta.url));
export const appDir = path.resolve(here, "..");
// Playwright lives in the e2e workspace package; desktop does not depend on it.
const e2eRequire = createRequire(path.resolve(appDir, "../../e2e/package.json"));
export const { _electron } = e2eRequire("@playwright/test") as typeof import("@playwright/test");
export const electronPath = createRequire(path.join(appDir, "package.json"))("electron") as string;

// The root `vp test run` does not read this package's vite config: say here what starting a whole Electron app (and what follows) needs.
// The e2e specs import this file too, outside vitest.
if (process.env.VITEST) vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// Test files run in parallel workers. Each worker gets its own block of ports, below the Windows dynamic range (49152 and up): a port taken
// by another file's app makes the app move to the next one, and the test would talk to that other server.
const PORTS_PER_WORKER = 30;
// SPEAKKIT_TEST_PORT_OFFSET moves the whole block (a multiple of 30) so two checkouts can run their desktop tests at the same time.
const portBase = 48100 + Number(process.env.SPEAKKIT_TEST_PORT_OFFSET ?? 0) + Number(process.env.VITEST_POOL_ID ?? 0) * PORTS_PER_WORKER;
let portsGiven = 0;
export const freePort = () => portBase + (portsGiven++ % PORTS_PER_WORKER);

/** Windows can keep a file open for a moment after its process is gone (antivirus, a child process): retry EPERM/EBUSY. A directory left in temp is harmless. */
export const removeDir = (dir: string) => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});

export interface Launched {
  app: import("@playwright/test").ElectronApplication;
  page: import("@playwright/test").Page;
  userData: string;
  port: number;
  cleanup(): Promise<void>;
}

export async function launch(opts: { env?: Record<string, string>; config?: object; userData?: string; port?: number; args?: string[] } = {}): Promise<Launched> {
  const userData = opts.userData ?? mkdtempSync(path.join(tmpdir(), "speakkit-desktop-"));
  if (opts.config) writeFileSync(path.join(userData, "config.json"), JSON.stringify(opts.config));
  const port = opts.port ?? freePort();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ELECTRON_RUN_AS_NODE") env[k] = v;
  Object.assign(env, {
    SPEAKKIT_ENGINE: "fake",
    SPEAKKIT_USER_DATA: userData,
    SPEAKKIT_PORT: String(port),
    SPEAKKIT_QUIET_NOTIFY: "1",
    ...opts.env,
  });
  const app = await _electron.launch({ executablePath: electronPath, args: [appDir, ...(opts.args ?? [])], env });
  const page = await app.firstWindow();
  // The app window opens at 1280x800 unless the screen's work area is smaller (a hosted runner is 1024x768): it is then clamped to the screen
  // and the layout shrinks to the screen. Resizing after it opened is not clamped. The setup window is not resizable and fits any screen.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    if (w.isResizable()) w.setContentSize(1280, 800);
  });
  return {
    app,
    page,
    userData,
    port,
    cleanup: async () => {
      // A quit that does not finish must not hold the next test for the length of a hook timeout: say so, then end the process.
      const proc = app.process();
      const closed = await Promise.race([
        app.close().then(
          () => true,
          () => true,
        ),
        new Promise<boolean>((r) => setTimeout(() => r(false), 20_000)),
      ]);
      if (!closed) {
        console.warn(`the app did not quit within 20 s (port ${port}): ended it`);
        proc.kill();
      }
      if (!opts.userData) await removeDir(userData);
    },
  };
}

export const health = (port: number) => fetch(`http://127.0.0.1:${port}/v1/health`).then((r) => r.json() as Promise<{ app: string; engine: { state: string } }>);
