import { describe, expect, it, vi } from "vitest";
import { createAgentContext } from ".";

const nodes = [
  { role: "ControlType.Button", name: "Save", depth: 1 },
  { role: "ControlType.Edit", name: "Password", secure: true, depth: 1 },
];

describe("agent context text", () => {
  it("is the labels of the window in front, without password fields", async () => {
    const read = vi.fn(async () => nodes);
    expect(await createAgentContext({ enabled: () => true, reader: { read }, os: "win32", pid: 7 })("window:55:0")).toBe("button: Save");
    expect(read).toHaveBeenCalledWith({ windowHandle: "55", ownPid: 7 });
  });

  it("is off by default: the system is not asked", async () => {
    const read = vi.fn(async () => nodes);
    expect(await createAgentContext({ enabled: () => false, reader: { read }, os: "win32" })()).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("has no text when the system would not say or there is nothing readable", async () => {
    expect(await createAgentContext({ enabled: () => true, reader: { read: async () => undefined }, os: "win32" })()).toBeUndefined();
    expect(await createAgentContext({ enabled: () => true, reader: { read: async () => [{ role: "ControlType.Text", name: "private", depth: 0 }] }, os: "win32" })()).toBeUndefined();
  });

  it("has no text where there is no reader", async () => {
    expect(await createAgentContext({ enabled: () => true, reader: undefined, os: "linux" })()).toBeUndefined();
  });

  it("reads the setting each time, so turning it off takes effect for the next capture", async () => {
    let on = true;
    const ctx = createAgentContext({ enabled: () => on, reader: { read: async () => nodes }, os: "win32" });
    expect(await ctx()).toBe("button: Save");
    on = false;
    expect(await ctx()).toBeUndefined();
  });
});
