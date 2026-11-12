import { describe, expect, it, vi } from "vitest";
import { chooseNarrator, createCommandNarrator, MAX_REPLY_CHARS, SAMPLE_RATE, TIMEOUT_MS } from ".";

function setup(o: { command?: string; out?: string; fail?: boolean } = {}) {
  const files: { name: string; data: Buffer; removed: boolean }[] = [];
  const logs: string[] = [];
  const run = vi.fn(async (_file: string, _args: string[], _t: number) => {
    if (o.fail) throw new Error("exit 1");
    return o.out ?? "  hello   there \n";
  });
  const n = createCommandNarrator({
    command: () => o.command ?? "stt -l en",
    run,
    writeTemp: async (name, data) => {
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

describe("command narrator", () => {
  it("writes the speech as a 16 kHz mono WAV, starts the command with its path and returns the cleaned text", async () => {
    const t = setup();
    expect(await t.n.transcribe(pcm)).toBe("hello there");
    expect(t.run).toHaveBeenCalledWith("stt", ["-l", "en", "T:/tmp/seg1.wav"], TIMEOUT_MS);
    const wav = t.files[0]!.data;
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect([wav.readInt16LE(44), wav.readInt16LE(46), wav.readInt16LE(48), wav.readInt16LE(50)]).toEqual([1, -2, 3, 4]);
    expect(wav.length).toBe(44 + 8);
  });

  it("puts the file where {audio} stands", async () => {
    const t = setup({ command: 'stt --in "{audio}" --json' });
    await t.n.transcribe(pcm);
    expect(t.run).toHaveBeenCalledWith("stt", ["--in", "T:/tmp/seg1.wav", "--json"], TIMEOUT_MS);
  });

  it("removes the file after success and after a failure, and the failure reaches the caller", async () => {
    const ok = setup();
    await ok.n.transcribe(pcm);
    expect(ok.files[0]!.removed).toBe(true);
    const bad = setup({ fail: true });
    await expect(bad.n.transcribe(pcm)).rejects.toThrow("exit 1");
    expect(bad.files[0]!.removed).toBe(true);
  });

  it("cuts a very long answer", async () => {
    expect((await setup({ out: "w ".repeat(MAX_REPLY_CHARS) }).n.transcribe(pcm)).length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it("is not ready without a usable command, and refuses to run one", async () => {
    const t = setup({ command: '"unclosed' });
    expect(t.n.ready()).toBe(false);
    await expect(t.n.transcribe(pcm)).rejects.toThrow("no speech command");
    expect(t.run).not.toHaveBeenCalled();
    expect(setup().n.ready()).toBe(true);
  });
});

describe("narrator choice", () => {
  const make = (name: string) => ({ ready: vi.fn(() => name === "command"), transcribe: vi.fn(async () => name) });
  it("uses the command when chosen and the dictation model otherwise, deciding at each call", async () => {
    const dictation = make("dictation");
    const command = make("command");
    let chosen = false;
    const n = chooseNarrator(() => chosen, { dictation, command });
    expect(await n.transcribe(pcm)).toBe("dictation");
    expect(n.ready()).toBe(false);
    chosen = true;
    expect(await n.transcribe(pcm)).toBe("command");
    expect(n.ready()).toBe(true);
  });
});
