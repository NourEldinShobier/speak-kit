import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appDir, launch, type Launched } from "./harness";

let l: Launched | undefined;
afterEach(async () => {
  await l?.cleanup();
  l = undefined;
});

interface Proc {
  type: string;
  ws: number;
  priv: number;
}
const procs = (x: Launched): Promise<Proc[]> =>
  x.app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ type: m.type, ws: m.memory.workingSetSize / 1024, priv: (m.memory.privateBytes ?? 0) / 1024 })));
const sum = (p: Proc[], k: "ws" | "priv") => Math.round(p.reduce((a, b) => a + b[k], 0));

describe("desktop resource budget", () => {
  it("unloaded model + hidden window: all app processes use under 150 MB of private memory and under 200 MB of working set", async () => {
    l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_FAKE_STATE: "unloaded", SPEAKKIT_TEST: "1", SPEAKKIT_DESTROY_MS: "2000" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await new Promise((r) => setTimeout(r, 2000));
    const visible = await procs(l);
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
    await new Promise((r) => setTimeout(r, 5000));
    const hidden = await procs(l);
    const out = {
      at: new Date().toISOString(),
      visibleWorkingSetMb: sum(visible, "ws"),
      hiddenWorkingSetMb: sum(hidden, "ws"),
      hiddenPrivateMb: sum(hidden, "priv"),
      hiddenByProcess: hidden.map((p) => `${p.type} ${Math.round(p.ws)} MB (private ${Math.round(p.priv)})`),
    };
    mkdirSync(path.join(appDir, "test-results"), { recursive: true });
    writeFileSync(path.join(appDir, "test-results", "desktop-memory.json"), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
    expect(out.hiddenPrivateMb).toBeLessThan(150);
    expect(out.hiddenWorkingSetMb).toBeLessThan(200);
    expect(hidden.length).toBe(1); // GPU and network service run inside the main process
  }, 60_000);
});
