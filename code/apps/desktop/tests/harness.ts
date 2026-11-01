import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const appDir = path.resolve(here, "..");
// Playwright lives in the e2e workspace package; desktop does not depend on it.
const e2eRequire = createRequire(path.resolve(appDir, "../../e2e/package.json"));
const { _electron } = e2eRequire("@playwright/test") as typeof import("@playwright/test");
const electronPath = createRequire(path.join(appDir, "package.json"))("electron") as string;

let nextPort = 48100 + Math.floor(Math.random() * 400);
export const freePort = () => nextPort++;

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
  return {
    app,
    page,
    userData,
    port,
    cleanup: async () => {
      await app.close().catch(() => {});
      if (!opts.userData) rmSync(userData, { recursive: true, force: true });
    },
  };
}

export const health = (port: number) => fetch(`http://127.0.0.1:${port}/v1/health`).then((r) => r.json() as Promise<{ app: string; engine: { state: string } }>);
