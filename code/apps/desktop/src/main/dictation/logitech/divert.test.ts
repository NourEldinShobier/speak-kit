import { describe, expect, it } from "vite-plus/test";
import { diffPressed, learnable, learnDiverts, planDiverts } from "./divert";
import type { Control } from "./hidpp";

const controls: Control[] = [
  { cid: 0x50, divertable: true },
  { cid: 0x51, divertable: true },
  { cid: 0x52, divertable: true },
  { cid: 0xc3, divertable: true },
  { cid: 0xd7, divertable: true },
  { cid: 0x99, divertable: false },
];
const flags = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

describe("divert planning", () => {
  it("diverts a wanted button nobody has diverted", () => {
    expect(planDiverts({ controls, wanted: new Set([0xd7]), owned: new Set(), flags: flags({ 0xd7: 0 }) })).toEqual({ divert: [0xd7], undivert: [] });
  });

  it("leaves a button another program diverted", () => {
    expect(planDiverts({ controls, wanted: new Set([0xc3]), owned: new Set(), flags: flags({ 0xc3: 0x01 }) })).toEqual({ divert: [], undivert: [] });
    expect(planDiverts({ controls, wanted: new Set([0xc3]), owned: new Set(), flags: flags({ 0xc3: 0x04 }) })).toEqual({ divert: [], undivert: [] });
  });

  it("never diverts left or right click, and skips what cannot be diverted or is not on the device", () => {
    const wanted = new Set([0x50, 0x51, 0x99, 0x777]);
    expect(planDiverts({ controls, wanted, owned: new Set(), flags: flags({ 0x50: 0, 0x51: 0, 0x99: 0, 0x777: 0 }) })).toEqual({ divert: [], undivert: [] });
  });

  it("releases a button it diverted that is no longer wanted", () => {
    expect(planDiverts({ controls, wanted: new Set([0xd7]), owned: new Set([0xd7, 0x52]), flags: flags({ 0xd7: 1, 0x52: 1 }) })).toEqual({ divert: [], undivert: [0x52] });
  });

  it("diverts again a button of ours that the mouse reset", () => {
    expect(planDiverts({ controls, wanted: new Set([0xd7]), owned: new Set([0xd7]), flags: flags({ 0xd7: 0 }) })).toEqual({ divert: [0xd7], undivert: [] });
  });

  it("does not touch a button whose reporting could not be read", () => {
    expect(planDiverts({ controls, wanted: new Set([0xd7]), owned: new Set(), flags: new Map() })).toEqual({ divert: [], undivert: [] });
  });
});

describe("learning", () => {
  it("diverts every usable button that is free, not left, right, undivertable or taken", () => {
    const f = flags({ 0x50: 0, 0x51: 0, 0x52: 0, 0xc3: 0x01, 0xd7: 0, 0x99: 0 });
    expect(learnDiverts(controls, f)).toEqual([0x52, 0xd7]);
  });

  it("listens to every usable button, also the ones another program diverted", () => {
    expect([...learnable(controls)]).toEqual([0x52, 0xc3, 0xd7]);
  });
});

describe("press and release", () => {
  it("compares two lists of held buttons", () => {
    expect(diffPressed(new Set(), new Set([0xc3]))).toEqual({ down: [0xc3], up: [] });
    expect(diffPressed(new Set([0xc3, 0x52]), new Set([0x52]))).toEqual({ down: [], up: [0xc3] });
    expect(diffPressed(new Set([0x52]), new Set([0x52]))).toEqual({ down: [], up: [] });
  });
});
