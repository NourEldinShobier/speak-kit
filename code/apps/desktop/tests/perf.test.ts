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

describe("startup marks", () => {
  it("main:ready, server:listening and window:shown happen in that order, within 5 s of the process start", async () => {
    l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_FAKE_STATE: "unloaded", SPEAKKIT_TEST: "1" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const marks = await l.app.evaluate(() => (globalThis as unknown as { __speakkit: { marks(): { name: string; at: number }[] } }).__speakkit.marks());
    const at = (name: string) => marks.find((m) => m.name === name)?.at ?? NaN;
    console.log(JSON.stringify(marks));
    expect(at("main:ready")).toBeLessThanOrEqual(at("server:listening"));
    expect(at("window:shown")).toBeGreaterThan(at("main:ready"));
    expect(at("server:listening")).toBeLessThan(5000);
  }, 60_000);
});

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

describe("main process responsiveness", () => {
  it("event loop: p99 delay under 50 ms and max under 250 ms while idle, p99 above the median within 10 ms off CI; idle CPU of all processes under 5%", async () => {
    l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_FAKE_STATE: "unloaded", SPEAKKIT_TEST: "1" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.app.evaluate(({ app }) => app.getAppMetrics());
    // "While idle" starts here: the app is up and shows Home. Starting the window and the server is the startup test's business and a shared runner can stall it for a second.
    await l.app.evaluate(() => (globalThis as unknown as { __speakkit: { loopReset(): void } }).__speakkit.loopReset());
    await new Promise((r) => setTimeout(r, 5000));
    const cpu = await l.app.evaluate(({ app }) => app.getAppMetrics().reduce((a, m) => a + m.cpu.percentCPUUsage, 0));
    const loop = await l.app.evaluate(() => (globalThis as unknown as { __speakkit: { loopDelay(): { p50Ms: number; p99Ms: number; maxMs: number } } }).__speakkit.loopDelay());
    // The histogram samples a timer, so every value includes the timer tick (about 15.6 ms on Windows, the resolution elsewhere): p99 minus
    // the median is the delay the app adds. the 10 ms target is on that number on a quiet machine, the gate below is for shared CI runners.
    const excessMs = loop.p99Ms - loop.p50Ms;
    console.log(JSON.stringify({ cpu, loop, excessMs }));
    expect(loop.p99Ms).toBeLessThan(50);
    expect(loop.maxMs).toBeLessThan(250);
    if (!process.env.CI) expect(excessMs).toBeLessThanOrEqual(10);
    expect(cpu).toBeLessThan(5);
  }, 60_000);
});
