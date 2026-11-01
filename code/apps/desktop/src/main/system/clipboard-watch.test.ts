import { describe, expect, it } from "vite-plus/test";
import { ClipboardWatcher, worthPrompting } from "./clipboard-watch";

const PROSE = "The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant hills and everyone goes home.";

describe("worthPrompting", () => {
  it("accepts prose and rejects short text, passwords, URLs and long single tokens", () => {
    expect(worthPrompting(PROSE)).toBe(true);
    expect(worthPrompting("short note")).toBe(false);
    expect(worthPrompting("p4$$w0rd-" + "x".repeat(150))).toBe(false);
    expect(worthPrompting("https://example.com/" + "a".repeat(150))).toBe(false);
  });
});

describe("ClipboardWatcher", () => {
  function setup() {
    let text = "already here, not copied now " + PROSE;
    let priv = false;
    const prompts: string[] = [];
    const w = new ClipboardWatcher({ text: () => text, isPrivate: () => priv, onCopy: (t) => prompts.push(t) });
    return { w, prompts, set: (t: string) => (text = t), setPrivate: (p: boolean) => (priv = p) };
  }

  it("prompts for a new long copy once, not for what was already on the clipboard", () => {
    const s = setup();
    s.w.start();
    s.w.tick();
    expect(s.prompts).toEqual([]);
    s.set(PROSE);
    s.w.tick();
    s.w.tick();
    expect(s.prompts).toEqual([PROSE]);
    s.w.stop();
  });

  it("skips password-manager copies and short copies", () => {
    const s = setup();
    s.w.start();
    s.setPrivate(true);
    s.set(PROSE + " from a vault");
    s.w.tick();
    s.setPrivate(false);
    s.set("tiny");
    s.w.tick();
    expect(s.prompts).toEqual([]);
    s.w.stop();
    expect(s.w.running).toBe(false);
  });
});
