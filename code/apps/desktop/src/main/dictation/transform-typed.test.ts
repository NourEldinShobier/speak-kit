import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DICTATION } from "../../shared/dictation/settings";
import { transformTyped, typedTextRules, type TransformDeps } from "./transform-typed";
import type { ForegroundInfo, InsertResult } from "./types";

const win = (extra: Partial<ForegroundInfo> = {}): ForegroundInfo => ({ hwnd: "w1", pid: 1, exe: "notepad.exe", className: "Edit", elevated: false, ...extra });

/** An unset window is a normal notepad; null is no window at all. */
const pick = (w: ForegroundInfo | null | undefined): ForegroundInfo | null => (w === undefined ? win() : w);

function rig(
  o: { hasSelection?: boolean | undefined; copies?: string[]; fg?: ForegroundInfo | null; password?: boolean; secure?: boolean; insert?: InsertResult; fgAfter?: ForegroundInfo | null } = {},
) {
  const log: string[] = [];
  const copies = [...(o.copies ?? [])];
  let reads = 0;
  const deps: TransformDeps = {
    foreground: () => pick(reads++ === 0 ? o.fg : o.fgAfter),
    passwordFocused: () => o.password ?? false,
    secureInput: () => o.secure ?? false,
    ...("hasSelection" in o && { hasSelection: async () => o.hasSelection }),
    selectAll: async () => void log.push("select-all"),
    copy: async () => {
      log.push("copy");
      return copies.shift() ?? "";
    },
    insert: async (text, options) => {
      log.push(`insert:${text}:${options.target}:${options.mode}`);
      return o.insert ?? { status: "pasted" };
    },
    clean: (t) => t.replace(/\bum /g, ""),
    sleep: async () => undefined,
  };
  return { deps, log };
}

describe("transformTyped", () => {
  it("cleans the existing selection without selecting everything", async () => {
    const r = rig({ copies: ["um hello", "um hello"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "changed" });
    expect(r.log).toEqual(["copy", "copy", "insert:hello:w1:paste"]);
  });

  it("selects the whole field when nothing was selected", async () => {
    const r = rig({ copies: ["", "um hello", "um hello"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "changed" });
    expect(r.log).toEqual(["copy", "select-all", "copy", "copy", "insert:hello:w1:paste"]);
  });

  it("selects the whole field before the first copy when the caret has no selection, so an editor that copies the line is not trusted", async () => {
    const r = rig({ hasSelection: false, copies: ["um whole field", "um whole field"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "changed" });
    expect(r.log).toEqual(["select-all", "copy", "copy", "insert:whole field:w1:paste"]);
  });

  it("copies the selection directly when the reader says text is selected, and falls back to the old order when it cannot tell", async () => {
    const a = rig({ hasSelection: true, copies: ["um a", "um a"] });
    await transformTyped(a.deps);
    expect(a.log).toEqual(["copy", "copy", "insert:a:w1:paste"]);
    const b = rig({ hasSelection: undefined, copies: ["", "um b", "um b"] });
    await transformTyped(b.deps);
    expect(b.log).toEqual(["copy", "select-all", "copy", "copy", "insert:b:w1:paste"]);
  });

  it("does not write anything when the cleaned text is empty, so the field is not wiped", async () => {
    const r = rig({ copies: ["um ", "um "] });
    expect(await transformTyped(r.deps)).toEqual({ status: "failed", reason: "nothing-left" });
    expect(r.log.some((l) => l.startsWith("insert"))).toBe(false);
  });

  it("leaves a very long field alone and cleans one just under the limit", async () => {
    const big = "um ".repeat(16_667);
    const r = rig({ copies: [big, big] });
    expect(await transformTyped(r.deps)).toEqual({ status: "failed", reason: "too-long" });
    const ok = "um hi ".repeat(8_333) + "x".repeat(2);
    const r2 = rig({ copies: [ok, ok] });
    expect((await transformTyped(r2.deps)).status).toBe("changed");
  });

  it("says nothing is selected when the field is empty", async () => {
    const r = rig({ copies: ["", ""] });
    expect(await transformTyped(r.deps)).toEqual({ status: "nothing-selected" });
    expect(r.log.some((l) => l.startsWith("insert"))).toBe(false);
  });

  it("writes nothing when the second copy differs from the first", async () => {
    const r = rig({ copies: ["um hello", "um hello wor"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "failed", reason: "copy-unstable" });
    expect(r.log.some((l) => l.startsWith("insert"))).toBe(false);
  });

  it("writes nothing when the rules change nothing", async () => {
    const r = rig({ copies: ["Hello.", "Hello."] });
    expect(await transformTyped(r.deps)).toEqual({ status: "unchanged" });
    expect(r.log).toEqual(["copy", "copy"]);
  });

  it("does not touch a password field", async () => {
    const r = rig({ password: true, copies: ["x"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "blocked", reason: "password-field" });
    expect(r.log).toEqual([]);
  });

  it.each([
    ["Windows Terminal", win({ exe: "WindowsTerminal.exe" })],
    ["a macOS terminal", win({ exe: "com.apple.Terminal" })],
  ])("does not touch %s", async (_n, fg) => {
    const r = rig({ fg, copies: ["x"] });
    expect(await transformTyped(r.deps)).toEqual({ status: "blocked", reason: "terminal" });
    expect(r.log).toEqual([]);
  });

  it("does not touch a window with higher rights, secure input or no window", async () => {
    expect(await transformTyped(rig({ fg: win({ elevated: true }) }).deps)).toEqual({ status: "blocked", reason: "elevated" });
    expect(await transformTyped(rig({ secure: true }).deps)).toEqual({ status: "blocked", reason: "secure-input" });
    expect(await transformTyped(rig({ fg: null }).deps)).toEqual({ status: "blocked", reason: "no-window" });
  });

  it("does not paste into another window when focus moved during the read", async () => {
    const r = rig({ copies: ["um hello", "um hello"], fgAfter: win({ hwnd: "w2" }) });
    expect(await transformTyped(r.deps)).toEqual({ status: "failed", reason: "window-changed" });
    expect(r.log.some((l) => l.startsWith("insert"))).toBe(false);
  });

  it("reports a paste the system did not take", async () => {
    const r = rig({ copies: ["um hello", "um hello"], insert: { status: "copied", reason: "keys-rejected" } });
    expect(await transformTyped(r.deps)).toEqual({ status: "failed", reason: "not-inserted" });
  });
});

describe("typedTextRules", () => {
  const rules = (over: Partial<Parameters<typeof typedTextRules>[0]> = {}) => typedTextRules({ ...DEFAULT_DICTATION, language: "en", ...over });

  it("removes fillers and capitalizes, with no trailing space", () => {
    expect(rules()("um so i went home")).toBe("So i went home");
  });

  it("applies replacements", () => {
    expect(rules({ replacements: [{ from: "tmrw", to: "tomorrow" }] })("see you tmrw")).toBe("See you tomorrow");
  });

  it("leaves a spoken symbol word as typed", () => {
    expect(rules()("the word comma here")).toBe("The word comma here");
  });
});
