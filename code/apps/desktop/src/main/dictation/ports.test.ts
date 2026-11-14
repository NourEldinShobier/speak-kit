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
  it("passes a cancel on to the operating system layer, and reads the caret only when the layer has a reader", async () => {
    let cancelled = 0;
    const os = { ...fakeOs().os, cancelTyping: () => void cancelled++, caret: { read: async () => ({ before: "d", selected: false }) } } as unknown as DictationOs;
    const port = createInserterPort(os, () => undefined);
    port.cancel?.();
    expect(cancelled).toBe(1);
    expect(await port.caret?.()).toEqual({ before: "d", selected: false });
    expect(createInserterPort(fakeOs().os, () => undefined).caret).toBeUndefined();
  });

  it("describes the window in front, with whether a password field has focus", async () => {
    const { os } = fakeOs({ password: true });
    expect(await createInserterPort(os, () => undefined).target()).toEqual({ id: "42", exe: "notepad.exe", name: "Notepad", elevated: false, passwordField: true });
  });

  it("adds the page the browser reported, and nothing when none was or no window is in front", async () => {
    const { os } = fakeOs({ fg: { hwnd: "1", pid: 1, exe: "chrome.exe", className: "Chrome", elevated: false } });
    expect(
      await createInserterPort(
        os,
        () => undefined,
        () => "mail.google.com",
      ).target(),
    ).toMatchObject({ exe: "chrome.exe", site: "mail.google.com" });
    expect(
      await createInserterPort(
        os,
        () => undefined,
        () => undefined,
      ).target(),
    ).not.toHaveProperty("site");
    expect(
      await createInserterPort(
        fakeOs({ fg: null }).os,
        () => undefined,
        () => "a.com",
      ).target(),
    ).toBeUndefined();
  });

  it("has no target when no window is in front, and an empty program name when it cannot be read", async () => {
    expect(await createInserterPort(fakeOs({ fg: null }).os, () => undefined).target()).toBeUndefined();
    const { os } = fakeOs({ fg: { hwnd: "1", pid: 1, exe: null, className: "x", elevated: true } });
    expect(await createInserterPort(os, () => undefined).target()).toMatchObject({ exe: "", elevated: true });
  });

  it.each(["paste", "type", "copy"] as const)("passes the plan method %s on", async (method) => {
    const { os, inserted } = fakeOs();
    const plan = { paste: { method }, copy: { method, reason: "manual" }, type: { method } }[method];
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

describe("inserter port keep and focus", () => {
  it("passes the keep-on-clipboard plan as the keep mode", async () => {
    const { os, inserted } = fakeOs();
    await createInserterPort(os, () => undefined).insert({ text: "hi", plan: { method: "paste", keep: true } });
    expect(inserted).toEqual([{ text: "hi", options: { mode: "keep" } }]);
  });

  it("brings the window back through the system layer by its id", async () => {
    const calls: string[] = [];
    const { os } = fakeOs();
    os.focus = async (hwnd) => (calls.push(hwnd), true);
    expect(await createInserterPort(os, () => undefined).focus!({ id: "42", exe: "x.exe", elevated: false, passwordField: false })).toBe(true);
    expect(calls).toEqual(["42"]);
  });
});
