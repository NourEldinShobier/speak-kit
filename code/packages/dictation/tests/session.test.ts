import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { initialSession, reduce, type Effect, type Session, type SessionEvent } from "../src/session";

type Cfg = Parameters<typeof reduce>[2];
const hold: Cfg = { hotkey: "H", cancelKey: "Esc", mode: "hold", duck: false };
const toggle: Cfg = { ...hold, mode: "toggle" };

function label(e: Effect): string {
  if (e.type === "start-recording") return `start:${e.prerollMs}#${e.id}`;
  if (e.type === "finish-recording") return `finish#${e.id}`;
  return `${e.cancelled ? "cancel" : "discard"}#${e.id}`;
}

// Script: D=hotkey down, U=hotkey up, K=other key down, X=other key up, E=cancel key down, each followed by the time in ms.
// S=start, T=stop, C=cancel (time ignored), F<id>=recorder failed.
function parse(token: string): SessionEvent {
  const n = Number(token.slice(1));
  switch (token[0]) {
    case "D":
      return { type: "key", key: "H", down: true, at: n };
    case "U":
      return { type: "key", key: "H", down: false, at: n };
    case "K":
      return { type: "key", key: "A", down: true, at: n };
    case "X":
      return { type: "key", key: "A", down: false, at: n };
    case "E":
      return { type: "key", key: "Esc", down: true, at: n };
    case "S":
      return { type: "start", at: n };
    case "T":
      return { type: "stop" };
    case "C":
      return { type: "cancel" };
    default:
      return { type: "failed", id: n };
  }
}

function play(script: string, cfg: Cfg = hold) {
  let session: Session = initialSession;
  const effects: string[] = [];
  const consumed: boolean[] = [];
  for (const token of script.split(" ").filter(Boolean)) {
    const step = reduce(session, parse(token), cfg);
    session = step.session;
    effects.push(...step.effects.map(label));
    consumed.push(step.consumed);
  }
  return { capture: session.capture, seq: session.seq, effects, consumed };
}

describe("hold mode", () => {
  const rows: [string, string[], string][] = [
    ["D0", ["start:450#1"], "hold"],
    ["D0 U300", ["start:450#1", "finish#1"], "idle"],
    ["D0 U299", ["start:450#1", "discard#1"], "armed"],
    ["D0 U5000", ["start:450#1", "finish#1"], "idle"],
    ["D0 D50 D100", ["start:450#1"], "hold"],
    ["U10", [], "idle"],
    ["U10 U20", [], "idle"],
    ["D1000 U1300", ["start:450#1", "finish#1"], "idle"],
  ];
  for (const [script, effects, kind] of rows) it(`${script} -> ${effects.join(" ") || "nothing"}, ${kind}`, () => expect(play(script)).toMatchObject({ effects, capture: { kind } }));
});

describe("double tap lock", () => {
  const rows: [string, string[], string][] = [
    ["D0 U100 D200 U300", ["start:450#1", "discard#1", "start:450#2"], "locked"],
    ["D0 U100 D400 U400", ["start:450#1", "discard#1", "start:450#2"], "locked"],
    ["D0 U100 D401 U402", ["start:450#1", "discard#1", "start:450#2", "discard#2"], "armed"],
    ["D0 U100 D390 U400", ["start:450#1", "discard#1", "start:450#2"], "locked"],
    ["D0 U100 D390 U401", ["start:450#1", "discard#1", "start:450#2", "discard#2"], "armed"],
    ["D0 U100 D200 U700", ["start:450#1", "discard#1", "start:450#2", "finish#2"], "idle"],
    ["D0 U100 K150 D200 U250", ["start:450#1", "discard#1", "start:450#2", "discard#2"], "armed"],
    ["D0 U100 D200 U300 D1000", ["start:450#1", "discard#1", "start:450#2", "finish#2"], "ignoring"],
    ["D0 U100 D200 U300 D1000 U1050", ["start:450#1", "discard#1", "start:450#2", "finish#2"], "idle"],
    ["D0 U100 D200 U300 K400 E500", ["start:450#1", "discard#1", "start:450#2"], "locked"],
    ["D0 U100 D200 U300 D400 D410", ["start:450#1", "discard#1", "start:450#2", "finish#2"], "ignoring"],
  ];
  for (const [script, effects, kind] of rows) it(`${script} -> ${kind}`, () => expect(play(script)).toMatchObject({ effects, capture: { kind } }));

  it("a lock keeps the id of the second recording", () => {
    expect(play("D0 U100 D200 U300").capture).toEqual({ kind: "locked", id: 2 });
  });
});

describe("chords and stray keys", () => {
  const rows: [string, string[], string][] = [
    ["D0 K100", ["start:450#1", "discard#1"], "ignoring"],
    ["D0 K299", ["start:450#1", "discard#1"], "ignoring"],
    ["D0 K300", ["start:450#1"], "hold"],
    ["D0 K300 U400", ["start:450#1", "finish#1"], "idle"],
    ["D0 E100", ["start:450#1", "discard#1"], "ignoring"],
    ["D0 E5000 U6000", ["start:450#1", "finish#1"], "idle"],
    ["D0 K100 U200", ["start:450#1", "discard#1"], "idle"],
    ["D0 K100 D150 U200", ["start:450#1", "discard#1"], "idle"],
    ["D0 K100 U200 D300", ["start:450#1", "discard#1", "start:450#2"], "hold"],
    ["D0 X100", ["start:450#1"], "hold"],
    ["K0 X10 E20", [], "idle"],
  ];
  for (const [script, effects, kind] of rows) it(`${script} -> ${kind}`, () => expect(play(script)).toMatchObject({ effects, capture: { kind } }));
});

describe("toggle mode", () => {
  const rows: [string, string[], string][] = [
    ["D0", ["start:450#1"], "toggle"],
    ["D0 U10", ["start:450#1"], "toggle"],
    ["D0 U10 D5000", ["start:450#1", "finish#1"], "ignoring"],
    ["D0 U10 D5000 U5010", ["start:450#1", "finish#1"], "idle"],
    ["D0 D10 D20", ["start:450#1"], "toggle"],
    ["D0 U10 E100", ["start:450#1", "cancel#1"], "idle"],
    ["D0 E100", ["start:450#1", "cancel#1"], "idle"],
    ["D0 U10 K100", ["start:450#1"], "toggle"],
    ["D0 U10 K100 D200", ["start:450#1", "finish#1"], "ignoring"],
    ["D0 U10 E100 D200", ["start:450#1", "cancel#1", "start:450#2"], "toggle"],
    ["D0 U10 D100 U110 D200", ["start:450#1", "finish#1", "start:450#2"], "toggle"],
    ["D0 U10 D100 D110 D120", ["start:450#1", "finish#1"], "ignoring"],
    ["E0", [], "idle"],
  ];
  for (const [script, effects, kind] of rows) it(`${script} -> ${kind}`, () => expect(play(script, toggle)).toMatchObject({ effects, capture: { kind } }));

  it("the recording id stays with the toggled capture", () => {
    expect(play("D0 U10", toggle).capture).toEqual({ kind: "toggle", id: 1, down: false });
    expect(play("D0", toggle).capture).toEqual({ kind: "toggle", id: 1, down: true });
  });
});

describe("pre-roll", () => {
  it("is 450 ms normally and none when other audio is ducked", () => {
    expect(play("D0", hold).effects).toEqual(["start:450#1"]);
    expect(play("D0", { ...hold, duck: true }).effects).toEqual(["start:0#1"]);
    expect(play("D0", { ...toggle, duck: true }).effects).toEqual(["start:0#1"]);
  });
});

describe("controls", () => {
  const rows: [string, string[], string][] = [
    ["S0", ["start:450#1"], "toggle"],
    ["S0 S10", ["start:450#1"], "toggle"],
    ["S0 T", ["start:450#1", "finish#1"], "idle"],
    ["S0 C", ["start:450#1", "cancel#1"], "idle"],
    ["T", [], "idle"],
    ["C", [], "idle"],
    ["D0 T", ["start:450#1", "finish#1"], "idle"],
    ["D0 C", ["start:450#1", "cancel#1"], "idle"],
    ["D0 U100 D200 U300 T", ["start:450#1", "discard#1", "start:450#2", "finish#2"], "idle"],
    ["D0 U100 D200 U300 C", ["start:450#1", "discard#1", "start:450#2", "cancel#2"], "idle"],
    ["D0 U100 S150", ["start:450#1", "discard#1", "start:450#2"], "toggle"],
    ["D0 S10", ["start:450#1"], "hold"],
    ["D0 U100 T", ["start:450#1", "discard#1"], "armed"],
  ];
  for (const [script, effects, kind] of rows) it(`${script} -> ${kind}`, () => expect(play(script)).toMatchObject({ effects, capture: { kind } }));

  it("never consumes a control", () => {
    expect(play("S0 T S0 C").consumed).toEqual([false, false, false, false]);
  });
});

describe("recorder failure", () => {
  it("returns to idle when the current recording could not start", () => {
    expect(play("D0 F1")).toMatchObject({ capture: { kind: "idle" }, effects: ["start:450#1"] });
  });

  it("ignores a failure that belongs to an older recording", () => {
    expect(play("D0 U100 D200 U300 F1").capture).toEqual({ kind: "locked", id: 2 });
    expect(play("D0 U300 F1").capture).toEqual({ kind: "idle" });
    expect(play("D0 F2").capture).toMatchObject({ kind: "hold", id: 1 });
  });

  it("is never consumed", () => {
    expect(play("D0 F1").consumed).toEqual([true, false]);
  });
});

describe("what the keyboard hook must swallow", () => {
  it("consumes the hotkey in every state and only the cancel key of a toggled recording", () => {
    expect(play("D0 U100 D200 U300 D1000 U1100").consumed).toEqual([true, true, true, true, true, true]);
    expect(play("K0 X1 E2").consumed).toEqual([false, false, false]);
    expect(play("D0 K10 E20", hold).consumed).toEqual([true, false, false]);
    expect(play("D0 U10 E20 K30", toggle).consumed).toEqual([true, true, true, false]);
    expect(play("D0 U10 X20", toggle).consumed).toEqual([true, true, false]);
  });
});

describe("a hotkey changed in the middle of a hold", () => {
  it("is ended by the key that started it", () => {
    const s1 = reduce(initialSession, parse("D0"), hold);
    const moved: Cfg = { ...hold, hotkey: "F9" };
    const up = reduce(s1.session, { type: "key", key: "H", down: false, at: 500 }, moved);
    expect(up.effects.map(label)).toEqual(["finish#1"]);
    expect(up.consumed).toBe(true);
  });

  it("treats the new hotkey as an ordinary key during that hold", () => {
    const s1 = reduce(initialSession, parse("D0"), hold);
    const moved: Cfg = { ...hold, hotkey: "F9" };
    const down = reduce(s1.session, { type: "key", key: "F9", down: true, at: 100 }, moved);
    expect(down.effects.map(label)).toEqual(["discard#1"]);
    expect(down.consumed).toBe(false);
    const release = reduce(down.session, { type: "key", key: "H", down: false, at: 150 }, moved);
    expect(release.session.capture).toEqual({ kind: "idle" });
  });
});

type Generated = { type: "key"; key: string; down: boolean } | { type: "start" } | { type: "stop" } | { type: "cancel" } | { type: "failed"; id: number };
function toEvent(e: Generated, at: number): SessionEvent {
  if (e.type === "key") return { type: "key", key: e.key, down: e.down, at };
  if (e.type === "start") return { type: "start", at };
  if (e.type === "stop") return { type: "stop" };
  if (e.type === "cancel") return { type: "cancel" };
  return e;
}

describe("properties", () => {
  const event = fc.oneof(
    fc.record({ type: fc.constant("key" as const), key: fc.constantFrom("H", "A", "Esc"), down: fc.boolean(), gap: fc.integer({ min: 0, max: 700 }) }),
    fc.record({ type: fc.constantFrom("start" as const, "stop" as const, "cancel" as const), gap: fc.integer({ min: 0, max: 700 }) }),
    fc.record({ type: fc.constant("failed" as const), id: fc.integer({ min: 1, max: 6 }), gap: fc.integer({ min: 0, max: 700 }) }),
  );

  it("one recording at a time, each started once and ended once, never ended without a start", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), fc.constantFrom(hold, toggle), (events, cfg) => {
        let session = initialSession;
        let at = 0;
        const open = new Set<number>();
        const seen = new Set<number>();
        for (const e of events) {
          at += e.gap;
          const input = toEvent(e, at);
          const step = reduce(session, input, cfg);
          for (const fx of step.effects) {
            if (fx.type === "start-recording") {
              expect(seen.has(fx.id)).toBe(false);
              expect(fx.id).toBe(session.seq + 1);
              seen.add(fx.id);
              open.add(fx.id);
            } else {
              expect(open.has(fx.id)).toBe(true);
              open.delete(fx.id);
            }
          }
          const c = step.session.capture;
          if (input.type === "failed" && c.kind === "idle") open.clear();
          expect(open.size).toBeLessThanOrEqual(1);
          const recording = c.kind === "hold" || c.kind === "toggle" || c.kind === "locked";
          expect(recording ? open.has(c.id) : open.size === 0).toBe(true);
          expect(step.session.seq).toBe(seen.size);
          session = step.session;
        }
      }),
      { numRuns: 400 },
    );
  });

  it("always comes back to idle after the hotkey is pressed twice and released, whatever happened before", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 40 }), (events) => {
        let session = initialSession;
        let at = 0;
        for (const e of events) {
          at += e.gap;
          const input = toEvent(e, at);
          session = reduce(session, input, hold).session;
        }
        for (const k of [true, false, true, false]) session = reduce(session, { type: "key", key: "H", down: k, at: (at += 1000) }, hold).session;
        const left = session.capture.kind;
        expect(["idle", "armed"]).toContain(left);
      }),
      { numRuns: 300 },
    );
  });
});
