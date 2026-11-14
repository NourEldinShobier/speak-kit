import { describe, expect, it } from "vite-plus/test";
import type { CaptureConfig } from "../../../shared/capture/settings";
import { createCaptureContext } from "./combined";

const config = (agentContext: boolean, pageContext: boolean) => ({ experiments: { agentContext, pageContext } }) as CaptureConfig;
const click = { type: "click" as const, at: 4000, page: "http://localhost:3000/", element: { tag: "button", label: "Save" } };

describe("capture context", () => {
  it("is nothing while both experiments are off, and asks the server for nothing", async () => {
    let asked = 0;
    const ctx = createCaptureContext({ settings: () => config(false, false), os: "win32", pageEvents: async () => (asked++, [click]) });
    expect(await ctx("window:1", { from: 0, to: 10_000 })).toBeUndefined();
    expect(asked).toBe(0);
  });

  it("holds the page events when that experiment is on", async () => {
    const ctx = createCaptureContext({ settings: () => config(false, true), os: "win32", pageEvents: async () => [click] });
    expect(await ctx(undefined, { from: 1000, to: 10_000 })).toBe('Page events from http://localhost:3000/\n0:03 click button "Save"');
  });
});
