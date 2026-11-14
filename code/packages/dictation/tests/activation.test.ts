import { describe, expect, it } from "vite-plus/test";
import { createDictation } from "../src";
import { initialSession, reduce, type Effect, type Session, type SessionEvent } from "../src/session";
import { fakeClock, fakeKeyboard, flush, loud, target } from "./fakes";

type Cfg = Parameters<typeof reduce>[2];
const base: Cfg = { hotkey: "H", cancelKey: "Esc", mode: "hold", duck: false, secondKey: "S", rawKey: "R" };

/** D<key><ms> down, U<key><ms> up, K<ms> another key down, E<ms> the cancel key down. Keys are one letter. */
function parse(t: string): SessionEvent {
  const at = Number(t.slice(t[0] === "K" || t[0] === "E" ? 1 : 2));
  if (t[0] === "K") return { type: "key", key: "A", down: true, at };
  if (t[0] === "E") return { type: "key", key: "Esc", down: true, at };
  return { type: "key", key: t[1]!, down: t[0] === "D", at };
}

function label(e: Effect): string {
  if (e.type === "start-recording") return "start";
  if (e.type === "finish-recording") return e.raw ? "finish-raw" : "finish";
  return e.cancelled ? "cancel" : "discard";
}

function play(script: string, cfg: Cfg = base) {
  let session: Session = initialSession;
  const effects: string[] = [];
  const consumed: boolean[] = [];
  for (const t of script.split(" ")) {
    const step = reduce(session, parse(t), cfg);
    session = step.session;
    consumed.push(step.consumed);
    effects.push(...step.effects.map(label));
  }
  return { capture: session.capture, effects, consumed };
}

describe("shortcut modes", () => {
  it("hold-only never locks: two quick taps discard both", () => {
    const r = play("DH0 UH100 DH200 UH300", { ...base, mode: "hold-only" });
    expect(r.effects).toEqual(["start", "discard", "start", "discard"]);
    expect(r.capture).toEqual({ kind: "idle" });
  });

  it("hold-only finishes a long hold", () => {
    expect(play("DH0 UH400", { ...base, mode: "hold-only" }).effects).toEqual(["start", "finish"]);
  });

  it("double-tap only: a long hold keeps nothing, the double-tap locks, a fresh press finishes", () => {
    const cfg: Cfg = { ...base, mode: "double-tap" };
    expect(play("DH0 UH900", cfg).effects).toEqual(["start", "discard"]);
    expect(play("DH0 UH100 DH200 UH300", cfg).capture).toEqual({ kind: "locked", id: 2, key: "H" });
    expect(play("DH0 UH100 DH200 UH300 DH5000", cfg).effects).toEqual(["start", "discard", "start", "finish"]);
  });

  it("tap-or-hold: a hold of 300 ms or more dictates until release, a shorter one toggles", () => {
    const cfg: Cfg = { ...base, mode: "tap-or-hold" };
    expect(play("DH0 UH299", cfg).capture).toMatchObject({ kind: "toggle", down: false });
    expect(play("DH0 UH300", cfg).effects).toEqual(["start", "finish"]);
  });

  it("tap-or-hold: the next press after a tap finishes", () => {
    expect(play("DH0 UH100 DH2000 UH2050", { ...base, mode: "tap-or-hold" }).effects).toEqual(["start", "finish"]);
  });

  it("tap-or-hold: a key from another app while recording does not cancel it", () => {
    const r = play("DH0 UH100 K500 K600", { ...base, mode: "tap-or-hold" });
    expect(r.effects).toEqual(["start"]);
    expect(r.capture).toMatchObject({ kind: "toggle" });
  });

  it("Escape does nothing while locked or held", () => {
    expect(play("DH0 UH100 DH200 UH300 E400", base).capture).toMatchObject({ kind: "locked" });
    expect(play("DH0 E400", base).capture).toMatchObject({ kind: "hold" });
  });

  it("a custom hold time moves the tap boundary", () => {
    expect(play("DH0 UH400", { ...base, holdMs: 500 }).effects).toEqual(["start", "discard"]);
    expect(play("DH0 UH500", { ...base, holdMs: 500 }).effects).toEqual(["start", "finish"]);
  });

  it("a mode changed during a hold does not strand the recording", () => {
    let session: Session = initialSession;
    session = reduce(session, { type: "key", key: "H", down: true, at: 0 }, { ...base, mode: "tap-or-hold" }).session;
    const step = reduce(session, { type: "key", key: "H", down: false, at: 900 }, { ...base, mode: "toggle" });
    expect(step.effects).toEqual([{ type: "finish-recording", id: 1 }]);
  });

  it("a key between the taps cancels the lock", () => {
    expect(play("DH0 UH100 K150 DH200 UH250").capture).toMatchObject({ kind: "armed" }); // a fresh tap arms again; it did not lock
  });
});

describe("second and raw shortcuts", () => {
  it("the second shortcut starts and the same shortcut ends a toggled recording", () => {
    expect(play("DS0 US10 DS900", { ...base, mode: "toggle" }).effects).toEqual(["start", "finish"]);
  });

  it("the other shortcut does not end a toggled recording", () => {
    expect(play("DS0 US10 DH900", { ...base, mode: "toggle" }).effects).toEqual(["start"]);
  });

  it("the shortcut that started a hold owns the release", () => {
    expect(play("DS0 US500").effects).toEqual(["start", "finish"]);
  });

  it("the raw shortcut finishes as raw", () => {
    expect(play("DR0 UR900").effects).toEqual(["start", "finish-raw"]);
  });

  it("an unset raw shortcut registers nothing", () => {
    const r = play("DR0 UR900", { ...base, rawKey: "" });
    expect(r.effects).toEqual([]);
    expect(r.consumed).toEqual([false, false]);
  });

  it("a double-tap needs the same shortcut twice", () => {
    expect(play("DH0 UH100 DS200").capture).toMatchObject({ kind: "hold", key: "S", lockUntil: -Infinity });
  });
});

const ports = (over: { micOwner?: () => string | undefined; insertOk?: boolean; text?: () => string; rawKey?: string; mode?: "toggle" } = {}) => {
  const clock = fakeClock();
  const keys = fakeKeyboard();
  const inserted: string[] = [];
  const starts: number[] = [];
  const saved: unknown[] = [];
  const d = createDictation({
    clock: clock.clock,
    hotkeys: keys.source,
    ...(over.micOwner && { micOwner: over.micOwner }),
    settings: { ...(over.rawKey && { rawKey: over.rawKey }), ...(over.mode && { mode: over.mode }) },
    recorder: { start: async () => (starts.push(1), { ok: true }), stop: async () => loud(), discard: async () => undefined },
    transcriber: { transcribe: async () => ({ ok: true, text: over.text?.() ?? "first" }) },
    inserter: { target: async () => target(), insert: async (r) => (inserted.push(r.text), over.insertOk === false ? { ok: false, code: "failed" } : { ok: true }) },
    storage: { load: async () => saved, save: async (v) => void (saved.splice(0), saved.push(...(v as unknown[]))) },
  });
  return { d, keys, clock, inserted, starts };
};

describe("raw dictation through the core", () => {
  it("skips clean-up and marks the history entry", async () => {
    const r = ports({ rawKey: "R", text: () => "um hello comma world" });
    await r.d.ready();
    r.keys.send("R", true, r.clock.clock.now());
    await r.clock.advance(1000);
    r.keys.send("R", false, r.clock.clock.now());
    await r.clock.advance(2000);
    expect(r.inserted).toEqual(["um hello comma world"]);
    expect((await r.d.history.list())[0]).toMatchObject({ kind: "raw", text: "um hello comma world" });
  });
});

describe("microphone ownership", () => {
  it("ignores the hotkey while another feature holds the microphone and names it", async () => {
    const r = ports({ micOwner: () => "Voice chat" });
    await r.d.ready();
    expect(r.keys.send("ControlRight", true, 1)).toBe(true);
    await flush();
    expect(r.starts).toEqual([]);
    expect(r.d.state()).toEqual({ status: "error", code: "mic-in-use", owner: "Voice chat" });
  });

  it("records as usual when the microphone is free", async () => {
    const r = ports({ micOwner: () => undefined });
    await r.d.ready();
    r.keys.send("ControlRight", true, 1);
    await flush();
    expect(r.starts).toEqual([1]);
  });
});

describe("undo cancel and paste last", () => {
  it("brings a cancelled recording back within a minute, and not after", async () => {
    const r = ports();
    await r.d.ready();
    r.d.start();
    await r.clock.advance(100);
    r.d.cancel();
    await r.clock.advance(100);
    expect(r.d.undoCancel()).toBe(true);
    await r.clock.advance(1000);
    expect(r.inserted).toEqual(["First "]);
    expect(r.d.undoCancel()).toBe(false);
    r.d.start();
    await r.clock.advance(100);
    r.d.cancel();
    await r.clock.advance(61_000);
    expect(r.d.undoCancel()).toBe(false);
  });

  it("pastes the newest non-empty entry, and says so when there is none", async () => {
    let said = "first";
    const r = ports({ text: () => said });
    await r.d.ready();
    expect(await r.d.pasteLast()).toBe("empty");
    for (const t of ["first", "second"]) {
      said = t;
      r.d.start();
      await r.clock.advance(100);
      r.d.stop();
      await r.clock.advance(1000);
    }
    r.inserted.length = 0;
    expect(await r.d.pasteLast()).toBe("pasted");
    expect(r.inserted).toEqual(["Second "]);
  });

  it("keeps a dictation whose paste failed, so paste last returns it and not older text", async () => {
    const r = ports({ insertOk: false });
    await r.d.ready();
    r.d.start();
    await r.clock.advance(100);
    r.d.stop();
    await r.clock.advance(1000);
    expect((await r.d.history.list())[0]?.text).toBe("First ");
    expect(await r.d.pasteLast()).toBe("failed");
  });
});

describe("capture for a command", () => {
  const rig = (text = "hello world") => {
    const r = ports({ text: () => text });
    return r;
  };

  it("hands the text to the caller, saves it as printed and never pastes it", async () => {
    const r = rig();
    await r.d.ready();
    const c = r.d.capture();
    await r.clock.advance(500);
    c.finish();
    await r.clock.advance(2000);
    expect(await c.result).toEqual({ ok: true, text: "Hello world " });
    expect(r.inserted).toEqual([]);
    expect((await r.d.history.list())[0]).toMatchObject({ kind: "printed", text: "Hello world " });
  });

  it("with raw on, keeps the text as spoken", async () => {
    const r = rig("um hello comma");
    await r.d.ready();
    const c = r.d.capture({ raw: true });
    await r.clock.advance(500);
    c.finish();
    await r.clock.advance(2000);
    expect(await c.result).toEqual({ ok: true, text: "um hello comma" });
  });

  it("ends with cancelled when cancelled, and the capture is free again", async () => {
    const r = rig();
    await r.d.ready();
    const c = r.d.capture();
    await r.clock.advance(200);
    c.cancel();
    expect(await c.result).toEqual({ ok: false, code: "cancelled" });
    await r.clock.advance(100);
    expect(r.d.state().status).toBe("idle");
  });

  it("is busy while a recording or another capture is running, and the running one is not disturbed", async () => {
    const r = rig();
    await r.d.ready();
    const first = r.d.capture();
    const second = r.d.capture();
    expect(await second.result).toEqual({ ok: false, code: "busy" });
    second.finish();
    expect(r.d.state().status).toBe("recording");
    first.cancel();
    expect(await first.result).toEqual({ ok: false, code: "cancelled" });
  });

  it("belongs to the command when the shortcut ends it", async () => {
    const r = rig();
    await r.d.ready();
    const c = r.d.capture();
    await r.clock.advance(500);
    r.keys.send("ControlRight", true, r.clock.clock.now());
    await r.clock.advance(2000);
    expect(await c.result).toEqual({ ok: true, text: "Hello world " });
    expect(r.inserted).toEqual([]);
  });

  it("says no-speech for silence the speech engine labels as noise", async () => {
    const r = rig("[BLANK_AUDIO]");
    await r.d.ready();
    const c = r.d.capture();
    await r.clock.advance(300);
    c.finish();
    await r.clock.advance(2000);
    expect(await c.result).toEqual({ ok: false, code: "no-speech" });
  });
});
