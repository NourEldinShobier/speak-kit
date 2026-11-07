import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AppState } from "../shared/ipc";
import type { Config } from "../shared/schemas";

// The real server is covered in packages/server; here createServer is a stand-in that hands out the onError the runtime passes it.
type ServerOptions = { onError?: (e: Error) => void };
const created: ServerOptions[] = [];
const chatterboxCalls: unknown[][] = [];
vi.mock("@speakkit/server", () => ({
  createChatterbox: async (...a: unknown[]) => (chatterboxCalls.push(a), undefined),
  createServer: (o: ServerOptions) => (created.push(o), { token: "t", listen: async () => {}, close: async () => {}, setIdleUnloadMs() {}, setOnBattery() {} }),
}));
const { ServerRuntime, chatterboxScript } = await import("./server-lifecycle");

afterEach(() => {
  created.length = 0;
  chatterboxCalls.length = 0;
  delete process.env.SPEAKKIT_ENGINE;
});

function runtime(dataDir = "d", chatterboxScript?: string) {
  process.env.SPEAKKIT_ENGINE = "fake";
  const state = { port: 0, serverError: null, health: null, version: "1.0.0", onBattery: false } as unknown as AppState;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const publish = vi.fn(() => state);
  const config = { preferredPort: 47615, idleUnload: "5", batterySaver: false, loadAtStart: false, setupDone: false } as unknown as Config;
  const api = { health: vi.fn(async () => null) };
  const deps = {
    state,
    config,
    dataDir,
    modelsDir: path.join(dataDir, "models"),
    engineWorker: new URL("file:///w.js"),
    ...(chatterboxScript && { chatterboxScript }),
    log,
    api,
    publish,
    isVisible: () => false,
    onEngineState: vi.fn(),
  };
  return { rt: new ServerRuntime(deps as never), state, log, publish };
}

describe("ServerRuntime", () => {
  it("reports an error the server raises after it started as a server error, without throwing", async () => {
    const { rt, state, log, publish } = runtime();
    await rt.start();
    expect(state.serverError).toBeNull();
    expect(() => created[0]!.onError!(new Error("EMFILE: too many open files"))).not.toThrow();
    expect(state.serverError).toEqual({ code: "unexpected", args: { detail: "EMFILE: too many open files" } });
    expect(log.error).toHaveBeenCalledWith("server error", "EMFILE: too many open files");
    expect(publish).toHaveBeenCalled();
  });

  it("deletes the downloads, keeps the library and starts the server again", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sk-rt-"));
    try {
      mkdirSync(path.join(root, "models"));
      mkdirSync(path.join(root, "library"));
      writeFileSync(path.join(root, "models", "m.onnx"), "x");
      writeFileSync(path.join(root, "library", "library.json"), "{}");
      const { rt, state } = runtime(root);
      await rt.start();
      const report = await rt.removeDownloads();
      expect(report.removed).toEqual([{ kind: "models", bytes: 1 }]);
      expect(existsSync(path.join(root, "models"))).toBe(false);
      expect(existsSync(path.join(root, "library", "library.json"))).toBe(true);
      expect(created).toHaveLength(2);
      expect(state.serverError).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("chatterboxScript", () => {
  it("finds the script shipped next to the app (resources/chatterbox)", async () => {
    const resources = mkdtempSync(path.join(tmpdir(), "sk-res-"));
    try {
      mkdirSync(path.join(resources, "chatterbox"));
      writeFileSync(path.join(resources, "chatterbox", "chatterbox_sidecar.py"), "x");
      expect(await chatterboxScript(resources)).toBe(path.join(resources, "chatterbox", "chatterbox_sidecar.py"));
    } finally {
      rmSync(resources, { recursive: true, force: true });
    }
  });

  it("falls back to the engine package's source file in development", async () => {
    const found = await chatterboxScript(path.join(tmpdir(), "no-such-resources"));
    expect(found?.split(path.sep).join("/")).toMatch(/packages\/engine\/sidecar\/chatterbox_sidecar\.py$/);
  });
});

describe("ServerRuntime and the sidecar script", () => {
  it("hands the script path to createChatterbox", async () => {
    delete process.env.SPEAKKIT_ENGINE;
    process.env.SPEAKKIT_CHATTERBOX = "auto";
    try {
      const { rt } = runtime("d", "/app/resources/chatterbox/chatterbox_sidecar.py");
      delete process.env.SPEAKKIT_ENGINE; // runtime() sets the fake engine for the engine itself; the optional engine needs it off
      await rt.start();
      expect(chatterboxCalls).toEqual([["d", { sidecarScript: "/app/resources/chatterbox/chatterbox_sidecar.py" }]]);
    } finally {
      delete process.env.SPEAKKIT_CHATTERBOX;
    }
  });
});
