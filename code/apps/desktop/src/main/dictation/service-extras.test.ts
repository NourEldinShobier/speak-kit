import { describe, expect, it, vi } from "vite-plus/test";
import type { Dictation, DictationState } from "@speakkit/dictation";
import { DEFAULT_DICTATION } from "../../shared/dictation/settings";

vi.mock("electron", () => ({ powerSaveBlocker: { start: () => 1, stop: () => undefined, isStarted: () => false }, clipboard: {}, shell: {} }));
vi.mock("../system/clipboard", () => ({ electronClipboard: {} }));
const { createRecovery, onStateChange, prepareModel, recoverTakes } = await import("./service-extras");

const idle: DictationState = { status: "idle" };

function stateRig(over: { sounds?: boolean } = {}) {
  const log: string[] = [];
  const failure = { clip: undefined, error: "", replay: undefined, last: undefined as { code: string; at: number; owner?: string } | undefined };
  const base = {
    cfg: { ...DEFAULT_DICTATION, sounds: { enabled: over.sounds ?? true, volume: 50 } },
    failure,
    recorder: { tone: (n: readonly unknown[]) => log.push(`tone:${n.length}`) } as never,
    hotkeys: { setCancelGrab: (on: boolean) => log.push(`grab:${on}`) } as never,
    typing: false,
    now: 99,
  };
  return { log, failure, run: (prev: DictationState, next: DictationState, typing = false) => onStateChange({ ...base, typing, prev, next }) };
}

describe("onStateChange", () => {
  it("plays the start tone and does not grab the cancel key for a held recording", () => {
    const r = stateRig();
    r.run(idle, { status: "recording", mode: "hold" });
    expect(r.log).toEqual(["tone:1", "grab:false"]);
  });

  it("grabs the cancel key for a toggled recording and while text is being typed, but not for a paste", () => {
    const r = stateRig();
    r.run(idle, { status: "recording", mode: "toggle" });
    r.run({ status: "transcribing" }, { status: "pasting" });
    r.run({ status: "transcribing" }, { status: "pasting" }, true);
    expect(r.log.filter((l) => l.startsWith("grab"))).toEqual(["grab:true", "grab:false", "grab:true"]);
  });

  it("plays nothing when sounds are off", () => {
    const r = stateRig({ sounds: false });
    r.run(idle, { status: "recording", mode: "hold" });
    expect(r.log).toEqual(["tone:0", "grab:false"]);
  });

  it("keeps the last failure with its owner until a text is inserted or copied", () => {
    const r = stateRig();
    r.run({ status: "transcribing" }, { status: "error", code: "mic-in-use", owner: "Voice chat" });
    expect(r.failure.last).toEqual({ code: "mic-in-use", at: 99, owner: "Voice chat" });
    expect(r.failure.error).toBe("mic-in-use");
    r.run({ status: "error", code: "mic-in-use" }, idle);
    expect(r.failure.last).toBeDefined();
    r.run({ status: "pasting" }, { status: "idle", notice: { kind: "inserted" } });
    expect(r.failure.last).toBeUndefined();
  });

  it("does not clear the failure for a cancel or for no speech", () => {
    const r = stateRig();
    r.failure.last = { code: "model-failed", at: 1 };
    r.run(idle, { status: "idle", notice: { kind: "cancelled" } });
    r.run(idle, { status: "idle", notice: { kind: "no-speech" } });
    expect(r.failure.last).toBeDefined();
  });
});

describe("prepareModel", () => {
  const models = (installed: boolean) => {
    const log: string[] = [];
    return { log, m: { installed, warm: () => log.push("warm"), download: async (id: string) => void log.push(`download:${id}`) } as never };
  };
  const model = DEFAULT_DICTATION.model;

  it("warms an installed model when started by the person, or at launch with idle release off", () => {
    const a = models(true);
    prepareModel(a.m, { quiet: false, idleMinutes: 5, skipped: false, model });
    const b = models(true);
    prepareModel(b.m, { quiet: true, idleMinutes: 0, skipped: false, model });
    expect([a.log, b.log]).toEqual([["warm"], ["warm"]]);
  });

  it("leaves an installed model on disk at launch when it is released while idle", () => {
    const a = models(true);
    prepareModel(a.m, { quiet: true, idleMinutes: 5, skipped: false, model });
    expect(a.log).toEqual([]);
  });

  it("downloads a missing model unless the person skipped it", () => {
    const a = models(false);
    prepareModel(a.m, { quiet: false, idleMinutes: 0, skipped: false, model });
    const b = models(false);
    prepareModel(b.m, { quiet: false, idleMinutes: 0, skipped: true, model });
    expect([a.log, b.log]).toEqual([[`download:${model}`], []]);
  });
});

describe("recovery", () => {
  const take = { clip: { pcm: new Float32Array(1), sampleRate: 16_000, peak: 0.5 }, id: "a", startedAt: 1, state: "pending" as const };
  const parts = (n: number) => ({
    spool: { recover: async () => Array.from({ length: n }, () => take) } as never,
    spooled: { adopt: () => undefined } as never,
  });
  const core = () => {
    const log: string[] = [];
    return { log, c: { restore: () => log.push("restore") } as unknown as Dictation };
  };

  it("tells the person how many takes were recovered", async () => {
    const toasts: string[] = [];
    const c1 = core();
    const presenter = { toast: (t: string) => toasts.push(t) } as never;
    for (const n of [1, 3, 0]) await recoverTakes({ spool: parts(n), core: c1.c, presenter, warn: () => undefined });
    expect(toasts).toEqual(["Recovered a recording from the last session", "Recovered 3 recordings from the last session"]);
    expect(c1.log).toHaveLength(4);
  });

  it("logs a failure and never rejects", async () => {
    const warns: string[] = [];
    const broken = { spool: { recover: async () => Promise.reject(new Error("disk")) } as never, spooled: {} as never };
    await recoverTakes({ spool: broken, core: core().c, presenter: {} as never, warn: (t, d) => warns.push(`${t}:${d}`) });
    expect(warns).toEqual(["dictation recovery failed:Error: disk"]);
  });

  it("runs once, and not before the core exists", async () => {
    const c1 = core();
    let current: Dictation | undefined;
    const recover = createRecovery({ spool: parts(1), core: () => current, presenter: { toast: () => undefined } as never, warn: () => undefined });
    recover();
    await Promise.resolve();
    expect(c1.log).toEqual([]);
    current = c1.c;
    recover();
    recover();
    await new Promise((r) => setTimeout(r, 0));
    expect(c1.log).toEqual(["restore"]);
  });
});
