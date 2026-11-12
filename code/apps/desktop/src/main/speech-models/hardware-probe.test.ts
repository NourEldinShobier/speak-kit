import { describe, expect, it } from "vite-plus/test";
import { parseMacGraphics, parseWindowsProbe, pickGpu, probeHardware, type ProbeEnv } from "./hardware-probe";

const GB = 1024 ** 3;
const win = (stdout: string | Error): ProbeEnv => ({
  platform: "win32",
  arch: "x64",
  cores: 8,
  memoryBytes: 16 * GB,
  osRelease: "10.0.26300",
  run: async () => {
    if (stdout instanceof Error) throw stdout;
    return stdout;
  },
});

describe("pickGpu", () => {
  it("prefers a discrete card over an integrated one, whatever the order", () => {
    expect(
      pickGpu([
        { name: "Intel(R) UHD Graphics 620", driver: "27.20" },
        { name: "NVIDIA GeForce RTX 3060", driver: "31.0" },
      ]),
    ).toEqual({ name: "NVIDIA GeForce RTX 3060", driver: "31.0", integrated: false });
  });
  it("calls an Intel or AMD integrated adapter integrated", () => {
    expect(pickGpu([{ name: "Intel(R) UHD Graphics 620", driver: "27.20" }])).toEqual({ name: "Intel(R) UHD Graphics 620", driver: "27.20", integrated: true });
    expect(pickGpu([{ name: "AMD Radeon(TM) Graphics", driver: "31" }])?.integrated).toBe(true);
    expect(pickGpu([{ name: "AMD Radeon RX 6600", driver: "31" }])?.integrated).toBe(false);
  });
  it("ignores adapters that are not cards", () => {
    expect(pickGpu([{ name: "Microsoft Basic Display Adapter", driver: "1" }, { name: "Parsec Virtual Display Adapter", driver: "1" }, { name: "", driver: "" }])).toBeUndefined();
    expect(pickGpu([])).toBeUndefined();
  });
});

describe("parseWindowsProbe", () => {
  it("reads AVX2 and the card list", () => {
    expect(parseWindowsProbe(JSON.stringify({ avx2: true, gpus: [{ Name: "NVIDIA GeForce RTX 3060", DriverVersion: "31.0.15.5123" }] }))).toEqual({
      avx2: true,
      gpu: { name: "NVIDIA GeForce RTX 3060", driver: "31.0.15.5123", integrated: false },
    });
  });
  it("accepts a single card that PowerShell wrote as an object, not a list", () => {
    expect(parseWindowsProbe(JSON.stringify({ avx2: false, gpus: { Name: "Intel(R) UHD Graphics", DriverVersion: "1.0" } })).gpu?.name).toBe("Intel(R) UHD Graphics");
  });
  it("leaves everything unknown for output it cannot read", () => {
    expect(parseWindowsProbe("not json")).toEqual({ avx2: undefined, gpu: undefined });
    expect(parseWindowsProbe(JSON.stringify({ avx2: "yes", gpus: null }))).toEqual({ avx2: undefined, gpu: undefined });
  });
});

describe("parseMacGraphics", () => {
  it("reads the chip name and uses the system version as the driver", () => {
    const out = JSON.stringify({ SPDisplaysDataType: [{ sppci_model: "Apple M2" }] });
    expect(parseMacGraphics(out, "24.1.0", "arm64")).toEqual({ name: "Apple M2", driver: "24.1.0", integrated: false });
    expect(parseMacGraphics(JSON.stringify({ SPDisplaysDataType: [{ sppci_model: "Intel UHD Graphics 630" }] }), "23.0", "x64")?.integrated).toBe(true);
  });
  it("is undefined for empty or broken output", () => {
    expect(parseMacGraphics("", "1", "arm64")).toBeUndefined();
    expect(parseMacGraphics("{}", "1", "arm64")).toBeUndefined();
  });
});

describe("probeHardware", () => {
  it("combines cores, memory, AVX2 and the card on Windows", async () => {
    const hw = await probeHardware(win(JSON.stringify({ avx2: true, gpus: [{ Name: "NVIDIA GeForce RTX 3060", DriverVersion: "31.0" }] })));
    expect(hw).toEqual({ platform: "win32", arch: "x64", cores: 8, memoryGb: 16, avx2: true, gpu: { name: "NVIDIA GeForce RTX 3060", driver: "31.0", integrated: false } });
  });

  it("leaves AVX2 and the card unknown when the probe fails, so nothing is blocked", async () => {
    const hw = await probeHardware(win(new Error("powershell missing")));
    expect(hw).toEqual({ platform: "win32", arch: "x64", cores: 8, memoryGb: 16 });
  });

  it("asks sysctl for AVX2 on an Intel Mac and reads the graphics chip", async () => {
    const asked: string[] = [];
    const hw = await probeHardware({
      platform: "darwin",
      arch: "x64",
      cores: 4,
      memoryBytes: 8 * GB,
      osRelease: "23.0",
      run: async (file, args) => {
        asked.push(`${file} ${args.join(" ")}`);
        return file === "sysctl" ? "1\n" : JSON.stringify({ SPDisplaysDataType: [{ sppci_model: "AMD Radeon Pro 5500M" }] });
      },
    });
    expect(asked).toEqual(["sysctl -n hw.optional.avx2_0", "system_profiler SPDisplaysDataType -json"]);
    expect(hw).toMatchObject({ platform: "darwin", avx2: true, gpu: { name: "AMD Radeon Pro 5500M", integrated: false } });
  });

  it("does not ask for AVX2 on Apple silicon", async () => {
    const asked: string[] = [];
    const hw = await probeHardware({
      platform: "darwin",
      arch: "arm64",
      cores: 8,
      memoryBytes: 16 * GB,
      osRelease: "24.0",
      run: async (file) => {
        asked.push(file);
        throw new Error("no graphics info");
      },
    });
    expect(asked).toEqual(["system_profiler"]);
    expect(hw.avx2).toBeUndefined();
  });

  it("reports Linux with only what Node knows", async () => {
    expect(await probeHardware({ ...win(""), platform: "linux" })).toEqual({ platform: "linux", arch: "x64", cores: 8, memoryGb: 16 });
  });
});
