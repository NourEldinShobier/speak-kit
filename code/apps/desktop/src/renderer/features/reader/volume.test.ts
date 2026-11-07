import { describe, expect, it } from "vite-plus/test";
import { routeThroughGain } from "./volume";

describe("routeThroughGain", () => {
  it("feeds the speakers from a gain node set to the volume, and hands that node out as the destination", () => {
    const speakers = { name: "speakers" };
    const connected: unknown[] = [];
    const node = { gain: { value: 1 }, connect: (to: unknown) => void connected.push(to) };
    const ctx = { destination: speakers as unknown, createGain: () => node };
    const gain = routeThroughGain(ctx, 0.4);
    expect(gain.gain.value).toBe(0.4);
    expect(connected).toEqual([speakers]);
    expect(ctx.destination).toBe(node);
  });
});
