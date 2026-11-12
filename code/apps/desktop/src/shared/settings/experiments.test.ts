import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { groupExperiments, isExperimentOn, needsRestart, registerExperiment, toggled, visibleExperiments, type Experiment } from "./experiments";

const make = (over: Partial<Experiment> = {}): Experiment => ({ id: "x", title: "X", summary: "s", warning: "w", group: "G", audience: "everyone", graduation: "later", ...over });

describe("experiments", () => {
  it("every experiment is off by default", () => {
    const c = parseConfig({});
    expect(isExperimentOn(c, "caption-export", true)).toBe(false);
    expect(c.experiments).toEqual({});
  });

  it("a stored flag turns a registered experiment on, for developers only when dev-only", () => {
    const c = parseConfig({ experiments: { "caption-export": true } });
    expect(isExperimentOn(c, "caption-export", true)).toBe(true);
    expect(isExperimentOn(c, "caption-export", false)).toBe(false);
  });

  it("an unknown id is off even when stored", () => {
    expect(isExperimentOn(parseConfig({ experiments: { ghost: true } }), "ghost", true)).toBe(false);
  });

  it("registering twice or without a graduation path throws", () => {
    registerExperiment(make({ id: "reg-test" }));
    expect(() => registerExperiment(make({ id: "reg-test" }))).toThrow("already registered");
    expect(() => registerExperiment(make({ id: "no-grad", graduation: "  " }))).toThrow("graduation");
    expect(isExperimentOn(parseConfig({ experiments: { "reg-test": true } }), "reg-test")).toBe(true);
  });

  it("filters by audience and groups in order", () => {
    const list = [make({ id: "a", group: "One" }), make({ id: "b", group: "Two", audience: "dev" }), make({ id: "c", group: "One" })];
    expect(visibleExperiments(false, list).map((e) => e.id)).toEqual(["a", "c"]);
    expect(groupExperiments(visibleExperiments(true, list)).map((g) => [g.group, g.items.map((e) => e.id)])).toEqual([
      ["One", ["a", "c"]],
      ["Two", ["b"]],
    ]);
  });

  it("toggling returns a new object and turning off removes the key", () => {
    const before = { a: true };
    expect(toggled(before, "b", true)).toEqual({ a: true, b: true });
    expect(toggled(before, "a", false)).toEqual({});
    expect(before).toEqual({ a: true });
  });

  it("asks for a restart only when a flag that needs one changes", () => {
    const list = [make({ id: "r", needsRestart: true }), make({ id: "n" })];
    expect(needsRestart({}, { r: true }, list)).toBe(true);
    expect(needsRestart({ r: true }, {}, list)).toBe(true);
    expect(needsRestart({}, { n: true }, list)).toBe(false);
    expect(needsRestart({ r: true }, { r: true }, list)).toBe(false);
  });
});
