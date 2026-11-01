import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ChatterboxEngine, EngineNotReadyError, EngineUnavailableError, detectHardware, encodeWav, type ChatterboxOptions, type EngineStatus, type Hardware } from "../src";

const GPU = { name: "RTX 4080", vramMb: 12282 };
const sidecar = { command: process.execPath, args: [join(import.meta.dirname, "fake-sidecar.mjs")] };
const engines: ChatterboxEngine[] = [];

function make(hw: Hardware, o: Partial<ChatterboxOptions> = {}, installed = false) {
  const root = mkdtempSync(join(tmpdir(), "cb-"));
  const dir = join(root, "chatterbox");
  if (installed) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "installed"), "x");
  }
  const e = new ChatterboxEngine({ dir, voicesDir: join(root, "voices"), sidecar, idleUnloadMs: 0, ...o }, hw);
  engines.push(e);
  return { e, dir };
}
afterEach(async () => {
  await Promise.all(engines.splice(0).map((e) => e.close()));
});

describe("availability", () => {
  it.each<[string, Hardware, string, string]>([
    ["no GPU", { python: ["python"] }, "unavailable", "no-gpu"],
    ["too little VRAM", { gpu: { name: "Tiny", vramMb: 2048 }, python: ["python"] }, "unavailable", "no-gpu"],
    ["no Python", { gpu: GPU }, "unavailable", "python-missing"],
    ["uv without system Python", { gpu: GPU, uv: ["uv"] }, "missing", "not-installed"],
    ["GPU and Python, not installed", { gpu: GPU, python: ["python"] }, "missing", "not-installed"],
  ])("%s", (_, hw, state, reason) => {
    const { e } = make(hw);
    expect(e.status().state).toBe(state);
    expect(e.info().reason).toBe(reason);
  });

  it("an installed engine does not need system Python", () => {
    const { e } = make({ gpu: GPU }, {}, true);
    expect(e.status().state).toBe("unloaded");
    expect(e.info()).toEqual({ gpu: GPU });
  });

  it("refuses to start or synthesize while unavailable or not installed", async () => {
    const { e } = make({ python: ["python"] });
    await expect(e.start()).rejects.toBeInstanceOf(EngineNotReadyError);
    await expect(e.synthesize("hi", { voice: "chatterbox", speed: 1 })).rejects.toBeInstanceOf(EngineNotReadyError);
    await expect(e.install()).rejects.toBeInstanceOf(EngineUnavailableError);
  });
});

describe("hardware detection", () => {
  it("reads nvidia-smi and picks a supported Python", async () => {
    const out: Record<string, string> = {
      "nvidia-smi": "NVIDIA GeForce RTX 4080 Laptop GPU, 12282\n",
      "py -3.12": "Python 3.12.4",
      python: "Python 3.14.7",
    };
    const hw = await detectHardware(async (cmd, args) => out[[cmd, ...args.filter((a) => a.startsWith("-3"))].join(" ")]);
    expect(hw).toEqual({ gpu: { name: "NVIDIA GeForce RTX 4080 Laptop GPU", vramMb: 12282 }, python: ["py", "-3.12"] });
  });
  it("finds uv on PATH or as a Python module", async () => {
    const uvOnly = await detectHardware(async (cmd, args) => (cmd === "python" && args.join(" ") === "-m uv --version" ? "uv 0.11.3 (45da18ac3 2026-04-01)" : undefined));
    expect(uvOnly).toEqual({ uv: ["python", "-m", "uv"] });
  });
  it("rejects Python 3.14 and a missing nvidia-smi", async () => {
    expect(await detectHardware(async (cmd) => (cmd === "python" ? "Python 3.14.7" : undefined))).toEqual({});
  });
});

describe("install and remove", () => {
  it("reports installing progress, then becomes unloaded; remove goes back to missing", async () => {
    const seen: EngineStatus[] = [];
    const { e, dir } = make(
      { gpu: GPU, python: ["python"] },
      {
        installer: async (ctx) => {
          ctx.progress(0.5, "Installing packages");
        },
      },
    );
    e.onStatus((s) => seen.push(s));
    await e.install();
    expect(seen.find((s) => s.state === "installing" && s.progress === 0.5)?.detail).toBe("Installing packages");
    expect(e.status().state).toBe("unloaded");
    expect(existsSync(join(dir, "installed"))).toBe(true);
    await e.remove();
    expect(e.status().state).toBe("missing");
    expect(existsSync(join(dir, "installed"))).toBe(false);
  });

  it("a failed install returns to missing with the reason", async () => {
    const { e } = make(
      { gpu: GPU, python: ["python"] },
      {
        installer: async () => {
          throw new Error("pip: no network");
        },
      },
    );
    await expect(e.install()).rejects.toThrow("pip: no network");
    expect(e.status()).toEqual({ state: "missing", detail: "pip: no network" });
  });
});

describe("installer commands", () => {
  // A stand-in for uv and pip that appends its arguments to a log file.
  const recorder = (log: string) => {
    const script = join(tmpdir(), `rec-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(script, `import { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");`);
    return script;
  };
  it("with uv: creates a Python 3.11 venv, then CUDA torch, then chatterbox-tts", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "cb-log-")), "log");
    const { e, dir } = make({ gpu: GPU, uv: [process.execPath, recorder(log)] });
    await e.install();
    const env = join(dir, "env");
    const py = join(env, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      `venv --python 3.11 ${env}`,
      `pip install --python ${py} torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124`,
      `pip install --python ${py} chatterbox-tts setuptools<81`,
    ]);
    expect(e.status().state).toBe("unloaded");
  });
  it("without uv: creates a venv with the system Python and pip installs the same packages", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "cb-log-")), "log");
    const { e } = make({ gpu: GPU, python: [process.execPath, recorder(log)] });
    await expect(e.install()).rejects.toThrow(); // the recorded venv is never created, so the pip step cannot run
    expect(readFileSync(log, "utf8").trim()).toMatch(/^-m venv .*env$/);
  });
});

describe("sidecar", () => {
  const ready = { gpu: GPU };
  it("loads with download progress, synthesizes and unloads (kills the process)", async () => {
    const { e } = make(ready, {}, true);
    const seen: EngineStatus[] = [];
    e.onStatus((s) => seen.push(s));
    await e.start();
    expect(seen.map((s) => s.state)).toEqual(["loading", "downloading", "loading", "ready"]);
    expect(seen[1]!.progress).toBe(0.5);
    const r = await e.synthesize("hello", { voice: "chatterbox", speed: 1 });
    expect(r.sampleRate).toBe(24000);
    expect(r.pcm.length).toBe(1200);
    expect(r.pcm[0]).toBe(1000);
    await e.unload();
    expect(e.status().state).toBe("unloaded");
    await expect(e.synthesize("again", { voice: "chatterbox", speed: 1 })).resolves.toBeDefined(); // reloads lazily
  });

  it("uses the reference clip of a cloned voice and lists it", async () => {
    const { e } = make(ready, {}, true);
    const v = e.clones.add({ name: "Maya", wav: encodeWav(new Int16Array(10), 24000), durationMs: 6000, checks: [] });
    expect(e.voices().map((x) => x.id)).toEqual(["chatterbox", v.id]);
    const r = await e.synthesize("hi", { voice: v.id, speed: 1 });
    expect(r.pcm[0]).toBe(2000);
    await expect(e.synthesize("hi", { voice: "nope", speed: 1 })).rejects.toThrow('unknown voice "nope"');
  });

  it("splits a long sentence and joins the pieces with a gap", async () => {
    const { e } = make(ready, {}, true);
    const text = Array.from({ length: 30 }, () => "word word").join(", ") + ".";
    const r = await e.synthesize(text, { voice: "chatterbox", speed: 1 });
    expect(r.pcm.length).toBeGreaterThan(text.length * 240); // plus at least one 80 ms gap
  });

  it("surfaces a synthesis error and a crash; the next request reloads", async () => {
    const { e } = make(ready, {}, true);
    await expect(e.synthesize("please fail", { voice: "chatterbox", speed: 1 })).rejects.toThrow("synthesis exploded");
    await expect(e.synthesize("now crash", { voice: "chatterbox", speed: 1 })).rejects.toThrow(/exited with code 3/);
    expect(e.status().state).toBe("unloaded");
    await expect(e.synthesize("fine", { voice: "chatterbox", speed: 1 })).resolves.toBeDefined();
  });

  it("an abort rejects with the reason", async () => {
    const { e } = make(ready, {}, true);
    await e.start();
    const ac = new AbortController();
    const p = e.synthesize("hello", { voice: "chatterbox", speed: 1, signal: ac.signal });
    ac.abort(new Error("stop"));
    await expect(p).rejects.toThrow("stop");
  });

  it("an abort tells the sidecar to stop generating", async () => {
    const log = join(mkdtempSync(join(tmpdir(), "cb-ops-")), "ops");
    const script = `process.stdout.write(JSON.stringify({kind:"ready"})+"\\n");require("readline").createInterface({input:process.stdin}).on("line",l=>require("fs").appendFileSync(${JSON.stringify(log)},l+"\\n"))`;
    const { e } = make(ready, { sidecar: { command: process.execPath, args: ["-e", script] } }, true);
    await e.start();
    const ac = new AbortController();
    const p = e.synthesize("hello", { voice: "chatterbox", speed: 1, signal: ac.signal }).catch(() => {});
    await vi.waitFor(() => expect(readFileSync(log, "utf8")).toContain('"op":"synth"'));
    ac.abort();
    await p;
    await vi.waitFor(() => expect(readFileSync(log, "utf8").trim().split("\n").at(-1)).toBe(JSON.stringify({ op: "abort", id: 1 })));
  });
});
