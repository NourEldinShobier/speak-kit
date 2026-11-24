import { describe, expect, it, vi } from "vite-plus/test";
import { createCaretReader, parseCaret, parseValue, type LineProcess } from "./caret-reader";

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

describe("parseValue", () => {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  it("reads the Windows helper's encoded text, accents and line breaks included", () => {
    expect(parseValue(`value:${b64("Café\nnaïve")}`, "win32")).toEqual({ text: "Café\nnaïve" });
    expect(parseValue("value:", "win32")).toEqual({ text: "" });
  });
  it("reads the macOS text as it is, without the line break osascript adds", () => {
    expect(parseValue("value:two\nlines\n", "darwin")).toEqual({ text: "two\nlines" });
  });
  it("tells a password field apart from a field that cannot be read", () => {
    expect(parseValue("password", "win32")).toEqual({ password: true });
    expect(parseValue("password\n", "darwin")).toEqual({ password: true });
  });
  it.each(["unreadable", "", "char:100"])("gives nothing for %j", (line) => expect(parseValue(line, "win32")).toBeUndefined());
});

describe("caret reader on Windows", () => {
  it("asks for the whole field with its own command and takes the text, and a password field gives nothing", async () => {
    const f = fakeProc();
    const reader = createCaretReader({ platform: "win32", start: () => f.proc, once: async () => "" });
    reader.warm();
    f.say("ready");
    const field = reader.readValue();
    f.say(`value:${Buffer.from("hello there").toString("base64")}`);
    expect(await field).toEqual({ text: "hello there" });
    const secret = reader.readValue();
    f.say("password");
    expect(await secret).toEqual({ password: true });
    expect(f.sent).toEqual(["value", "value"]);
  });

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

  it("reads a field's text through its own script and refuses a secure field", async () => {
    const answers = ["value:abc def\n", "password\n"];
    const reader = createCaretReader({ platform: "darwin", start: () => fakeProc().proc, once: async () => answers.shift() ?? "" });
    expect(await reader.readValue()).toEqual({ text: "abc def" });
    expect(await reader.readValue()).toEqual({ password: true });
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
