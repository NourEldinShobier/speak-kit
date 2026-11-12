import { describe, expect, it } from "vitest";
import { createEventLog, EVENT_KINDS, MAX_EVENTS } from ".";

function setup(o: { mode?: "events" | "off"; startedAt?: number | undefined } = {}) {
  const t = { now: 10_000, startedAt: "startedAt" in o ? o.startedAt : (4000 as number | undefined), mode: o.mode ?? ("events" as "events" | "off") };
  return { t, log: createEventLog({ now: () => t.now, startedAt: () => t.startedAt, mode: () => t.mode }) };
}

describe("input event log", () => {
  it("notes the kind and the time from the start of the recording", () => {
    const { t, log } = setup();
    log.add("ink-start");
    t.now = 12_500;
    log.add("ink-end");
    expect(log.take()).toEqual([
      { atMs: 6000, kind: "ink-start" },
      { atMs: 8500, kind: "ink-end" },
    ]);
  });

  it("notes nothing when the setting is off, and starts again when it is turned on", () => {
    const { t, log } = setup({ mode: "off" });
    log.add("pen-on");
    expect(log.take()).toEqual([]);
    t.mode = "events";
    log.add("pen-on");
    expect(log.take()).toHaveLength(1);
  });

  it("notes nothing when no recording is running", () => {
    const { log } = setup({ startedAt: undefined });
    log.add("ink-start");
    expect(log.take()).toEqual([]);
  });

  it("take empties the log, reset drops what was noted", () => {
    const { log } = setup();
    log.add("pen-on");
    expect(log.take()).toHaveLength(1);
    expect(log.take()).toEqual([]);
    log.add("pen-off");
    log.reset();
    expect(log.take()).toEqual([]);
  });

  it("never gives a negative time", () => {
    const { t, log } = setup();
    t.now = 3000;
    log.add("ink-start");
    expect(log.take()).toEqual([{ atMs: 0, kind: "ink-start" }]);
  });

  it("stops at the cap", () => {
    const { log } = setup();
    for (let i = 0; i < MAX_EVENTS + 50; i++) log.add("ink-start");
    expect(log.take()).toHaveLength(MAX_EVENTS);
  });

  it("can only hold kinds that carry no key names or text", () => {
    expect([...EVENT_KINDS]).toEqual(["ink-start", "ink-end", "pen-on", "pen-off", "target-switch"]);
    const { log } = setup();
    log.add("pen-on");
    expect(Object.keys(log.take()[0]!).sort()).toEqual(["atMs", "kind"]);
  });
});
