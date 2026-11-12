import { describe, expect, it } from "vite-plus/test";
import { createDictation, type Clip } from "../src";
import { fakeClock, fakeInserter, fakeKeyboard, fakeRecorder, fakeStorage, fakeTranscriber, flush, loud, rig, target } from "./fakes";

const clipOf = (seconds: number, peak = 0.5): Clip => ({ pcm: new Float32Array(16000 * seconds).fill(peak), sampleRate: 16000, peak });

describe("speech-aware release tail", () => {
  it("stops after 200 ms when nobody is speaking", async () => {
    const r = await rig();
    r.rec.recorder.speaking = () => false;
    await r.hold(1000);
    await r.time.advance(199);
    expect(r.rec.log).toEqual(["start:450"]);
    await r.time.advance(51);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });

  it("keeps recording while speech continues and stops at 600 ms at the latest", async () => {
    const r = await rig();
    r.rec.recorder.speaking = () => true;
    await r.hold(1000);
    await r.time.advance(550);
    expect(r.rec.log).toEqual(["start:450"]);
    await r.time.advance(100);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });

  it("ends as soon as the speech stops after the minimum", async () => {
    const r = await rig();
    let speaking = true;
    r.rec.recorder.speaking = () => speaking;
    await r.hold(1000);
    await r.time.advance(300);
    speaking = false;
    await r.time.advance(60);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });
});

describe("pre-roll", () => {
  it("is zero when the microphone is released when idle", async () => {
    const r = await rig({ keepReady: false });
    await r.hold(1000);
    expect(r.rec.log).toEqual(["start:0"]);
  });
});

describe("long takes", () => {
  it("go to the model in pieces and come back as one text, skipping a silent piece", async () => {
    const r = await rig();
    r.stt.state.queue = [
      { ok: true, text: "first part", language: "en", model: "turbo" },
      { ok: true, text: "second part" },
      { ok: true, text: "third part" },
    ];
    const long = new Float32Array(16000 * 95).fill(0.5);
    long.fill(0, 16000 * 30, 16000 * 60); // the second piece is exactly silent
    r.rec.state.clip = { pcm: long, sampleRate: 16000, peak: 0.5 };
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.stt.calls.map((c) => c.samples)).toEqual([480000, 480000, 80000]);
    expect(r.ins.inserted[0]?.text).toBe("First part second part third part ");
    expect(await r.dictation.history.list()).toMatchObject([{ language: "en", model: "turbo" }]);
  });

  it("a failing piece fails the whole take and nothing is inserted", async () => {
    const r = await rig();
    r.stt.state.queue = [
      { ok: true, text: "one" },
      { ok: false, code: "failed" },
    ];
    r.rec.state.clip = clipOf(70);
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.dictation.state()).toMatchObject({ status: "error", code: "transcribe-failed" });
    expect(r.ins.inserted).toEqual([]);
  });
});

describe("kept audio", () => {
  function keeper(clip: Clip, transcribe: "ok" | "fail" = "ok") {
    const kept: string[] = [];
    const time = fakeClock();
    const keys = fakeKeyboard();
    const rec = fakeRecorder();
    rec.state.clip = clip;
    const stt = fakeTranscriber();
    if (transcribe === "fail") stt.state.result = { ok: false, code: "failed" };
    const ins = fakeInserter();
    const dictation = createDictation({
      clock: time.clock,
      recorder: rec.recorder,
      transcriber: stt.transcriber,
      inserter: ins.inserter,
      hotkeys: keys.source,
      storage: fakeStorage().storage,
      keepClip: (_c, why) => kept.push(why),
    });
    return { dictation, kept, time, keys, ins, stt };
  }
  const run = async (k: ReturnType<typeof keeper>) => {
    await k.dictation.ready();
    k.keys.send("ControlRight", true, k.time.clock.now());
    await k.time.advance(1000);
    k.keys.send("ControlRight", false, k.time.clock.now());
    await k.time.advance(300);
  };

  it("a take that came back silent is kept and reported as muted or too quiet", async () => {
    const k = keeper(loud({ peak: 0.001 }));
    await run(k);
    expect(k.dictation.state()).toMatchObject({ status: "error", code: "mic-silent" });
    expect(k.stt.calls).toEqual([]);
    expect(k.kept).toEqual(["silent"]);
  });

  it("a recording cut short is kept and still inserted as a copy", async () => {
    const k = keeper(loud({ interrupted: true }));
    await run(k);
    expect(k.kept).toEqual(["interrupted"]);
    expect(k.ins.inserted[0]?.plan).toEqual({ method: "copy", reason: "interrupted" });
    expect(await k.dictation.history.list()).toMatchObject([{ kind: "interrupted" }]);
  });

  it("a take the model could not transcribe is kept for a retry", async () => {
    const k = keeper(loud(), "fail");
    await run(k);
    expect(k.kept).toEqual(["failed"]);
  });

  it("a take that worked is not kept", async () => {
    const k = keeper(loud());
    await run(k);
    expect(k.kept).toEqual([]);
  });
});

describe("cancel and restore", () => {
  it("keeps the cancelled audio for ten seconds and restores it into the window", async () => {
    const r = await rig({ mode: "toggle" });
    r.dictation.start();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(2000);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "cancelled", restorable: true } });
    r.dictation.restore();
    await r.time.advance(300);
    expect(r.ins.inserted).toHaveLength(1);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
    expect(await r.dictation.history.list()).toMatchObject([{ kind: "restored", outcome: "sent" }]);
  });

  it("a restore after ten seconds does nothing", async () => {
    const r = await rig({ mode: "toggle" });
    r.dictation.start();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(10_001);
    r.dictation.restore();
    await r.time.advance(300);
    expect(r.ins.inserted).toEqual([]);
  });

  it("a restore can be used once", async () => {
    const r = await rig({ mode: "toggle" });
    r.dictation.start();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(500);
    r.dictation.restore();
    r.dictation.restore();
    await r.time.advance(300);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("starting a new recording drops the restorable one", async () => {
    const r = await rig({ mode: "toggle" });
    r.dictation.start();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(500);
    r.dictation.start();
    r.dictation.restore();
    await r.time.advance(100);
    expect(r.ins.inserted).toEqual([]);
  });

  it("a cancelled recording with no sound is not restorable", async () => {
    const r = await rig({ mode: "toggle" });
    r.rec.state.clip = loud({ peak: 0 });
    r.dictation.start();
    await r.time.advance(500);
    r.dictation.cancel();
    await r.time.advance(500);
    r.dictation.restore();
    await r.time.advance(300);
    expect(r.ins.inserted).toEqual([]);
  });
});

describe("return to app", () => {
  it("brings the window back and pastes there", async () => {
    const r = await rig();
    const calls: string[] = [];
    let now = target({ id: "other" });
    r.ins.inserter.focus = async (t) => {
      calls.push(t.id);
      now = t;
      return true;
    };
    const original = r.ins.inserter.target;
    r.ins.inserter.target = async () => (r.ins.state.current ? now : original());
    r.ins.state.current = target({ id: "win-1" });
    now = target({ id: "win-1" });
    r.press();
    await r.time.advance(1000);
    now = target({ id: "other" });
    r.release();
    await r.time.advance(300);
    expect(calls).toEqual(["win-1"]);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "paste" });
  });

  it("pastes nothing and keeps the text in History when the window does not come back", async () => {
    const r = await rig();
    let now = target({ id: "win-1" });
    r.ins.inserter.target = async () => now;
    r.ins.inserter.focus = async () => false;
    r.press();
    await r.time.advance(1000);
    now = target({ id: "other" });
    r.release();
    await r.time.advance(300);
    expect(r.ins.inserted).toEqual([]);
    expect(r.dictation.state()).toMatchObject({ status: "error", code: "focus-failed" });
    expect(await r.dictation.history.list()).toMatchObject([{ text: "Hello world ", outcome: "failed" }]);
  });

  it("a stuck focus call passes after the stage deadline", async () => {
    const r = await rig();
    let now = target({ id: "win-1" });
    r.ins.inserter.target = async () => now;
    r.ins.inserter.focus = () => new Promise(() => undefined);
    r.press();
    await r.time.advance(1000);
    now = target({ id: "other" });
    r.release();
    await r.time.advance(2500);
    expect(r.dictation.state()).toMatchObject({ status: "error", code: "focus-failed" });
  });

  it("never brings a window back in front of a password field", async () => {
    const r = await rig();
    let focused = false;
    let now = target({ id: "win-1" });
    r.ins.inserter.target = async () => now;
    r.ins.inserter.focus = async () => (focused = true);
    r.press();
    await r.time.advance(1000);
    now = target({ id: "other", passwordField: true });
    r.release();
    await r.time.advance(300);
    expect(focused).toBe(false);
    expect(r.dictation.state()).toMatchObject({ status: "error", code: "password-field" });
  });

  it("is off when the setting is off: the text is copied as before", async () => {
    const r = await rig({ returnToApp: false });
    let now = target({ id: "win-1" });
    let focused = false;
    r.ins.inserter.target = async () => now;
    r.ins.inserter.focus = async () => (focused = true);
    r.press();
    await r.time.advance(1000);
    now = target({ id: "other" });
    r.release();
    await r.time.advance(300);
    expect(focused).toBe(false);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "copy", reason: "focus-changed" });
  });
});

describe("optional stages pass their input on", () => {
  it("a history write that never finishes does not hold the paste forever", async () => {
    const storage = fakeStorage();
    storage.storage.save = () => new Promise(() => undefined);
    const r = await rig({ keepReady: true }, storage);
    await r.hold(1000);
    await r.time.advance(2500);
    expect(r.ins.inserted).toHaveLength(1);
    await flush();
  });

  it("a window read that never finishes is treated as an unknown window and copies", async () => {
    const r = await rig();
    let calls = 0;
    r.ins.inserter.target = () => (++calls === 1 ? Promise.resolve(target()) : new Promise(() => undefined));
    await r.hold(1000);
    await r.time.advance(2500);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "paste" });
  });
});

describe("keep on clipboard", () => {
  it("is part of the paste plan", async () => {
    const r = await rig({ keepOnClipboard: true });
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "paste", keep: true });
  });
  it("is ignored when typing or copying", async () => {
    const r = await rig({ keepOnClipboard: true, insertMode: "type" });
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "type" });
  });
});

describe("what a dictation records", () => {
  it("stores the program's friendly name, the outcome and the transcription time", async () => {
    const r = await rig();
    r.ins.state.current = target({ name: "Notepad" });
    await r.hold(1000);
    await r.time.advance(300);
    expect(await r.dictation.history.list()).toMatchObject([{ app: "notepad.exe", displayName: "Notepad", outcome: "sent", timings: { transcribeMs: 0 } }]);
  });

  it("marks a copy as copied", async () => {
    const r = await rig({ insertMode: "copy" });
    await r.hold(1000);
    await r.time.advance(300);
    expect(await r.dictation.history.list()).toMatchObject([{ outcome: "copied" }]);
  });
});

describe("logs never carry spoken words", () => {
  it("a stage that fails is logged by name and reason only", async () => {
    const lines: string[] = [];
    const time = fakeClock();
    const keys = fakeKeyboard();
    const rec = fakeRecorder();
    const stt = fakeTranscriber("my secret password is hunter two");
    const ins = fakeInserter();
    const storage = fakeStorage();
    storage.storage.save = () => Promise.reject(new Error("disk full"));
    const d = createDictation({
      clock: time.clock,
      recorder: rec.recorder,
      transcriber: stt.transcriber,
      inserter: ins.inserter,
      hotkeys: keys.source,
      storage: storage.storage,
      log: (stage, why) => lines.push(`${stage}: ${why}`),
    });
    await d.ready();
    ins.inserter.target = () => new Promise(() => undefined);
    keys.send("ControlRight", true, time.clock.now());
    await time.advance(1000);
    keys.send("ControlRight", false, time.clock.now());
    await time.advance(2500);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toMatch(/secret|password|hunter/i);
    expect(lines[0]).toBe("window: timeout");
  });
});

describe("skip long pauses", () => {
  /** Speech, a ten second pause, speech: 1 s of tone, 10 s of exact silence, 1 s of tone. */
  const tone = (seconds: number) => Float32Array.from({ length: 16000 * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 16000));
  const pause = (): Clip => {
    const pcm = tone(12);
    pcm.fill(0, 16000, 16000 * 11);
    return { pcm, sampleRate: 16000, peak: 0.5 };
  };

  it("sends the model the shortened recording and notes how much was cut", async () => {
    const r = await rig({ keepReady: true, skipPauses: true });
    r.rec.state.clip = pause();
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.stt.calls).toEqual([{ language: "auto", samples: 16000 * 12 - 16000 * 7.2 }]);
    expect((await r.dictation.history.list())[0]?.timings?.pausesDroppedMs).toBe(7200);
  });

  it("is off by default: the model hears the whole recording", async () => {
    const r = await rig();
    r.rec.state.clip = pause();
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.stt.calls).toEqual([{ language: "auto", samples: 16000 * 12 }]);
    expect((await r.dictation.history.list())[0]?.timings).toEqual({ transcribeMs: 0 });
  });

  it("goes back to the whole recording when the shortened one is heard as nothing", async () => {
    const r = await rig({ keepReady: true, skipPauses: true });
    r.rec.state.clip = pause();
    r.stt.state.queue = [
      { ok: true, text: "" },
      { ok: true, text: "whole clip text" },
    ];
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.stt.calls.map((c) => c.samples)).toEqual([16000 * 12 - 16000 * 7.2, 16000 * 12]);
    expect((await r.dictation.history.list())[0]?.text).toContain("Whole clip text");
  });

  it("keeps a recording without a long pause as it is", async () => {
    const r = await rig({ keepReady: true, skipPauses: true });
    r.rec.state.clip = { pcm: tone(3), sampleRate: 16000, peak: 0.5 };
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.stt.calls).toEqual([{ language: "auto", samples: 48000 }]);
  });
});
