import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ChatterboxEngine, EngineNotReadyError, InstallCancelledError, type ChatterboxOptions, type Hardware } from "../src";

const GPU = { name: "RTX 4080", vramMb: 12282 };
const GB = 1024 ** 3;
const sidecar = { command: process.execPath, args: [join(import.meta.dirname, "fake-sidecar.mjs")] };
const engines: ChatterboxEngine[] = [];

function make(hw: Hardware, o: Partial<ChatterboxOptions> = {}, installed = false) {
  const root = mkdtempSync(join(tmpdir(), "cbf-"));
  const dir = join(root, "chatterbox");
  if (installed) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "installed"), "x");
  }
  const e = new ChatterboxEngine({ dir, voicesDir: join(root, "voices"), sidecar, idleUnloadMs: 0, freeBytes: async () => 100 * GB, ...o }, hw);
  engines.push(e);
  return { e, dir, root };
}
afterEach(async () => {
  await Promise.all(engines.splice(0).map((e) => e.close()));
  delete process.env.SPEAKKIT_FAKE_LOAD_FATAL;
  delete process.env.SPEAKKIT_FAKE_PID_FILE;
});
const speak = (e: ChatterboxEngine, text: string) => e.synthesize(text, { voice: "chatterbox", speed: 1 });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const installable = { gpu: GPU, python: ["python"] };

describe("GPU out of memory", () => {
  it("a request that runs out of GPU memory kills the sidecar, reports the reason and the next request retries", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-pid-"));
    process.env.SPEAKKIT_FAKE_PID_FILE = join(root, "pid");
    const { e } = make({ gpu: GPU }, {}, true);
    await e.start();
    const pid = Number(readFileSync(join(root, "pid"), "utf8"));
    await expect(speak(e, "this one is oom")).rejects.toThrow("CUDA out of memory");
    expect(e.status().state).toBe("unloaded");
    expect(e.status().detail).toContain("CUDA out of memory");
    expect(e.info()).toEqual({ reason: "out-of-memory", gpu: GPU });
    await vi.waitFor(() => expect(alive(pid)).toBe(false)); // the GPU memory went with the process
    expect((await speak(e, "fine")).pcm.length).toBe(960);
    expect(e.status()).toEqual({ state: "ready" });
    expect(e.info()).toEqual({ gpu: GPU });
  });

  it("an out-of-memory request says unloaded before the sidecar is stopped, so nothing sees a ready engine without a process", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-pid-"));
    process.env.SPEAKKIT_FAKE_PID_FILE = join(root, "pid");
    const { e } = make({ gpu: GPU }, {}, true);
    await e.start();
    const pid = Number(readFileSync(join(root, "pid"), "utf8"));
    const aliveWhenUnloaded: boolean[] = [];
    e.onStatus((s) => s.state === "unloaded" && aliveWhenUnloaded.push(alive(pid)));
    await expect(speak(e, "this one is oom")).rejects.toThrow("CUDA out of memory");
    expect(aliveWhenUnloaded).toEqual([true]);
    await vi.waitFor(() => expect(alive(pid)).toBe(false));
  });

  it("a load that runs out of GPU memory is an error with the reason; start() is the retry", async () => {
    process.env.SPEAKKIT_FAKE_LOAD_FATAL = "out-of-memory";
    const { e } = make({ gpu: GPU }, {}, true);
    await expect(e.start()).rejects.toThrow("out-of-memory while loading");
    expect(e.status().state).toBe("error");
    expect(e.info().reason).toBe("out-of-memory");
    delete process.env.SPEAKKIT_FAKE_LOAD_FATAL;
    await e.start();
    expect(e.status().state).toBe("ready");
    expect(e.info().reason).toBeUndefined();
  });

  it("an out-of-memory unload is not counted as a crash", async () => {
    const { e } = make({ gpu: GPU }, { crashLimit: 2 }, true);
    for (let i = 0; i < 3; i++) await expect(speak(e, "oom again")).rejects.toThrow("CUDA out of memory");
    expect(e.status().state).toBe("unloaded");
  });
});

describe("install cancelled", () => {
  it("stops the installer, deletes the environment and the marker, and returns to not installed", async () => {
    let seen: AbortSignal | undefined;
    const { e, dir } = make(installable, {
      installer: async ({ envDir, signal }) => {
        mkdirSync(envDir, { recursive: true });
        seen = signal;
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new InstallCancelledError()), { once: true }));
      },
    });
    const install = e.install();
    const rejected = expect(install).rejects.toBeInstanceOf(InstallCancelledError);
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(existsSync(join(dir, "installing"))).toBe(true);
    await e.cancelInstall();
    await rejected;
    expect(seen!.aborted).toBe(true);
    expect(e.status()).toEqual({ state: "missing" });
    expect(e.info()).toEqual({ reason: "not-installed", gpu: GPU });
    expect(existsSync(join(dir, "env"))).toBe(false);
    expect(existsSync(join(dir, "installing"))).toBe(false);
    expect(existsSync(join(dir, "installed"))).toBe(false);
  });

  it("kills the installer's child process", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-uv-"));
    const script = join(root, "slow-uv.mjs");
    writeFileSync(
      script,
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(root, "pid"))}, String(process.pid)); console.log("Collecting torch"); setTimeout(() => {}, 60000);`,
    );
    const { e } = make({ gpu: GPU, uv: [process.execPath, script] });
    const install = e.install().catch((x) => x);
    await vi.waitFor(() => expect(existsSync(join(root, "pid"))).toBe(true));
    const pid = Number(readFileSync(join(root, "pid"), "utf8"));
    expect(alive(pid)).toBe(true);
    await e.cancelInstall();
    expect(await install).toBeInstanceOf(InstallCancelledError);
    expect(alive(pid)).toBe(false);
    expect(e.status().state).toBe("missing");
  });

  it("is a no-op when nothing is installing", async () => {
    const { e } = make(installable);
    await e.cancelInstall();
    expect(e.status()).toEqual({ state: "missing" });
  });

  it("closing the engine cancels a running install", async () => {
    const { e } = make(installable, { installer: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new InstallCancelledError()))) });
    const install = e.install().catch((x) => x);
    await vi.waitFor(() => expect(e.status().state).toBe("installing"));
    await e.close();
    expect(await install).toBeInstanceOf(InstallCancelledError);
  });

  it("an app killed during an install leaves a marker; the next start removes the half-built environment", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-kill-"));
    const dir = join(root, "chatterbox");
    mkdirSync(join(dir, "env", "Lib"), { recursive: true });
    writeFileSync(join(dir, "installing"), "2026-11-07T00:00:00Z");
    const e = await ChatterboxEngine.create({ dir, voicesDir: join(root, "voices"), sidecar, hardware: installable });
    engines.push(e);
    expect(e.status().state).toBe("missing");
    expect(existsSync(join(dir, "env"))).toBe(false);
    expect(existsSync(join(dir, "installing"))).toBe(false);
  });

  it("an app killed after a finished install keeps the environment and only drops the installing marker", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-kill2-"));
    const dir = join(root, "chatterbox");
    mkdirSync(join(dir, "env", "Lib"), { recursive: true });
    writeFileSync(join(dir, "installed"), "2026-11-07T00:00:01Z");
    writeFileSync(join(dir, "installing"), "2026-11-07T00:00:00Z");
    const e = await ChatterboxEngine.create({ dir, voicesDir: join(root, "voices"), sidecar, hardware: installable });
    engines.push(e);
    expect(e.status().state).toBe("unloaded");
    expect(existsSync(join(dir, "env", "Lib"))).toBe(true);
    expect(existsSync(join(dir, "installing"))).toBe(false);
  });

  it("a completed install leaves no installing marker", async () => {
    const { e, dir } = make(installable, { installer: async () => {} });
    await e.install();
    expect(existsSync(join(dir, "installing"))).toBe(false);
    expect(existsSync(join(dir, "installed"))).toBe(true);
  });
});

describe("disk full", () => {
  it("refuses to install with less than 10 GB free and says how much is needed", async () => {
    const installer = vi.fn(async () => {});
    const { e, dir } = make(installable, { installer, freeBytes: async () => 3.2 * GB });
    await expect(e.install()).rejects.toThrow("Chatterbox needs 10 GB of free disk space and 3.2 GB is free.");
    expect(installer).not.toHaveBeenCalled();
    expect(e.status()).toEqual({ state: "missing", detail: "Chatterbox needs 10 GB of free disk space and 3.2 GB is free." });
    expect(e.info().reason).toBe("disk-full");
    expect(existsSync(join(dir, "installing"))).toBe(false);
  });

  it("installs when exactly 10 GB are free, and a retry clears the reason", async () => {
    let free = 2 * GB;
    const { e } = make(installable, { installer: async () => {}, freeBytes: async () => free });
    await expect(e.install()).rejects.toThrow("needs 10 GB");
    free = 10 * GB;
    await e.install();
    expect(e.status().state).toBe("unloaded");
    expect(e.info().reason).toBeUndefined();
  });

  it("maps ENOSPC from the installer to disk-full", async () => {
    const { e } = make(installable, {
      installer: async () => {
        throw Object.assign(new Error("write failed"), { code: "ENOSPC" });
      },
    });
    await expect(e.install()).rejects.toThrow("write failed");
    expect(e.info().reason).toBe("disk-full");
    expect(e.status().state).toBe("missing");
  });

  it("maps pip and uv out-of-space messages to disk-full", async () => {
    const root = mkdtempSync(join(tmpdir(), "cbf-pip-"));
    const script = join(root, "pip.mjs");
    writeFileSync(script, `console.error("OSError: [Errno 28] No space left on device"); process.exit(2);`);
    const { e } = make({ gpu: GPU, uv: [process.execPath, script] });
    await expect(e.install()).rejects.toThrow(/No space left on device/);
    expect(e.info().reason).toBe("disk-full");
  });

  it("a weights download that fills the disk is an error with the reason", async () => {
    process.env.SPEAKKIT_FAKE_LOAD_FATAL = "disk-full";
    const { e } = make({ gpu: GPU }, {}, true);
    await expect(e.start()).rejects.toThrow("disk-full while loading");
    expect(e.status().state).toBe("error");
    expect(e.info().reason).toBe("disk-full");
  });
});

describe("a load failure that has no actionable cause", () => {
  it("is an error without a reason, and requests do not retry it", async () => {
    process.env.SPEAKKIT_FAKE_LOAD_FATAL = "other";
    const { e } = make({ gpu: GPU }, {}, true);
    await expect(e.start()).rejects.toThrow("weights are corrupt");
    expect(e.info().reason).toBeUndefined();
    await expect(speak(e, "x")).rejects.toBeInstanceOf(EngineNotReadyError);
  });
});
