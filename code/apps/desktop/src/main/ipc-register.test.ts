import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { registerValidatedIpc } from "./ipc-register";

type Handle = (e: { sender: string }, ...args: unknown[]) => unknown;
function setup(trusted: (sender: string) => boolean) {
  const handlers = new Map<string, Handle>();
  const ipcMain = { handle: (ch: string, fn: Handle) => handlers.set(ch, fn) } as never;
  registerValidatedIpc<"add">(ipcMain, {
    methods: ["add"],
    channel: (m) => `t:${m}`,
    args: { add: v.tuple([v.number(), v.number()]) },
    handler: () => (a, b) => (a as number) + (b as number),
    trusted: (e) => trusted((e as unknown as { sender: string }).sender),
  });
  return (sender: string, ...args: unknown[]) => handlers.get("t:add")!({ sender }, ...args);
}

describe("registerValidatedIpc", () => {
  it("runs the handler with parsed arguments for a trusted sender", () => {
    expect(setup((s) => s === "main")("main", 2, 3)).toBe(5);
  });

  it("refuses an untrusted sender before looking at the arguments", () => {
    expect(() => setup((s) => s === "main")("page", 2, 3)).toThrow("Untrusted sender");
  });

  it("refuses arguments of the wrong shape", () => {
    expect(() => setup(() => true)("main", "2", 3)).toThrow("Invalid arguments for add");
  });
});
