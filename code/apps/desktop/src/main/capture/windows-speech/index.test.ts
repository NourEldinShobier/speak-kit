import { describe, expect, it, vi } from "vite-plus/test";
import { MAX_REPLY_CHARS, TIMEOUT_MS } from "../command-narrator";
import { createWindowsSpeechNarrator, SCRIPT } from ".";

function setup(o: { os?: string; out?: string; fail?: boolean; scriptFails?: boolean } = {}) {
  const files: { name: string; data: Buffer; removed: boolean }[] = [];
  const logs: string[] = [];
  const run = vi.fn(async (_f: string, _a: string[], _t: number) => {
    if (o.fail) throw new Error("exit 1");
    return o.out ?? "  open   the orders \r\n";
  });
  const n = createWindowsSpeechNarrator({
    os: o.os ?? "win32",
    run,
    writeTemp: async (name, data) => {
      if (o.scriptFails && name.endsWith(".ps1")) throw new Error("disk full");
      const f = { name, data, removed: false };
      files.push(f);
      return { path: `T:/tmp/${name}`, remove: async () => void (f.removed = true) };
    },
    newName: () => "seg1",
    log: (l) => logs.push(l),
  });
  return { n, run, files, logs };
}
const pcm = Int16Array.from([1, -2, 3, 4]);

describe("Windows speech narrator", () => {
  it("writes the speech and the script, runs PowerShell on them and returns the cleaned text", async () => {
    const t = setup();
    expect(await t.n.transcribe(pcm)).toBe("open the orders");
    expect(t.run).toHaveBeenCalledWith("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "T:/tmp/seg1.ps1", "T:/tmp/seg1.wav"], TIMEOUT_MS);
    expect(t.files.map((f) => f.name)).toEqual(["seg1.wav", "seg1.ps1"]);
    expect(t.files[0]!.data.subarray(0, 4).toString()).toBe("RIFF");
    expect(t.files[1]!.data.toString()).toBe(SCRIPT);
    expect(t.files.map((f) => f.removed)).toEqual([true, true]);
  });

  it("reads the file with the dictation grammar of the system recognizer and ignores the closed-input error at the end of the file", () => {
    expect(SCRIPT).toContain("System.Speech.Recognition.DictationGrammar");
    expect(SCRIPT).toContain("SetInputToWaveFile($Wav)");
    expect(SCRIPT).toContain("catch [System.InvalidOperationException]");
  });

  it("is ready on Windows only, and makes no words elsewhere", async () => {
    expect(setup().n.ready()).toBe(true);
    const mac = setup({ os: "darwin" });
    expect(mac.n.ready()).toBe(false);
    await expect(mac.n.transcribe(pcm)).rejects.toThrow("only on Windows");
    expect(mac.run).not.toHaveBeenCalled();
    expect(mac.files).toEqual([]);
  });

  it("removes both files after a failure and passes the failure on", async () => {
    const t = setup({ fail: true });
    await expect(t.n.transcribe(pcm)).rejects.toThrow("exit 1");
    expect(t.files.map((f) => f.removed)).toEqual([true, true]);
  });

  it("removes the audio when the script cannot be written", async () => {
    const t = setup({ scriptFails: true });
    await expect(t.n.transcribe(pcm)).rejects.toThrow("disk full");
    expect(t.files.map((f) => [f.name, f.removed])).toEqual([["seg1.wav", true]]);
    expect(t.run).not.toHaveBeenCalled();
  });

  it("cuts a reply to the same length as the command narrator", async () => {
    expect((await setup({ out: "w ".repeat(MAX_REPLY_CHARS) }).n.transcribe(pcm)).length).toBe(MAX_REPLY_CHARS);
  });
});
