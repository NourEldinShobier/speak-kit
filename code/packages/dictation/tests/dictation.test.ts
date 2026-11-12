import { describe, expect, it } from "vite-plus/test";
import { createDictation, defaultSettings, type DictationState } from "../src";
import { fakeClock, fakeInserter, fakeKeyboard, fakeRecorder, fakeStorage, fakeTranscriber, flush, loud, rig, target } from "./fakes";

describe("defaults", () => {
  it("are Right Ctrl held to talk, Escape to cancel, automatic language and every text rule on", () => {
    expect(defaultSettings).toEqual({
      hotkey: "ControlRight",
      cancelKey: "Escape",
      mode: "hold",
      language: "auto",
      duck: false,
      skipPauses: false,
      keepReady: false,
      keepOnClipboard: false,
      returnToApp: true,
      insertMode: "paste",
      appModes: {},
      fillers: true,
      spokenSymbols: true,
      spokenFormatting: true,
      autoCapitalize: true,
      trailingSpace: true,
      replacements: [],
      retention: "7d",
      holdMs: 300,
      secondKey: "",
      mouseKey: "",
      rawKey: "",
      pasteLastKey: "",
    });
  });

  it("clean up a spoken sentence without any configuration", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: "um hello comma new line world" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hello,\nWorld ");
  });
});

describe("hold to talk", () => {
  it("inserts the transcript into the window the user was in", async () => {
    const r = await rig();
    const [down, up] = await r.hold(1000);
    expect([down, up]).toEqual([true, true]);
    expect(r.rec.log).toEqual(["start:450"]);
    expect(r.dictation.state()).toEqual({ status: "transcribing" });
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.stt.calls).toEqual([{ language: "auto", samples: 16000 }]);
    expect(r.ins.inserted).toEqual([{ text: "Hello world ", plan: { method: "paste" } }]);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
    expect(r.states).toEqual(["recording", "transcribing", "pasting", "idle"]);
  });

  it("keeps the transcript in the history with the program it went to", async () => {
    const r = await rig();
    await r.hold(1000);
    await r.time.advance(200);
    expect(await r.dictation.history.list()).toStrictEqual([
      { id: "1001200-0", at: 1001200, text: "Hello world ", raw: "hello world", app: "notepad.exe", durationMs: 1000, timings: { transcribeMs: 0 }, outcome: "sent" },
    ]);
  });

  it("leaves out what it does not know: no program, no language, no model", async () => {
    const r = await rig();
    r.ins.state.targetThrows = true;
    await r.hold(1000);
    await r.time.advance(200);
    expect(await r.dictation.history.list()).toStrictEqual([
      { id: "1001200-0", at: 1001200, text: "Hello world ", raw: "hello world", durationMs: 1000, timings: { transcribeMs: 0 }, outcome: "copied" },
    ]);
  });

  it("records the language and model the engine reports", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: "guten tag", language: "de", model: "turbo" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(await r.dictation.history.list()).toMatchObject([{ language: "de", model: "turbo" }]);
  });

  it("a release 1 ms before the threshold is a short tap and discards", async () => {
    const r = await rig();
    await r.hold(299);
    await r.time.advance(1000);
    expect(r.rec.log).toEqual(["start:450", "discard"]);
    expect(r.stt.calls).toEqual([]);
    expect(r.ins.inserted).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });

  it("a release exactly at the threshold is a hold and finishes", async () => {
    const r = await rig();
    await r.hold(300);
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("repeated key-down events while the key is held change nothing", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(400);
    expect(r.press()).toBe(true);
    expect(r.rec.log).toEqual(["start:450"]);
    r.release();
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("key repeats after the press that finishes a locked recording do not start another one", async () => {
    const r = await rig();
    await r.hold(100);
    await r.hold(100);
    r.press();
    await r.time.advance(30);
    r.press();
    r.press();
    await r.time.advance(200);
    r.release();
    expect(r.rec.log).toEqual(["start:450", "discard", "start:450", "stop"]);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
  });

  it("a key release with nothing recording is ignored", async () => {
    const r = await rig();
    expect(r.release()).toBe(true);
    expect(r.rec.log).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });

  it("other keys are not consumed while idle", async () => {
    const r = await rig();
    expect([r.keys.send("KeyA", true, 1), r.keys.send("KeyA", false, 2), r.keys.send("Escape", true, 3)]).toEqual([false, false, false]);
  });

  it("keeps no audio from before the press when other audio is being ducked", async () => {
    const r = await rig({ duck: true });
    await r.hold(500);
    expect(r.rec.log).toEqual(["start:0"]);
  });
});

describe("stray keys", () => {
  it("another key during a short hold is a chord: discard, and the key reaches the app", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(100);
    expect(r.keys.send("KeyC", true, r.time.clock.now())).toBe(false);
    await r.time.advance(0);
    expect(r.rec.log).toEqual(["start:450", "discard"]);
    await r.time.advance(500);
    expect(r.release()).toBe(true);
    await r.time.advance(500);
    expect(r.stt.calls).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });

  it("a long hold ignores a stray key and keeps the audio", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(2000);
    expect(r.keys.send("KeyX", true, r.time.clock.now())).toBe(false);
    r.release();
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });

  it("Escape during a hold passes through and never throws the recording away", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(5000);
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(false);
    r.release();
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });
});

describe("double tap lock", () => {
  it("two quick taps lock the recording, and a fresh press finishes it", async () => {
    const r = await rig();
    await r.hold(100);
    await r.time.advance(100);
    await r.hold(100);
    expect(r.dictation.state()).toEqual({ status: "locked" });
    expect(r.rec.log).toEqual(["start:450", "discard", "start:450"]);
    await r.time.advance(5000);
    expect(r.dictation.state()).toEqual({ status: "locked" });
    r.press();
    expect(r.dictation.state()).toEqual({ status: "transcribing" });
    r.release();
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "discard", "start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("a second tap that starts after the window does not lock", async () => {
    const r = await rig();
    await r.hold(100);
    await r.time.advance(301);
    await r.hold(100);
    expect(r.dictation.state()).toEqual({ status: "idle" });
    expect(r.rec.log).toEqual(["start:450", "discard", "start:450", "discard"]);
  });

  it("Escape in a locked recording reaches the app and does not cancel", async () => {
    const r = await rig();
    await r.hold(100);
    await r.hold(100);
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(false);
    expect(r.dictation.state()).toEqual({ status: "locked" });
  });

  it("a lost key release is repaired by the stuck-key poll and the recording stays locked", async () => {
    const r = await rig();
    await r.hold(100);
    r.press();
    await r.time.advance(150);
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "hold" });
    r.release(); // the adapter's safety poll sends the release the hook missed
    expect(r.dictation.state()).toEqual({ status: "locked" });
  });
});

describe("toggle mode", () => {
  it("press starts, release keeps recording, the next press finishes", async () => {
    const r = await rig({ mode: "toggle" });
    r.press();
    r.release();
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "toggle" });
    await r.time.advance(10_000);
    r.press();
    r.release();
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("a short tap does not discard in toggle mode", async () => {
    const r = await rig({ mode: "toggle" });
    await r.hold(50);
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "toggle" });
    expect(r.rec.log).toEqual(["start:450"]);
  });

  it("Escape cancels a toggled recording and is swallowed, nothing is inserted", async () => {
    const r = await rig({ mode: "toggle" });
    r.press();
    r.release();
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(true);
    await r.time.advance(500);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "cancelled", undoable: true } });
  });

  it("a custom cancel key works and Escape then passes through", async () => {
    const r = await rig({ mode: "toggle", cancelKey: "Backspace" });
    r.press();
    r.release();
    expect(r.keys.send("Escape", true, 1)).toBe(false);
    expect(r.keys.send("Backspace", true, 2)).toBe(true);
    await r.time.advance(0);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });

  it("Escape while idle is not swallowed", async () => {
    const r = await rig({ mode: "toggle" });
    expect(r.keys.send("Escape", true, 1)).toBe(false);
  });
});

describe("recording limit", () => {
  it("finishes a toggled recording nobody stopped after thirty minutes and transcribes it", async () => {
    const r = await rig({ mode: "toggle" });
    r.press();
    r.release();
    await r.time.advance(1_799_000);
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "toggle" });
    await r.time.advance(2000);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
  });

  it("finishes a hold whose key release was lost, and the later release changes nothing", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(1_801_000);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
    r.release();
    await r.time.advance(1000);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });

  it("measures the thirty minutes from each recording's own start", async () => {
    const r = await rig({ mode: "toggle" });
    r.press();
    r.release();
    await r.time.advance(200_000);
    r.press();
    r.release();
    await r.time.advance(1000);
    r.press();
    r.release();
    await r.time.advance(200_000);
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "toggle" });
    expect(r.rec.log).toEqual(["start:450", "stop", "start:450"]);
  });

  it("leaves no timer behind when the recording ends in time", async () => {
    const r = await rig();
    await r.hold(1000);
    await r.time.advance(200);
    r.dictation.dispose();
    expect(r.time.pending()).toBe(0);
  });
});

describe("controls without the hotkey", () => {
  it("start, stop and cancel work like a toggled recording", async () => {
    const r = await rig();
    r.dictation.start();
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "toggle" });
    r.dictation.start();
    await r.time.advance(0);
    expect(r.rec.log).toEqual(["start:450"]);
    r.dictation.stop();
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
    r.dictation.start();
    r.dictation.cancel();
    await r.time.advance(2000);
    expect(r.rec.log).toEqual(["start:450", "stop", "start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("stop and cancel with nothing recording do nothing", async () => {
    const r = await rig();
    r.dictation.stop();
    r.dictation.cancel();
    expect(r.rec.log).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });

  it("stop ends a recording that the held hotkey started", async () => {
    const r = await rig();
    r.press();
    r.dictation.stop();
    r.release();
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
  });
});

describe("recording problems", () => {
  it("a missing microphone shows the error, records nothing, and the next press starts clean", async () => {
    const r = await rig();
    r.rec.state.startResult = { ok: false, code: "mic-missing" };
    await r.hold(1000);
    await r.time.advance(300);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-missing" });
    expect(r.rec.log).toEqual(["start:450"]);
    expect(r.stt.calls).toEqual([]);
    r.rec.state.startResult = { ok: true };
    r.press();
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "hold" });
  });

  it("the error goes away by itself after 4 seconds", async () => {
    const r = await rig();
    r.rec.state.startResult = { ok: false, code: "mic-denied" };
    r.press();
    await r.time.advance(3999);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-denied" });
    await r.time.advance(1);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });

  it("a recorder that throws is reported as a microphone failure", async () => {
    const r = await rig();
    r.rec.state.startThrows = true;
    r.press();
    await r.time.advance(10);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-failed" });
  });

  it("releasing during a cold microphone start waits for the start, then keeps the audio", async () => {
    const r = await rig();
    let open = () => {};
    r.rec.state.startGate = new Promise<void>((resolve) => (open = resolve));
    r.press();
    await r.time.advance(400);
    r.release();
    await r.time.advance(1000);
    expect(r.rec.log).toEqual(["start:450"]);
    open();
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop"]);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("a short tap while the microphone is still starting discards after the start", async () => {
    const r = await rig();
    let open = () => {};
    r.rec.state.startGate = new Promise<void>((resolve) => (open = resolve));
    await r.hold(100);
    open();
    await r.time.advance(10);
    expect(r.rec.log).toEqual(["start:450", "discard"]);
  });

  it("a release that came before the microphone failed to open leaves nothing queued and shows the error", async () => {
    const r = await rig();
    let open = () => {};
    r.rec.state.startGate = new Promise<void>((resolve) => (open = resolve));
    r.rec.state.startResult = { ok: false, code: "mic-busy" };
    r.press();
    await r.time.advance(400);
    r.release();
    expect(r.dictation.state()).toEqual({ status: "transcribing" });
    const seen: DictationState[] = [];
    r.dictation.subscribe((s) => seen.push(s));
    open();
    await r.time.advance(1000);
    expect(r.rec.log).toEqual(["start:450"]);
    expect(r.stt.calls).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-busy" });
    expect(seen.at(-1)).toEqual({ status: "error", code: "mic-busy" });
  });

  it("a short tap that came before the microphone failed to open does not discard what never started", async () => {
    const r = await rig();
    let open = () => {};
    r.rec.state.startGate = new Promise<void>((resolve) => (open = resolve));
    r.rec.state.startResult = { ok: false, code: "mic-busy" };
    await r.hold(100);
    open();
    await r.time.advance(10);
    expect(r.rec.log).toEqual(["start:450"]);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-busy" });
  });

  it("a microphone that delivers only digital silence is reported, not pasted as nothing", async () => {
    const r = await rig();
    r.rec.state.clip = loud({ peak: 0 });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "mic-silent" });
    expect(r.stt.calls).toEqual([]);
    expect(r.ins.inserted).toEqual([]);
  });

  it("a recorder that fails to stop is an error and the next dictation still works", async () => {
    const r = await rig();
    const stop = r.rec.recorder.stop;
    r.rec.recorder.stop = async () => {
      throw new Error("device lost");
    };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "failed" });
    r.rec.recorder.stop = stop;
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
  });

  it("a recorder that fails to discard does not break the next recording", async () => {
    const r = await rig();
    r.rec.recorder.discard = async () => {
      throw new Error("already closed");
    };
    await r.hold(100);
    await r.time.advance(1000);
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
  });
});

describe("transcription outcomes", () => {
  it("silence inserts nothing and leaves nothing in the history", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: "" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toEqual([]);
    expect(await r.dictation.history.list()).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "no-speech" } });
  });

  it("a model that prints a silence tag inserts nothing", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: " [BLANK_AUDIO]" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toEqual([]);
  });

  it("a missing or loading model is reported with its own code", async () => {
    const r = await rig();
    r.stt.state.result = { ok: false, code: "model-missing" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "model-missing" });
    r.stt.state.result = { ok: false, code: "model-loading" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "model-loading" });
  });

  it("a failed transcription is reported and inserts nothing", async () => {
    const r = await rig();
    r.stt.state.result = { ok: false, code: "failed" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "transcribe-failed" });
    expect(r.ins.inserted).toEqual([]);
  });

  it("a transcriber that throws is a failure, and the next dictation works", async () => {
    const r = await rig();
    r.stt.transcriber.transcribe = async () => {
      throw new Error("worker died");
    };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "failed" });
  });

  it("applies the text rules with the language the engine detected", async () => {
    const r = await rig({ language: "auto" });
    r.stt.state.result = { ok: true, text: "hallo komma welt", language: "de" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hallo, welt ");
  });

  it("passes the chosen language to the transcriber", async () => {
    const r = await rig({ language: "ar" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.stt.calls[0]?.language).toBe("ar");
  });

  it("the state shows transcribing while the engine works and pasting while the text goes in", async () => {
    const r = await rig();
    let open = () => {};
    r.stt.state.gate = new Promise<void>((resolve) => (open = resolve));
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "transcribing" });
    open();
    await r.time.advance(0);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
    expect(r.states).toEqual(["recording", "transcribing", "pasting", "idle"]);
  });
});

describe("where the text goes", () => {
  it("copies instead of pasting when the focus moved to another window while speaking", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(1000);
    r.ins.state.current = target({ id: "win-2", exe: "chrome.exe" });
    r.release();
    await r.time.advance(200);
    expect(r.ins.inserted).toEqual([{ text: "Hello world ", plan: { method: "copy", reason: "focus-changed" } }]);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "copied", reason: "focus-changed" } });
    expect(await r.dictation.history.list()).toMatchObject([{ app: "chrome.exe" }]);
  });

  it("remembers the window from the moment the key was pressed", async () => {
    const r = await rig();
    r.ins.state.current = target({ id: "win-1", exe: "WindowsTerminal.exe" });
    r.press();
    await r.time.advance(500);
    r.ins.state.current = target({ id: "win-1", exe: "WindowsTerminal.exe" });
    r.release();
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "paste" });
  });

  it("refuses a password field: nothing is inserted and nothing is saved", async () => {
    const r = await rig();
    r.ins.state.current = target({ passwordField: true });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toEqual([]);
    expect(await r.dictation.history.list()).toEqual([]);
    expect(r.dictation.state()).toEqual({ status: "error", code: "password-field" });
  });

  it("copies when the window is elevated", async () => {
    const r = await rig();
    r.ins.state.current = target({ elevated: true });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "copy", reason: "elevated" });
  });

  it("copies when no window could be read", async () => {
    const r = await rig();
    r.ins.state.targetThrows = true;
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "copy", reason: "no-target" });
  });

  it("only copies what a stopped microphone delivered, never pastes it", async () => {
    const r = await rig();
    r.rec.state.clip = loud({ interrupted: true });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "copy", reason: "interrupted" });
  });

  it("never reports success when the insertion failed, and the text stays in the history", async () => {
    const r = await rig();
    r.ins.state.result = { ok: false, code: "rejected" };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "error", code: "insert-failed" });
    expect(await r.dictation.history.list()).toMatchObject([{ text: "Hello world ", outcome: "failed" }]);
  });

  it("uses the insert mode from the settings", async () => {
    const r = await rig({ insertMode: "type" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.plan).toEqual({ method: "type" });
  });
});

describe("several recordings in a row", () => {
  it("a press while the last one is still transcribing starts a new recording, and the texts arrive in order", async () => {
    const r = await rig();
    let open = () => {};
    r.stt.state.gate = new Promise<void>((resolve) => (open = resolve));
    r.stt.state.queue = [
      { ok: true, text: "first" },
      { ok: true, text: "second" },
    ];
    await r.hold(1000);
    await r.time.advance(200);
    await r.hold(1000);
    expect(r.dictation.state()).toEqual({ status: "transcribing" });
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop", "start:450", "stop"]);
    open();
    await r.time.advance(10);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["First ", "Second "]);
  });

  it("a press inside the release tail waits for the old clip before opening the microphone again", async () => {
    const r = await rig();
    await r.hold(1000);
    r.press();
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "hold" });
    expect(r.rec.log).toEqual(["start:450"]);
    await r.time.advance(200);
    expect(r.rec.log).toEqual(["start:450", "stop", "start:450"]);
  });

  it("a failed recording does not stop the ones queued behind it", async () => {
    const r = await rig();
    r.stt.state.queue = [{ ok: false, code: "failed" }];
    await r.hold(1000);
    await r.time.advance(200);
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
  });
});

describe("settings changes", () => {
  it("apply at once, also in the middle of a recording", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(1000);
    r.dictation.configure({ language: "de", trailingSpace: false });
    r.release();
    await r.time.advance(200);
    expect(r.stt.calls[0]?.language).toBe("de");
    expect(r.ins.inserted[0]?.text).toBe("Hello world");
  });

  it("a new hotkey takes over after the current hold ends with the key that started it", async () => {
    const r = await rig();
    r.press("ControlRight");
    await r.time.advance(1000);
    r.dictation.configure({ hotkey: "F9" });
    expect(r.release("ControlRight")).toBe(true);
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(1);
    expect(r.press("ControlRight")).toBe(false);
    expect(r.press("F9")).toBe(true);
    await r.time.advance(0);
    expect(r.rec.log).toEqual(["start:450", "stop", "start:450"]);
  });

  it("a hotkey change during a chord discard still lets the old key's release end it", async () => {
    const r = await rig();
    r.press("ControlRight");
    await r.time.advance(50);
    r.keys.send("KeyC", true, r.time.clock.now());
    r.dictation.configure({ hotkey: "F9" });
    expect(r.release("ControlRight")).toBe(true);
    expect(r.press("F9")).toBe(true);
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "hold" });
  });
});

describe("the hotkey being ready", () => {
  it("is not live until the hook is installed, and ready() says when it is", async () => {
    const time = fakeClock();
    const keys = fakeKeyboard();
    let install = () => {};
    const slow = { subscribe: (h: Parameters<typeof keys.source.subscribe>[0]) => new Promise<() => void>((resolve) => (install = () => void keys.source.subscribe(h).then(resolve))) };
    const d = createDictation({
      clock: time.clock,
      recorder: fakeRecorder().recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: slow,
      storage: fakeStorage().storage,
    });
    let ready: boolean | undefined;
    void d.ready().then((v) => (ready = v));
    await flush();
    expect([ready, keys.attached()]).toEqual([undefined, false]);
    install();
    await flush();
    expect([ready, keys.attached()]).toEqual([true, true]);
    d.dispose();
    expect(keys.attached()).toBe(false);
  });

  it("reports a hook that could not be installed", async () => {
    const time = fakeClock();
    const d = createDictation({
      clock: time.clock,
      recorder: fakeRecorder().recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: { subscribe: () => Promise.reject(new Error("hook refused")) },
      storage: fakeStorage().storage,
    });
    expect(await d.ready()).toBe(false);
    expect(d.state()).toEqual({ status: "error", code: "hotkey-failed" });
  });

  it("disposing before the hook arrives removes it as soon as it does", async () => {
    const time = fakeClock();
    const keys = fakeKeyboard();
    let finish = () => {};
    const slow = { subscribe: (h: Parameters<typeof keys.source.subscribe>[0]) => new Promise<() => void>((resolve) => (finish = () => void keys.source.subscribe(h).then(resolve))) };
    const d = createDictation({
      clock: time.clock,
      recorder: fakeRecorder().recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: slow,
      storage: fakeStorage().storage,
    });
    d.dispose();
    finish();
    await d.ready();
    expect(keys.attached()).toBe(false);
  });
});

describe("state notifications", () => {
  it("tells listeners about every change once, and stops after unsubscribe", async () => {
    const r = await rig();
    const seen: string[] = [];
    const off = r.dictation.subscribe((s) => seen.push(s.status));
    r.press();
    r.press();
    await r.time.advance(400);
    r.release();
    expect(seen).toEqual(["recording", "transcribing"]);
    off();
    await r.time.advance(200);
    expect(seen).toEqual(["recording", "transcribing"]);
  });

  it("the notice disappears after 1.2 seconds, and listeners hear it", async () => {
    const r = await rig();
    const seen: DictationState[] = [];
    r.dictation.subscribe((s) => seen.push(s));
    await r.hold(1000);
    await r.time.advance(200);
    await r.time.advance(1199);
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
    await r.time.advance(1);
    expect(r.dictation.state()).toEqual({ status: "idle" });
    expect(seen.at(-1)).toEqual({ status: "idle" });
  });

  it("starting a recording clears the previous notice at once", async () => {
    const r = await rig();
    await r.hold(1000);
    await r.time.advance(200);
    r.press();
    expect(r.dictation.state()).toEqual({ status: "recording", mode: "hold" });
    await r.time.advance(0);
    r.release();
    await r.time.advance(5000);
    expect(r.dictation.state()).toEqual({ status: "idle" });
  });
});

describe("disposing", () => {
  it("discards a running recording, detaches the hotkey and ignores later calls", async () => {
    const r = await rig();
    r.press();
    await r.time.advance(500);
    r.dictation.dispose();
    await r.time.advance(10);
    expect(r.rec.log).toEqual(["start:450", "discard"]);
    expect(r.keys.attached()).toBe(false);
    r.dictation.start();
    r.dictation.stop();
    r.dictation.cancel();
    r.dictation.dispose();
    await r.time.advance(5000);
    expect(r.rec.log).toEqual(["start:450", "discard"]);
    expect(r.time.pending()).toBe(0);
  });

  it("detaches the hotkey only once when disposed twice", async () => {
    const time = fakeClock();
    let detached = 0;
    const d = createDictation({
      clock: time.clock,
      recorder: fakeRecorder().recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: { subscribe: async () => () => void detached++ },
      storage: fakeStorage().storage,
    });
    await d.ready();
    d.dispose();
    d.dispose();
    expect(detached).toBe(1);
  });

  it("tells no listener about a transcription that finishes after dispose", async () => {
    const r = await rig();
    let open = () => {};
    r.stt.state.gate = new Promise<void>((resolve) => (open = resolve));
    await r.hold(1000);
    await r.time.advance(200);
    const seen: DictationState[] = [];
    r.dictation.subscribe((s) => seen.push(s));
    r.dictation.dispose();
    open();
    await r.time.advance(10);
    expect(seen).toEqual([]);
  });

  it("does not deliver key events after dispose even if the source still calls", async () => {
    const time = fakeClock();
    const rec = fakeRecorder();
    let handler: ((e: { key: string; down: boolean; at: number }) => boolean) | undefined;
    const d = createDictation({
      clock: time.clock,
      recorder: rec.recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: { subscribe: async (h) => ((handler = h), () => {}) },
      storage: fakeStorage().storage,
    });
    await d.ready();
    d.dispose();
    expect(handler?.({ key: "ControlRight", down: true, at: 1 })).toBe(false);
    expect(rec.log).toEqual([]);
  });
});

describe("history through the dictation", () => {
  it("searches, copies, removes and clears", async () => {
    const r = await rig();
    r.stt.state.queue = [
      { ok: true, text: "buy milk" },
      { ok: true, text: "call anna" },
    ];
    await r.hold(1000);
    await r.time.advance(200);
    await r.hold(1000);
    await r.time.advance(200);
    const all = await r.dictation.history.list();
    expect(all.map((e) => e.text)).toEqual(["Call anna ", "Buy milk "]);
    expect((await r.dictation.history.list({ search: "MILK" })).map((e) => e.text)).toEqual(["Buy milk "]);
    expect(await r.dictation.history.copy(all[1]?.id ?? "")).toBe(true);
    expect(r.ins.inserted.at(-1)).toEqual({ text: "Buy milk ", plan: { method: "copy", reason: "manual" } });
    expect(await r.dictation.history.copy("missing")).toBe(false);
    await r.dictation.history.remove(all[0]?.id ?? "");
    expect((await r.dictation.history.list()).map((e) => e.text)).toEqual(["Buy milk "]);
    await r.dictation.history.clear();
    expect(await r.dictation.history.list()).toEqual([]);
  });

  it("copy reports false when the clipboard cannot be written", async () => {
    const r = await rig();
    await r.hold(1000);
    await r.time.advance(200);
    const [entry] = await r.dictation.history.list();
    r.ins.inserter.insert = async () => {
      throw new Error("clipboard busy");
    };
    expect(await r.dictation.history.copy(entry?.id ?? "")).toBe(false);
  });

  it("switching retention off empties the history and stops saving", async () => {
    const r = await rig();
    await r.hold(1000);
    await r.time.advance(200);
    expect(await r.dictation.history.list()).toHaveLength(1);
    r.dictation.configure({ retention: "off" });
    await r.time.advance(0);
    expect(r.storage.state.value).toEqual([]);
    expect(await r.dictation.history.list()).toEqual([]);
    await r.hold(1000);
    await r.time.advance(200);
    expect(await r.dictation.history.list()).toEqual([]);
  });

  it("keeps the history across restarts through the storage", async () => {
    const first = await rig();
    await first.hold(1000);
    await first.time.advance(200);
    const second = await rig({}, fakeStorage(first.storage.state.value));
    expect((await second.dictation.history.list()).map((e) => e.text)).toEqual(["Hello world "]);
  });
});
