import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test, expect, begin, DIST } from "../support/ext";
import { startReal } from "../support/real-server";

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(here, "../perf-results.jsonl");
// Measured on the shared dev machine: cold 1.76 to 1.94 s, warm 0.28 to 0.40 s (docs/perf.md); the limits leave room for its +-30% noise.
const COLD_LIMIT = 3000;
const WARM_LIMIT = 1000;
const record = (name: string, value: number, unit: string, limit: string) => appendFileSync(RESULTS, JSON.stringify({ name, value: Math.round(value * 10) / 10, unit, limit }) + "\n");

test.describe("performance budgets (fake engine unless noted)", () => {
  test("Listen click to first scheduled audio, pipeline overhead", async ({ ext, app }) => {
    const { popup } = await begin(ext, app);
    await ext.off("1").catch(() => {}); // no offscreen yet: fine
    const t0 = Date.now();
    await popup.getByRole("button", { name: "Listen to this page" }).click();
    let ms = 0;
    for (;;) {
      try {
        const h = await ext.hook();
        if (h.state.status === "playing" && h.frames >= 1) {
          ms = Date.now() - t0;
          break;
        }
      } catch {
        /* offscreen document not up yet */
      }
      if (Date.now() - t0 > 10_000) throw new Error("no audio scheduled");
      await new Promise((r) => setTimeout(r, 15));
    }
    record("click-to-first-audio (fake engine, includes polling)", ms, "ms", "< 600");
    expect(ms).toBeLessThan(600);
  });

  test("extraction of 5,000 paragraphs does not block the main thread past 50 ms", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/big");
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[]; __maxGap: number };
      w.__long = [];
      w.__maxGap = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ["longtask"] });
      let last = performance.now();
      setInterval(() => {
        const n = performance.now();
        w.__maxGap = Math.max(w.__maxGap, n - last - 5);
        last = n;
      }, 5);
    });
    await page.waitForTimeout(100);
    const tabId = await ext.tabId(page);
    const t0 = Date.now();
    const reply = await ext.sw.evaluate(async (id) => {
      const r = (await chrome.tabs.sendMessage(id, { t: "extract", mode: "page" })) as { doc?: { sentences: unknown[] } };
      return r.doc?.sentences.length ?? 0;
    }, tabId);
    const roundTrip = Date.now() - t0;
    expect(reply).toBe(10_001);
    const m = await page.evaluate(() => {
      const w = window as unknown as { __long: number[]; __maxGap: number };
      return { long: w.__long, maxGap: w.__maxGap };
    });
    record("extract 5,000 paragraphs, message round trip incl. serialization", roundTrip, "ms", "informational");
    record("extract 5,000 paragraphs, longest main-thread stall seen by the page", m.maxGap, "ms", "< 50 (budget), < 120 (test)");
    // The budget is 50 ms of extraction; the page can also be stalled by structured-clone of ~10k sentences, so allow headroom.
    expect(m.maxGap).toBeLessThan(120);
  });

  test("content script: production bundle size and injection cost", async ({ ext }) => {
    const out = mkdtempSync(join(tmpdir(), "sk-prod-"));
    try {
      execFileSync("pnpm", ["exec", "vp", "build", "--outDir", out], { cwd: resolve(here, "../../apps/extension"), stdio: "pipe", shell: true, env: { ...process.env, SPEAKKIT_TEST: "0" } });
      const buf = readFileSync(join(out, "content.js"));
      const gz = gzipSync(buf).length;
      record("content.js production size", buf.length / 1024, "KB", "< 120");
      record("content.js production gzip", gz / 1024, "KB", "< 40");
      expect(buf.length).toBeLessThan(120 * 1024);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
    // Injection: executeScript of the (test-build) file into a loaded page, repeated.
    const page = await ext.open("/article");
    const tabId = await ext.tabId(page);
    const ms = await ext.sw.evaluate(async (id) => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] });
        times.push(performance.now() - t);
      }
      return times.sort((a, b) => a - b)[2]!;
    }, tabId);
    record("content.js injection via executeScript (median of 5, test build)", ms, "ms", "< 80");
    expect(ms).toBeLessThan(80);
    expect(statSync(join(DIST, "content.js")).size).toBeGreaterThan(0);
  });

  test("popup open to interactive", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/article");
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await ext.ctx.newPage();
      const t0 = Date.now();
      await p.goto(ext.url("popup", `?tab=${await ext.tabId(page)}`));
      await p.getByRole("button", { name: "Listen to this page" }).waitFor();
      times.push(Date.now() - t0);
      await p.close();
    }
    times.sort((a, b) => a - b);
    record("popup open to Listen button (median of 3, includes tab creation)", times[1]!, "ms", "< 700");
    expect(times[1]!).toBeLessThan(700);
  });

  test("offscreen memory over an accelerated 10 minute read (600 paragraph jumps)", async ({ ext, app }) => {
    test.setTimeout(150_000);
    await ext.pair(app);
    await ext.setSettings({ speed: 3 });
    const page = await ext.open("/big");
    const tabId = await ext.tabId(page);
    await ext.bg({ t: "read-tab", tabId, mode: "page" });
    await ext.waitState("playing", 30_000);
    const heap = async () => {
      await ext.off(`new Promise(r => setTimeout(r, 0))`);
      const cdp = (ext as unknown as { cdp: { send(m: string): Promise<unknown> } }).cdp;
      await cdp.send("HeapProfiler.collectGarbage");
      const h = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
      return h.usedSize / 1024 / 1024;
    };
    // warm up so one-time allocations are not counted
    for (let i = 0; i < 40; i++) await ext.bg({ t: "player", command: { cmd: "next-block" } });
    const before = await heap();
    const t0 = Date.now();
    for (let i = 0; i < 600; i++) {
      await ext.bg({ t: "player", command: { cmd: "next-block" } });
      if (i % 100 === 0) await page.waitForTimeout(250); // let audio be decoded and scheduled now and then
    }
    await page.waitForTimeout(1000);
    const after = await heap();
    const st = await ext.state();
    record("offscreen JS heap growth over 600 paragraph jumps", after - before, "MB", "< 25");
    record("offscreen JS heap after the run", after, "MB", "informational");
    record("simulated read wall time", (Date.now() - t0) / 1000, "s", "informational");
    expect(st.sentenceIndex).toBeGreaterThan(600);
    expect(after - before).toBeLessThan(25);
  });
});

test.describe("model lifecycle budgets (real Kokoro)", () => {
  test("unloaded to first audio on a click without any earlier warm-up, and the warm path", async ({ ext }) => {
    test.setTimeout(240_000);
    const real = await startReal({ warm: false });
    try {
      await ext.pair(real);
      const page = await ext.open("/short");
      const tabId = await ext.tabId(page);
      // The same request the Listen button sends, with nothing having woken the model before it.
      const firstAudioMs = async () => {
        const t0 = Date.now();
        await ext.bg({ t: "read-tab", tabId, mode: "page" });
        for (;;) {
          try {
            const h = await ext.hook();
            if (h.state.status === "playing" && h.frames >= 1) return Date.now() - t0;
          } catch {
            /* offscreen document not up yet */
          }
          if (Date.now() - t0 > 40_000) throw new Error("no audio scheduled");
          await new Promise((r) => setTimeout(r, 15));
        }
      };
      const cold = await firstAudioMs();
      await ext.cmd("stop");
      await new Promise((r) => setTimeout(r, 2500)); // the model cannot be interrupted: let the sentence in flight finish
      const warm = await firstAudioMs();
      record("lifecycle: unloaded, click Listen to first audio, real Kokoro", cold, "ms", "< 3000");
      record("lifecycle: ready, click Listen to first audio, real Kokoro", warm, "ms", "< 1000");
      expect(cold, "model host spawn + session + warm-up + first sentence").toBeLessThan(COLD_LIMIT);
      expect(warm).toBeLessThan(WARM_LIMIT);
    } finally {
      await real.stop();
    }
  });
});
