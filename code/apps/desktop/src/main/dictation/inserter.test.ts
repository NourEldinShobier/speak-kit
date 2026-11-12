import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createInserter } from "./inserter";
import type { ClipboardPort } from "./restore-guard";
import type { AppOverride, ForegroundInfo, InputPort } from "./types";

const notepad: ForegroundInfo = { hwnd: "100", pid: 1, exe: "notepad.exe", className: "Notepad", elevated: false };

function setup(
  opts: {
    fg?: ForegroundInfo | null;
    overrides?: AppOverride[];
    held?: string[][];
    password?: boolean;
    accept?: boolean;
    failWrite?: boolean;
    restorable?: boolean;
    onSleep?: () => void;
    onType?: () => void;
    onTyping?: (on: boolean) => void;
  } = {},
) {
  let content: string | null = "old";
  let seq = 1;
  const clip: ClipboardPort = {
    snapshot: async () => (content === null ? [] : [content]),
    writeText: async (t) => {
      if (opts.failWrite) throw new Error("busy");
      content = t;
      seq++;
    },
    restore: async (s) => {
      content = (s as string[])[0] ?? null;
      seq++;
    },
    sequence: () => seq,
    ...(opts.restorable !== undefined && { restorable: async () => opts.restorable! }),
  };
  const sent: string[] = [];
  const held = [...(opts.held ?? [])];
  let fg: ForegroundInfo | null = opts.fg === undefined ? notepad : opts.fg;
  const input: InputPort = {
    foreground: () => fg,
    passwordFocused: () => opts.password ?? false,
    heldModifiers: () => held.shift() ?? [],
    pressPaste: (key) => {
      sent.push(`${key.replaceAll("-", "+")} while clipboard=${content}`);
      return opts.accept ?? true;
    },
    type: async (text, stopped) => {
      sent.push(`type ${text}`);
      opts.onType?.();
      if (stopped?.()) return "stopped";
      return (opts.accept ?? true) ? "done" : "rejected";
    },
    clipboardSequence: () => seq,
    clipboardTraits: () => ({ files: false, formats: 0, marks: [] }),
    markClipboard: async () => true,
    focus: async () => true,
  };
  const slept: number[] = [];
  const ins = createInserter({
    input,
    clip,
    overrides: opts.overrides,
    onTyping: opts.onTyping,
    sleep: async (ms) => {
      slept.push(ms);
      opts.onSleep?.();
    },
  });
  return {
    ins,
    sent,
    slept,
    setForeground: (f: ForegroundInfo | null) => (fg = f),
    get clipboard() {
      return content;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("pasting", () => {
  it("sends Ctrl+V with the text on the clipboard, then puts the old clipboard back after 500 ms", async () => {
    const t = setup();
    expect(await t.ins.insert("hello")).toEqual({ status: "pasted" });
    expect(t.sent).toEqual(["ctrl+v while clipboard=hello"]);
    expect(t.clipboard).toBe("hello");
    await vi.advanceTimersByTimeAsync(500);
    expect(t.clipboard).toBe("old");
  });

  it("uses Ctrl+Shift+V in a terminal and plain Ctrl+V in a Java program", async () => {
    const term = setup({ fg: { ...notepad, exe: "WindowsTerminal.exe" } });
    await term.ins.insert("x");
    expect(term.sent).toEqual(["ctrl+shift+v while clipboard=x"]);
    const java = setup({ fg: { ...notepad, exe: "javaw.exe" } });
    await java.ins.insert("x");
    expect(java.sent).toEqual(["ctrl+v while clipboard=x"]);
  });

  it("gives a remote desktop client 400 ms before the keys and 3 s before the restore", async () => {
    const t = setup({ fg: { ...notepad, exe: "mstsc.exe" } });
    await t.ins.insert("x");
    expect(t.slept).toEqual([400]);
    await vi.advanceTimersByTimeAsync(2999);
    expect(t.clipboard).toBe("x");
    await vi.advanceTimersByTimeAsync(1);
    expect(t.clipboard).toBe("old");
  });

  it("waits until Shift, Alt and Win are released before pressing", async () => {
    const t = setup({ held: [["shift"], ["shift", "alt"], ["alt"]] });
    expect(await t.ins.insert("x")).toEqual({ status: "pasted" });
    expect(t.slept).toEqual([10, 10, 10]);
    expect(t.sent).toHaveLength(1);
  });

  it("copies instead when a modifier is still held after 1.5 s", async () => {
    const t = setup({ held: Array.from({ length: 400 }, () => ["win"]) });
    expect(await t.ins.insert("x")).toEqual({ status: "copied", reason: "modifiers-held" });
    expect(t.sent).toEqual([]);
    expect(t.clipboard).toBe("x");
  });

  it("keep mode leaves the text on the clipboard", async () => {
    const t = setup();
    expect(await t.ins.insert("x", { mode: "keep" })).toEqual({ status: "pasted" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.clipboard).toBe("x");
  });

  it("types instead of pasting when the clipboard holds something that cannot be put back, and leaves it alone", async () => {
    const t = setup({ restorable: false });
    expect(await t.ins.insert("héllo")).toEqual({ status: "typed" });
    expect(t.sent).toEqual(["type héllo"]);
    expect(t.clipboard).toBe("old");
  });

  it("keep mode pastes even then, because the text is meant to replace the clipboard", async () => {
    const t = setup({ restorable: false });
    expect(await t.ins.insert("x", { mode: "keep" })).toEqual({ status: "pasted" });
    expect(t.clipboard).toBe("x");
  });

  it("pastes two dictations in order and ends with the original clipboard", async () => {
    const t = setup();
    const a = t.ins.insert("first");
    const b = t.ins.insert("second");
    await Promise.all([a, b]);
    expect(t.sent).toEqual(["ctrl+v while clipboard=first", "ctrl+v while clipboard=second"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.clipboard).toBe("old");
  });
});

describe("when the paste cannot be trusted", () => {
  it("copy mode and a copy rule only copy", async () => {
    const t = setup();
    expect(await t.ins.insert("x", { mode: "copy" })).toEqual({ status: "copied", reason: "copy-only" });
    const rule = setup({ overrides: [{ exe: "notepad", profile: { shortcut: "copy" } }] });
    expect(await rule.ins.insert("x")).toEqual({ status: "copied", reason: "copy-only" });
    expect([...t.sent, ...rule.sent]).toEqual([]);
    expect(t.clipboard).toBe("x");
  });

  it("copies when the foreground window is not the one the key was pressed in", async () => {
    const t = setup();
    expect(await t.ins.insert("x", { target: "999" })).toEqual({ status: "copied", reason: "foreground-changed" });
    expect(t.sent).toEqual([]);
    expect(t.clipboard).toBe("x");
  });

  it("copies when the window changes during the wait before the keys", async () => {
    const remote = { ...notepad, exe: "mstsc.exe" };
    let t!: ReturnType<typeof setup>;
    t = setup({ fg: remote, onSleep: () => t.setForeground({ ...remote, hwnd: "200" }) });
    expect(await t.ins.insert("x", { target: "100" })).toEqual({ status: "copied", reason: "foreground-changed" });
    expect(t.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.clipboard).toBe("x");
  });

  it("copies and sends no keys to a window with higher rights", async () => {
    const t = setup({ fg: { ...notepad, elevated: true } });
    expect(await t.ins.insert("x")).toEqual({ status: "copied", reason: "elevated-target" });
    expect(t.sent).toEqual([]);
    expect(t.clipboard).toBe("x");
  });

  it("copies when the system refuses the keys, and keeps the text there", async () => {
    const t = setup({ accept: false });
    expect(await t.ins.insert("x")).toEqual({ status: "copied", reason: "keys-rejected" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.clipboard).toBe("x");
  });

  it("copies when there is no foreground window", async () => {
    const t = setup({ fg: null });
    expect(await t.ins.insert("x")).toEqual({ status: "copied", reason: "no-foreground" });
  });

  it("refuses a password field: no keys, nothing on the clipboard", async () => {
    const t = setup({ password: true });
    expect(await t.ins.insert("secret words")).toEqual({ status: "refused", reason: "password-field" });
    expect(t.sent).toEqual([]);
    expect(t.clipboard).toBe("old");
  });

  it("reports a clipboard that cannot be written", async () => {
    const t = setup({ failWrite: true });
    expect(await t.ins.insert("x")).toEqual({ status: "failed", reason: "clipboard-unavailable" });
    expect(await t.ins.insert("x", { mode: "copy" })).toEqual({ status: "failed", reason: "clipboard-unavailable" });
    expect(t.sent).toEqual([]);
  });
});

describe("unsupported platform", () => {
  it("only copies, with its own reason", async () => {
    const clip = { snapshot: async () => [], writeText: async (t: string) => void (written = t), restore: async () => {}, sequence: () => 0 };
    let written = "";
    const input = {
      foreground: () => null,
      passwordFocused: () => false,
      heldModifiers: () => [],
      pressPaste: () => false,
      type: async () => "rejected" as const,
      clipboardSequence: () => 0,
      clipboardTraits: () => ({ files: false, formats: 0, marks: [] }),
      markClipboard: async () => false,
      focus: async () => false,
    };
    const ins = createInserter({ input, clip, supported: false });
    expect(await ins.insert("x")).toEqual({ status: "copied", reason: "unsupported-platform" });
    expect(written).toBe("x");
  });
});

describe("typing rule", () => {
  const rule: AppOverride[] = [{ exe: "notepad", profile: { shortcut: "type" } }];

  it("types the text and never touches the clipboard", async () => {
    const t = setup({ overrides: rule });
    expect(await t.ins.insert("héllo")).toEqual({ status: "typed" });
    expect(t.sent).toEqual(["type héllo"]);
    expect(t.clipboard).toBe("old");
  });

  it("types when the caller asks for it, in a program with no typing rule", async () => {
    const t = setup();
    expect(await t.ins.insert("héllo", { mode: "type" })).toEqual({ status: "typed" });
    expect(t.sent).toEqual(["type héllo"]);
    expect(t.clipboard).toBe("old");
  });

  it("leaves the whole text on the clipboard when typing is stopped, and the next typing is not stopped", async () => {
    let t!: ReturnType<typeof setup>;
    let stop = true;
    t = setup({ overrides: rule, onType: () => stop && t.ins.cancelTyping() });
    expect(await t.ins.insert("long text")).toEqual({ status: "copied", reason: "typing-stopped" });
    expect(t.clipboard).toBe("long text");
    stop = false;
    expect(await t.ins.insert("again")).toEqual({ status: "typed" });
  });

  it("stops typing when the stop request came while the clipboard was being staged or the delay ran", async () => {
    let t!: ReturnType<typeof setup>;
    t = setup({ overrides: [{ exe: "notepad", profile: { shortcut: "type", preDelayMs: 30 } }], onSleep: () => t.ins.cancelTyping() });
    expect(await t.ins.insert("long text")).toEqual({ status: "copied", reason: "typing-stopped" });
    expect(t.clipboard).toBe("long text");
  });

  it("reports when typing starts and ends, also when the typing throws, and not for a paste", async () => {
    const seen: boolean[] = [];
    const t = setup({ overrides: rule, onTyping: (on) => seen.push(on) });
    await t.ins.insert("x");
    await setup({ onTyping: (on) => seen.push(on) }).ins.insert("pasted");
    expect(seen).toEqual([true, false]);
  });

  it("ignores a stop request when nothing is being typed", async () => {
    const t = setup({ overrides: rule });
    t.ins.cancelTyping();
    expect(await t.ins.insert("x")).toEqual({ status: "typed" });
  });

  it("copies the text when typing is refused", async () => {
    const t = setup({ overrides: rule, accept: false });
    expect(await t.ins.insert("x")).toEqual({ status: "copied", reason: "keys-rejected" });
    expect(t.clipboard).toBe("x");
  });
});
