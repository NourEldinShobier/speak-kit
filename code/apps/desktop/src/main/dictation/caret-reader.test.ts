import { describe, expect, it, vi } from "vite-plus/test";
import { createCaretReader, parseCaret, type LineProcess } from "./caret-reader";

function fakeProc() {
  let line: (l: string) => void = () => undefined;
  let exit: () => void = () => undefined;
  const sent: string[] = [];
  const state = { killed: 0 };
  const proc: LineProcess = {
    write: (l) => void sent.push(l),
    onLine: (fn) => void (line = fn),
    onExit: (fn) => void (exit = fn),
    kill: () => {
      state.killed++;
      exit();
    },
  };
  return { proc, sent, state, say: (l: string) => line(l), exit: () => exit() };
}

describe("parseCaret", () => {
  it.each([
    ["char:100", { before: "d", selected: false }],
    ["char:100\r", { before: "d", selected: false }],
    ["char:128512", { before: "\u{1F600}", selected: false }],
    ["selected", { before: "", selected: true }],
    ["start", { before: "", selected: false }],
    ["unreadable", undefined],
    ["", undefined],
    ["char:abc", undefined],
    ["char:55357", { before: "\u0000", selected: false }],
    ["char:99999999", undefined],
  ])("%j", (line, expected) => expect(parseCaret(line)).toEqual(expected));
});

describe("caret reader on Windows", () => {
  it("starts the helper once and answers each read from its reply", async () => {
    const f = fakeProc();
    const start = vi.fn(() => f.proc);
    const reader = createCaretReader({ platform: "win32", start, once: async () => "" });
    reader.warm();
    f.say("ready");
    const first = reader.read();
    f.say("char:100");
    expect(await first).toEqual({ before: "d", selected: false });
    const second = reader.read();
    f.say("selected");
    expect(await second).toEqual({ before: "", selected: true });
    expect(start).toHaveBeenCalledTimes(1);
    expect(f.sent).toEqual(["read", "read"]);
  });

  it("gives unreadable and drops a helper that does not answer in time", async () => {
    vi.useFakeTimers();
    const f = fakeProc();
    const reader = createCaretReader({ platform: "win32", start: () => f.proc, once: async () => "", timeoutMs: 600 });
    f.say("ready");
    const pending = reader.read();
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toBeUndefined();
    expect(f.state.killed).toBe(1);
    vi.useRealTimers();
  });

  it("answers a waiting read as unreadable when the helper dies", async () => {
    const f = fakeProc();
    const reader = createCaretReader({ platform: "win32", start: () => f.proc, once: async () => "" });
    const pending = reader.read();
    f.exit();
    expect(await pending).toBeUndefined();
  });

  it("starts a new helper after the old one exited", async () => {
    const procs = [fakeProc(), fakeProc()];
    const start = vi.fn(() => procs[start.mock.calls.length - 1]!.proc);
    const reader = createCaretReader({ platform: "win32", start, once: async () => "" });
    reader.warm();
    procs[0]!.exit();
    reader.warm();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("stops the helper on dispose", () => {
    const f = fakeProc();
    const reader = createCaretReader({ platform: "win32", start: () => f.proc, once: async () => "" });
    reader.warm();
    reader.dispose();
    expect(f.state.killed).toBe(1);
  });
});

describe("caret reader on macOS", () => {
  it("reads through the one-shot script", async () => {
    const once = vi.fn(async () => "char:46\n");
    const reader = createCaretReader({ platform: "darwin", start: () => fakeProc().proc, once });
    expect(await reader.read()).toEqual({ before: ".", selected: false });
    expect(once).toHaveBeenCalledOnce();
  });

  it("is unreadable when the script fails", async () => {
    const reader = createCaretReader({
      platform: "darwin",
      start: () => fakeProc().proc,
      once: async () => {
        throw new Error("not allowed");
      },
    });
    expect(await reader.read()).toBeUndefined();
  });
});

describe("caret reader elsewhere", () => {
  it("is not available", async () => {
    const reader = createCaretReader({ platform: "linux", start: () => fakeProc().proc, once: async () => "char:100" });
    expect(await reader.read()).toBeUndefined();
  });
});
