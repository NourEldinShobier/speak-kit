import { describe, expect, it } from "vite-plus/test";
import { cachedHardware, collectResources, speechModelName, type ResourceSources } from "./resources";

const sources = (over: Partial<ResourceSources> = {}): ResourceSources => ({
  processes: () => [
    { type: "Browser", workingSetKb: 100 * 1024, cpu: 1 },
    { type: "Tab", workingSetKb: 200 * 1024, cpu: 2 },
  ],
  voice: () => ({ state: "ready", name: "Kokoro", pid: 11 }),
  speech: () => ({ state: "ready", name: "Parakeet", pid: 22, backend: "gpu" }),
  memoryOf: async (pid) => (pid === 11 ? 310 : 820),
  hardware: async () => ({ platform: "darwin", arch: "arm64", cores: 10, memoryGb: 32, gpu: { name: "Apple M2", driver: "24", integrated: false } }),
  platform: "win32",
  arch: "x64",
  ...over,
});

describe("collectResources", () => {
  it("reports processes, model memory and the device", async () => {
    expect(await collectResources(sources())).toEqual({
      rows: [
        { label: "Windows", mb: 200, cpu: 2 },
        { label: "Speak Kit (main)", mb: 100, cpu: 1 },
      ],
      totalMb: 300,
      models: [
        { kind: "voice", name: "Kokoro", state: "loaded", mb: 310 },
        { kind: "speech", name: "Parakeet", state: "loaded", mb: 820 },
      ],
      device: { platform: "darwin", arch: "arm64", cores: 10, ramGb: 32, gpu: "Apple M2", speechRunsOn: "graphics card" },
    });
  });

  it("reads no memory for a model that is not loaded", async () => {
    const asked: number[] = [];
    const r = await collectResources(
      sources({
        voice: () => ({ state: "unloaded", name: "Kokoro", pid: undefined }),
        speech: () => ({ state: "unloaded", name: "Parakeet", pid: 22, backend: undefined }),
        memoryOf: async (pid) => (asked.push(pid), 1),
      }),
    );
    expect(asked).toEqual([]);
    expect(r.models.map((m) => [m.state, m.mb])).toEqual([
      ["unloaded", null],
      ["unloaded", null],
    ]);
    expect(r.device.speechRunsOn).toBeNull();
  });

  it("keeps the model loaded but its memory unknown when the process cannot be read", async () => {
    const r = await collectResources(sources({ memoryOf: async () => undefined }));
    expect(r.models.map((m) => [m.state, m.mb])).toEqual([
      ["loaded", null],
      ["loaded", null],
    ]);
  });

  it("falls back to this computer's platform when the hardware probe fails", async () => {
    const r = await collectResources(
      sources({
        hardware: async () => {
          throw new Error("probe failed");
        },
      }),
    );
    expect(r.device).toEqual({ platform: "win32", arch: "x64", cores: null, ramGb: null, gpu: null, speechRunsOn: "graphics card" });
  });

  it("says the speech model runs on the CPU when it does", async () => {
    const r = await collectResources(sources({ speech: () => ({ state: "ready", name: "P", pid: 22, backend: "cpu" }) }));
    expect(r.device.speechRunsOn).toBe("CPU");
  });

  it("has no rows and zero total with no processes", async () => {
    const r = await collectResources(sources({ processes: () => [] }));
    expect(r.rows).toEqual([]);
    expect(r.totalMb).toBe(0);
  });
});

describe("speechModelName", () => {
  it("names a catalog model and falls back to the id for one the person added", () => {
    expect(speechModelName("large-v3-turbo-q5_0")).toMatch(/turbo/i);
    expect(speechModelName("custom-my-model")).toBe("custom-my-model");
  });
});

describe("cachedHardware", () => {
  const hw = { platform: "win32", arch: "x64", cores: 8, memoryGb: 16 } as const;
  it("probes once and shares the answer, also between overlapping calls", async () => {
    let calls = 0;
    const read = cachedHardware(async () => (calls++, hw));
    const [a, b] = await Promise.all([read(), read()]);
    await read();
    expect([a, b, calls]).toEqual([hw, hw, 1]);
  });
  it("probes again after a failure", async () => {
    let calls = 0;
    const read = cachedHardware(async () => {
      if (calls++ === 0) throw new Error("no powershell");
      return hw;
    });
    await expect(read()).rejects.toThrow("no powershell");
    expect(await read()).toBe(hw);
    expect(calls).toBe(2);
  });
});
