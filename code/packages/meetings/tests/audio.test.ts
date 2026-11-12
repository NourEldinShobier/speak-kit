import { describe, expect, it } from "vitest";
import {
  LoopbackSupervisor,
  MIC_BACKOFF_MS,
  MicGuard,
  MicPicker,
  RouteWatcher,
  TrackWriter,
  chooseOutput,
  cleanOutput,
  correlation,
  echoWindows,
  energyHasSpeech,
  hasSpeech,
  isCredit,
  rankOutputs,
  repeatsHints,
  suppressEcho,
  type Output,
} from "../src";
import { MemFs, clock, tone } from "./fakes";

describe("silence gate and output filters", () => {
  it("knows invented credit lines by language and ignores case and punctuation", () => {
    expect(isCredit("Thanks for watching!", "en")).toBe(true);
    expect(isCredit("UNTERTITEL DER AMARA.ORG-COMMUNITY", "de")).toBe(true);
    expect(isCredit("thanks for watching", "de")).toBe(false);
    expect(isCredit("thanks for watching", "auto")).toBe(true);
    expect(isCredit("Thanks for watching the demo", "en")).toBe(false);
    expect(isCredit("", "en")).toBe(false);
  });

  it("drops output that only repeats the vocabulary hints", () => {
    expect(repeatsHints("Wazuh Kubernetes", ["Wazuh", "Kubernetes", "Okta"])).toBe(true);
    expect(repeatsHints("We moved Wazuh to Kubernetes", ["Wazuh", "Kubernetes"])).toBe(false);
    expect(repeatsHints("anything", [])).toBe(false);
    expect(cleanOutput("  Okta  ", { hints: ["Okta"] })).toBe("");
    expect(cleanOutput(" Hello there ", { language: "en" })).toBe("Hello there");
    expect(cleanOutput("Thank you.", { language: "en" })).toBe("");
  });

  it("needs 160 ms of speech at probability 0.4 in one run", () => {
    const p = (n: number, v: number) => Array<number>(n).fill(v);
    expect(hasSpeech([...p(4, 0.9), ...p(3, 0.1), ...p(4, 0.9)], 32)).toBe(false); // runs of 128 ms
    expect(hasSpeech(p(5, 0.4), 32)).toBe(true); // 160 ms exactly, at the threshold
    expect(hasSpeech(p(5, 0.39), 32)).toBe(false);
    expect(hasSpeech([], 32)).toBe(false);
  });

  it("discards a silent clip and keeps a loud one (energy fallback)", () => {
    expect(energyHasSpeech(tone(2, 0))).toBe(false);
    expect(energyHasSpeech(tone(2, 6000))).toBe(true);
    expect(energyHasSpeech(new Int16Array(0))).toBe(false);
  });
});

describe("silent microphone guard", () => {
  it("warns once after 20 s of a dead microphone while the other side speaks, and recovers when sound returns", () => {
    const g = new MicGuard();
    expect(g.feed(0, 0, 0.1)).toBeUndefined();
    expect(g.feed(19_000, 0, 0.1)).toBeUndefined();
    expect(g.feed(20_000, 0, 0.1)).toBe("silent");
    expect(g.feed(21_000, 0, 0.1)).toBeUndefined();
    expect(g.feed(22_000, 0.05, 0.1)).toBe("ok");
    expect(g.state).toBe("ok");
  });

  it("does not warn in a quiet room, and a pause in the other side restarts the count", () => {
    const g = new MicGuard();
    expect(g.feed(0, 0, 0)).toBeUndefined();
    expect(g.feed(60_000, 0, 0)).toBeUndefined();
    g.feed(61_000, 0, 0.1);
    g.feed(70_000, 0, 0);
    expect(g.feed(85_000, 0, 0.1)).toBeUndefined();
  });
});

describe("echo suppression", () => {
  const seg = (start: number, end: number, text: string) => ({ start, end, text });

  it("drops a You line that repeats the Them line next to it", () => {
    const you = [seg(10.4, 13, "we should ship the release on friday")];
    const them = [seg(10, 13, "we should ship the release on Friday")];
    expect(suppressEcho(you, them)).toEqual([]);
  });

  it("keeps double-talk: the words the speaker added stay", () => {
    const you = [seg(10, 13, "we should ship the release actually let me check the numbers first")];
    const them = [seg(10, 13, "we should ship the release")];
    expect(suppressEcho(you, them)).toEqual([seg(10, 13, "actually let me check the numbers first")]);
  });

  it("keeps a You line far from any Them line, and a different line close to one", () => {
    const them = [seg(10, 12, "the budget is approved")];
    expect(suppressEcho([seg(40, 42, "the budget is approved")], them)).toHaveLength(1);
    expect(suppressEcho([seg(10, 12, "can you send me the file")], them)).toHaveLength(1);
  });

  it("suppresses nothing with headphones", () => {
    const you = [seg(10, 12, "the budget is approved")];
    expect(suppressEcho(you, you, { headphones: true })).toEqual(you);
  });

  it("only suppresses inside windows where the two loudness envelopes move together", () => {
    const you = [seg(10, 12, "the budget is approved")];
    const them = [seg(10, 12, "the budget is approved")];
    expect(suppressEcho(you, them, { windows: [{ from: 30, to: 33 }] })).toEqual(you);
    expect(suppressEcho(you, them, { windows: [{ from: 9, to: 12 }] })).toEqual([]);
  });

  it("drops a line with no words and keeps order", () => {
    expect(suppressEcho([seg(1, 2, "..."), seg(5, 6, "hello")], [])).toEqual([seg(5, 6, "hello")]);
  });

  it("correlates envelopes and finds windows where they move together", () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(correlation([1], [1])).toBe(0);
    const mic = [0, 1, 0, 1, 0, 1, 5, 5, 5, 5, 5, 5];
    const sys = [0, 1, 0, 1, 0, 1, 9, 1, 7, 2, 8, 1];
    expect(echoWindows(mic, sys, 1, { windowSec: 6 })).toEqual([{ from: 0, to: 6 }]);
  });
});

const out = (id: string, o: Partial<Output> = {}): Output => ({ id, name: id, isDefault: false, virtual: false, callAppPlaying: false, carriesMic: false, ...o });

describe("output choice", () => {
  const speakers = out("speakers", { isDefault: true });
  const headset = out("headset", { callAppPlaying: true });
  const mixer = out("mixer", { virtual: true, carriesMic: true, callAppPlaying: true });
  const cable = out("cable", { virtual: true });

  it("lists outputs where the call app plays first, then the default, and never a mixer carrying the microphone", () => {
    expect(rankOutputs([speakers, mixer, cable, headset]).map((o) => o.id)).toEqual(["headset", "speakers", "cable"]);
  });

  it("chooses the call app output, else the default, else says none", () => {
    expect(chooseOutput("automatic", [speakers, headset])).toMatchObject({ why: "call-app", output: { id: "headset" } });
    expect(chooseOutput("automatic", [speakers])).toMatchObject({ why: "default", output: { id: "speakers" } });
    expect(chooseOutput("automatic", [mixer])).toEqual({ output: undefined, why: "none" });
  });

  it("keeps a chosen output while it exists and falls back when it is gone", () => {
    expect(chooseOutput("speakers", [speakers, headset])).toMatchObject({ why: "chosen", output: { id: "speakers" } });
    expect(chooseOutput("gone", [speakers, headset])).toMatchObject({ why: "call-app" });
  });

  it("reports a route change only when the output to record changes", () => {
    const w = new RouteWatcher(() => "automatic");
    expect(w.check([speakers])?.output?.id).toBe("speakers");
    expect(w.check([speakers])).toBeUndefined();
    expect(w.check([speakers, headset])?.output?.id).toBe("headset");
    expect(w.check([speakers, headset])).toBeUndefined();
    expect(w.check([])?.why).toBe("none");
    expect(w.check([])).toBeUndefined();
  });

  it("says nothing while there is no output at all at the start", () => {
    expect(new RouteWatcher(() => "automatic").check([])).toBeUndefined();
  });
});

describe("microphone choice", () => {
  const picker = (call: () => Promise<string | null>) => new MicPicker({ dictationDevice: "usb-mic", callAppDevice: call });

  it("uses the saved microphone for 'same as dictation' and a named one as chosen", async () => {
    const p = picker(async () => "headset");
    expect(await p.choose("dictation")).toEqual({ device: "usb-mic", why: "saved" });
    expect(await p.choose("other")).toEqual({ device: "other", why: "saved" });
  });

  it("follows the call app when Windows can name its microphone", async () => {
    expect(await picker(async () => "headset").choose("call-app")).toEqual({ device: "headset", why: "call-app" });
  });

  it("falls back to the saved microphone and retries with growing waits capped at 30 s, resetting after a success", async () => {
    let name: string | null = null;
    const p = picker(async () => name);
    const waits: (number | undefined)[] = [];
    for (let i = 0; i < 8; i++) waits.push((await p.choose("call-app")).retryInMs);
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(MIC_BACKOFF_MS.at(-1)).toBe(30000);
    name = "headset";
    expect((await p.choose("call-app")).why).toBe("call-app");
    name = null;
    expect((await p.choose("call-app")).retryInMs).toBe(1000);
  });

  it("treats a lookup that throws as 'cannot say'", async () => {
    const p = picker(async () => {
      throw new Error("no per-process lookup");
    });
    expect(await p.choose("call-app")).toEqual({ device: "usb-mic", why: "fallback", retryInMs: 1000 });
  });
});

describe("two-track writer", () => {
  const setup = (failWrites = 0) => {
    const fs = new MemFs();
    fs.failWrites = failWrites;
    const c = clock();
    const files = { spool: (t: string) => `/m/${t}.pcm`, wav: (t: string) => `/m/${t}.wav` };
    return { fs, c, w: new TrackWriter({ fs, files: files as never, sleep: c.sleep }) };
  };

  it("pads a gap with silence so both tracks stay on the meeting clock", async () => {
    const { w } = setup();
    await w.append("you", tone(1), 0);
    await w.append("you", tone(1), 3); // an xrun left a 2 s hole
    expect(w.seconds("you")).toBe(4);
    await w.append("them", tone(1), 1);
    expect(w.seconds("them")).toBe(2);
  });

  it("does not pad a jump longer than a minute (the clock jumped, audio is not missing)", async () => {
    const { w } = setup();
    await w.append("you", tone(1), 0);
    await w.append("you", tone(1), 500);
    expect(w.seconds("you")).toBe(2);
  });

  it("finishes each track as a WAV and removes the spool", async () => {
    const { w, fs } = setup();
    await w.append("you", tone(1), 0);
    const r = await w.finish("you");
    expect(r).toEqual({ ok: true, bytes: 32_044 });
    expect(fs.files.has("/m/you.pcm")).toBe(false);
    expect(fs.files.get("/m/you.wav")!.length).toBe(32_044);
  });

  it("reports 0 bytes for a track that recorded nothing", async () => {
    expect(await setup().w.finish("them")).toEqual({ ok: true, bytes: 0 });
  });

  it("retries the final write with growing waits and succeeds", async () => {
    const { w, c, fs } = setup(2);
    await w.append("you", tone(1), 0);
    const before = c.now();
    expect(await w.finish("you")).toMatchObject({ ok: true });
    expect(c.now() - before).toBe(600); // 200 + 400
    expect(fs.files.has("/m/you.wav")).toBe(true);
  });

  it("keeps the spool and reports a failure when every try fails, and a full disk says so", async () => {
    const a = setup(10);
    await a.w.append("you", tone(1), 0);
    expect(await a.w.finish("you")).toMatchObject({ ok: false, failure: { code: "finalise-failed" } });
    expect(a.fs.files.has("/m/you.pcm")).toBe(true);
    const b = setup();
    await b.w.append("you", tone(1), 0);
    b.fs.full = true;
    expect(await b.w.finish("you")).toMatchObject({ ok: false, failure: { code: "disk-full" } });
  });

  it("serialises concurrent appends in order", async () => {
    const { w } = setup();
    await Promise.all([w.append("you", tone(1), 0), w.append("you", tone(1), 1), w.append("you", tone(1), 2)]);
    expect(w.seconds("you")).toBe(3);
  });

  it("a failed append does not block the next one", async () => {
    const { w, fs } = setup();
    fs.full = true;
    await expect(w.append("you", tone(1), 0)).rejects.toThrow();
    fs.full = false;
    await w.append("you", tone(1), 0);
    expect(w.seconds("you")).toBe(1);
  });
});

describe("loopback supervisor", () => {
  it("never reopens on an xrun, and reopens a lost stream at most once per 5 s", () => {
    const s = new LoopbackSupervisor();
    expect(s.xrun()).toBe("keep");
    expect(s.xrun()).toBe("keep");
    expect(s.xruns).toBe(2);
    expect(s.ended(0)).toBe("reopen");
    expect(s.ended(1000)).toBe("wait");
    expect(s.ended(5000)).toBe("reopen");
  });
});
