import { describe, expect, it } from "vite-plus/test";
import { deviceLines, modelState, modelText, processLabel, resourceRows, type DeviceInfo } from "./resources";

describe("processLabel", () => {
  it.each([
    [{ type: "Browser" }, "Speak Kit (main)"],
    [{ type: "Tab" }, "Windows"],
    [{ type: "GPU" }, "Graphics"],
    [{ type: "Utility", name: "Network Service" }, "Network Service"],
    [{ type: "Utility", name: "  " }, "Helpers"],
    [{ type: "Utility" }, "Helpers"],
    [{ type: "Zygote" }, "Other"],
  ])("%j is %s", (p, want) => expect(processLabel(p)).toBe(want));
});

describe("resourceRows", () => {
  it("groups by label, sums memory and cpu, and lists the largest first", () => {
    const rows = resourceRows([
      { type: "Tab", workingSetKb: 102_400, cpu: 1.2 },
      { type: "Browser", workingSetKb: 204_800, cpu: 0.5 },
      { type: "Tab", workingSetKb: 51_200, cpu: 0.3 },
      { type: "GPU", workingSetKb: 1024, cpu: 0 },
    ]);
    expect(rows).toEqual([
      { label: "Speak Kit (main)", mb: 200, cpu: 0.5 },
      { label: "Windows", mb: 150, cpu: 1.5 },
      { label: "Graphics", mb: 1, cpu: 0 },
    ]);
  });

  it("returns nothing for no processes", () => expect(resourceRows([])).toEqual([]));

  it("never reports negative memory or cpu", () => {
    expect(resourceRows([{ type: "Browser", workingSetKb: -5, cpu: -1 }])).toEqual([{ label: "Speak Kit (main)", mb: 0, cpu: 0 }]);
  });

  it("breaks ties by label so the order is stable", () => {
    const rows = resourceRows([
      { type: "GPU", workingSetKb: 1024, cpu: 0 },
      { type: "Utility", name: "Audio Service", workingSetKb: 1024, cpu: 0 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Audio Service", "Graphics"]);
  });
});

describe("model lines", () => {
  it("shows memory only for a loaded model that could be measured", () => {
    expect(modelText({ kind: "voice", name: "Kokoro", state: "loaded", mb: 312.4 })).toBe("Loaded, 312 MB");
    expect(modelText({ kind: "voice", name: "Kokoro", state: "loaded", mb: null })).toBe("Loaded");
    expect(modelText({ kind: "speech", name: "x", state: "unloaded", mb: null })).toBe("Not loaded, wakes when needed");
    expect(modelText({ kind: "speech", name: "x", state: "missing", mb: null })).toBe("Not downloaded");
    expect(modelText({ kind: "speech", name: "x", state: "error", mb: null })).toBe("Failed to load");
    expect(modelText({ kind: "speech", name: "x", state: "loading", mb: null })).toBe("Loading");
  });

  it("maps engine states", () => {
    expect(["ready", "loading", "downloading", "unloaded", "error", "missing", undefined, "weird"].map(modelState)).toEqual([
      "loaded",
      "loading",
      "loading",
      "unloaded",
      "error",
      "missing",
      "missing",
      "missing",
    ]);
  });
});

describe("deviceLines", () => {
  const full: DeviceInfo = { platform: "darwin", arch: "arm64", cores: 10, ramGb: 32, gpu: "Apple M2 Pro", speechRunsOn: "graphics card" };
  it("lists what is known", () => {
    expect(deviceLines(full)).toEqual([
      { label: "System", value: "macOS (arm64)" },
      { label: "Processor", value: "10 cores" },
      { label: "Memory", value: "32 GB" },
      { label: "Graphics card", value: "Apple M2 Pro" },
      { label: "Speech model runs on", value: "graphics card" },
    ]);
  });
  it("says so when a value is not known", () => {
    const v = deviceLines({ platform: "win32", arch: "x64", cores: null, ramGb: null, gpu: null, speechRunsOn: null }).map((l) => l.value);
    expect(v).toEqual(["Windows (x64)", "Not known", "Not known", "None found", "Not loaded"]);
  });
});
