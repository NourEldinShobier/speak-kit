import { describe, expect, it } from "vite-plus/test";
import type { Clip, Recorder } from "@speakkit/dictation";
import type { DictationOs, InsertOptions, InsertResult } from "./index";
import { createInserterPort, ReplayRecorder } from "./ports";

function fakeOs(over: { fg?: object | null; password?: boolean; result?: InsertResult } = {}) {
  const inserted: { text: string; options: InsertOptions | undefined }[] = [];
  const fg = over.fg === undefined ? { hwnd: "42", pid: 7, exe: "notepad.exe", className: "Notepad", elevated: false } : over.fg;
  const os = {
    foreground: () => fg,
    passwordFocused: () => over.password ?? false,
    insert: async (text: string, options?: InsertOptions) => (inserted.push({ text, options }), over.result ?? { status: "pasted" }),
  } as unknown as DictationOs;
  return { os, inserted };
}

describe("inserter port", () => {
  it("describes the window in front, with whether a password field has focus", async () => {
    const { os } = fakeOs({ password: true });
    expect(await createInserterPort(os, () => undefined).target()).toEqual({ id: "42", exe: "notepad.exe", elevated: false, passwordField: true });
  });

  it("has no target when no window is in front, and an empty program name when it cannot be read", async () => {
    expect(await createInserterPort(fakeOs({ fg: null }).os, () => undefined).target()).toBeUndefined();
    const { os } = fakeOs({ fg: { hwnd: "1", pid: 1, exe: null, className: "x", elevated: true } });
    expect(await createInserterPort(os, () => undefined).target()).toMatchObject({ exe: "", elevated: true });
  });

  it.each(["paste", "type", "copy"] as const)("passes the plan method %s on", async (method) => {
    const { os, inserted } = fakeOs();
    const plan = { paste: { method, keys: "ctrl-v", delayMs: 0, restoreMs: 500 }, copy: { method, reason: "manual" }, type: { method } }[method];
    expect(await createInserterPort(os, () => undefined).insert({ text: "hi", plan: plan as never })).toEqual({ ok: true });
    expect(inserted).toEqual([{ text: "hi", options: { mode: method } }]);
  });

  it("reports how the insert really ended, also when the system fell back to copying", async () => {
    const seen: InsertResult[] = [];
    const { os } = fakeOs({ result: { status: "copied", reason: "modifiers-held" } });
    expect(await createInserterPort(os, (r) => seen.push(r)).insert({ text: "x", plan: { method: "type" } })).toEqual({ ok: true });
    expect(seen).toEqual([{ status: "copied", reason: "modifiers-held" }]);
  });

  it("maps a refusal to rejected and an unusable clipboard to failed", async () => {
    const refused = fakeOs({ result: { status: "refused", reason: "password-field" } });
    expect(await createInserterPort(refused.os, () => undefined).insert({ text: "x", plan: { method: "type" } })).toEqual({ ok: false, code: "rejected" });
    const failed = fakeOs({ result: { status: "failed", reason: "clipboard-unavailable" } });
    expect(await createInserterPort(failed.os, () => undefined).insert({ text: "x", plan: { method: "type" } })).toEqual({ ok: false, code: "failed" });
  });
});

const clip = (n: number): Clip => ({ pcm: new Float32Array(n), sampleRate: 16_000, peak: 0.5 });

function fakeMic() {
  const calls: string[] = [];
  const mic: Recorder = {
    start: async (r) => (calls.push(`start ${r.prerollMs}`), { ok: true }),
    stop: async () => (calls.push("stop"), clip(1)),
    discard: async () => void calls.push("discard"),
  };
  return { mic, calls };
}

describe("replay recorder", () => {
  it("is the microphone when nothing is queued", async () => {
    const { mic, calls } = fakeMic();
    const r = new ReplayRecorder(mic);
    await r.start({ prerollMs: 450 });
    expect((await r.stop()).pcm).toHaveLength(1);
    await r.discard();
    expect(calls).toEqual(["start 450", "stop", "discard"]);
  });

  it("plays one queued clip instead of the microphone, once", async () => {
    const { mic, calls } = fakeMic();
    const r = new ReplayRecorder(mic);
    const saved = clip(99);
    r.replay(saved);
    expect(await r.start({ prerollMs: 450 })).toEqual({ ok: true });
    expect(await r.stop()).toBe(saved);
    expect(calls).toEqual([]);
    await r.start({ prerollMs: 0 });
    expect((await r.stop()).pcm).toHaveLength(1);
    expect(calls).toEqual(["start 0", "stop"]);
  });

  it("a discard drops the queued clip without touching the microphone", async () => {
    const { mic, calls } = fakeMic();
    const r = new ReplayRecorder(mic);
    r.replay(clip(5));
    await r.discard();
    expect(calls).toEqual([]);
    await r.start({ prerollMs: 1 });
    expect(calls).toEqual(["start 1"]);
  });
});
