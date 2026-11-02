import { describe, expect, it } from "vite-plus/test";
import type { EngineInfo, EngineList } from "@speakkit/protocol";
import { enginesReducer, initEngines, pollMs, type EnginesAction } from "./model";

const engine = (over: Partial<EngineInfo> = {}): EngineInfo => ({ id: "kokoro", name: "Kokoro-82M", state: "ready", optional: false, cloning: false, ...over }) as EngineInfo;
const list = (...engines: EngineInfo[]): EngineList => ({ active: "kokoro", engines });
const run = (...actions: EnginesAction[]) => actions.reduce(enginesReducer, initEngines());

describe("enginesReducer", () => {
  it("starts without a list, error, removal or busy action", () => {
    expect(initEngines()).toEqual({ list: null, error: null, removing: null, busy: null });
  });

  it("a failed refresh drops the list and shows the error; the next answer clears it", () => {
    const l = list(engine());
    const failed = run({ type: "list", list: l }, { type: "list-failed", message: "offline" });
    expect(failed).toMatchObject({ list: null, error: "offline" });
    expect(enginesReducer(failed, { type: "list", list: l })).toMatchObject({ list: l, error: null });
  });

  it("a finished action keeps the list unless it returns a new one, and clears the error", () => {
    const a = list(engine());
    const b = list(engine({ state: "unloaded" }));
    const s = run({ type: "list", list: a }, { type: "action-failed", message: "boom" }, { type: "action-done" });
    expect(s).toMatchObject({ list: a, error: null });
    expect(enginesReducer(s, { type: "action-done", list: b }).list).toBe(b);
  });

  it("marks one action busy and clears it", () => {
    expect(run({ type: "busy", key: "kokoro:load" }).busy).toBe("kokoro:load");
    expect(run({ type: "busy", key: "kokoro:load" }, { type: "busy", key: null }).busy).toBeNull();
  });

  it("asks before removing and can cancel", () => {
    const e = engine({ id: "chatterbox", optional: true });
    expect(run({ type: "ask-remove", engine: e }).removing).toBe(e);
    expect(run({ type: "ask-remove", engine: e }, { type: "cancel-remove" }).removing).toBeNull();
  });
});

describe("pollMs", () => {
  it.each([
    [null, 5000],
    [list(engine()), 5000],
    [list(engine({ state: "downloading" })), 1000],
    [list(engine(), engine({ id: "chatterbox", state: "installing" })), 1000],
    [list(engine({ state: "loading" })), 1000],
  ] as const)("polls every %#th case at %i ms", (l, ms) => {
    expect(pollMs(l)).toBe(ms);
  });
});
