import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
import { nodeBuild } from "../node-build";
import { _electron, appDir, electronPath, removeDir } from "./harness";
import type { UtilityApi } from "./support/utility-host";

/** The real utility process spawner inside Electron: messages both ways, exit, terminate, and terminate before the process has spawned. */
let app: ElectronApplication;
let outDir: string;
let userData: string;
let files: { echo: string; idle: string; exit: string };

const call = <K extends keyof UtilityApi>(name: K, file: string, message?: unknown) =>
  app.evaluate((_e, [n, f, m]) => (globalThis as never as { __utility: Record<string, (f: string, m: unknown) => Promise<never>> }).__utility[n as string]!(f as string, m), [
    name,
    file,
    message,
  ] as const) as Promise<Awaited<ReturnType<UtilityApi[K]>>>;

beforeAll(async () => {
  outDir = path.join(appDir, "dist-utility-host");
  await nodeBuild("tests/support/utility-host.ts", outDir, "es", "host.js");
  userData = mkdtempSync(path.join(tmpdir(), "speakkit-utility-"));
  const dir = path.join(userData, "children");
  mkdirSync(dir);
  const write = (name: string, body: string) => (writeFileSync(path.join(dir, name), body), path.join(dir, name));
  files = {
    echo: write("echo.js", `process.parentPort.on("message", (e) => process.parentPort.postMessage({ echo: e.data }));`),
    idle: write("idle.js", `setInterval(() => {}, 1000);`),
    exit: write("exit.js", `process.exit(5);`),
  };
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ELECTRON_RUN_AS_NODE") env[k] = v;
  app = await _electron.launch({ executablePath: electronPath, args: [path.join(outDir, "host.js"), `--user-data-dir=${userData}`], env });
  await app.evaluate(async () => {
    for (let i = 0; i < 200 && !("__utility" in globalThis); i++) await new Promise((r) => setTimeout(r, 25));
  });
});

afterAll(async () => {
  await app?.close().catch(() => {});
  await removeDir(userData);
  await removeDir(outDir);
});

describe("utility process spawner", () => {
  it("carries a message each way and stops the process on terminate", async () => {
    const r = await call("echo", files.echo, { hello: 1 });
    expect(r.got).toEqual({ echo: { hello: 1 } });
    expect(r.aliveAfter).toBe(false);
  });

  it("reports a process that exits on its own", async () => {
    expect(await call("selfExit", files.exit)).toBe(5);
  });

  it("terminate straight after the fork resolves and leaves no process running", async () => {
    const r = await call("terminateAtOnce", files.idle);
    expect(r.ms).toBeLessThan(4500);
    expect(r.aliveAfter).toBe(false);
  });
});
