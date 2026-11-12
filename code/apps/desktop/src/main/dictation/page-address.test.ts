import { describe, expect, it, vi } from "vite-plus/test";
import type { LineProcess } from "./caret-reader";
import { createPageAddress, parseAddress } from "./page-address";
import type { ForegroundInfo } from "./types";

const fg = (exe: string | null): ForegroundInfo => ({ hwnd: "1", pid: 1, exe, className: "X", elevated: false });

function helper(answer: string) {
  const sent: string[] = [];
  let lines: (l: string) => void = () => undefined;
  const start = (): LineProcess => {
    queueMicrotask(() => lines("ready"));
    return {
      write: (line) => (sent.push(line), void queueMicrotask(() => lines(answer))),
      onLine: (fn) => void (lines = fn),
      onExit: () => undefined,
      kill: () => undefined,
    };
  };
  return { sent, start };
}

describe("page address", () => {
  it("reads the address of a browser in front through the helper", async () => {
    const h = helper("url:https://github.com/a");
    const a = createPageAddress({ platform: "win32", start: h.start, once: async () => "" });
    expect(await a.read(fg("chrome.exe"))).toBe("https://github.com/a");
    expect(await a.read(fg("firefox.exe"))).toBe("https://github.com/a");
    expect(h.sent).toEqual(["url", "url"]);
  });

  it("starts nothing and answers undefined for a program that is not a browser, or no window", async () => {
    const h = helper("url:https://x.org");
    const a = createPageAddress({ platform: "win32", start: h.start, once: async () => "" });
    expect(await a.read(fg("notepad.exe"))).toBeUndefined();
    expect(await a.read(fg(null))).toBeUndefined();
    expect(await a.read(null)).toBeUndefined();
    expect(h.sent).toEqual([]);
  });

  it("answers undefined when the bar cannot be found or the helper does not answer in time", async () => {
    expect(await createPageAddress({ platform: "win32", start: helper("none").start, once: async () => "" }).read(fg("msedge.exe"))).toBeUndefined();
    vi.useFakeTimers();
    const silent = createPageAddress({
      platform: "win32",
      start: () => ({ write: () => undefined, onLine: (fn) => void queueMicrotask(() => fn("ready")), onExit: () => undefined, kill: () => undefined }),
      once: async () => "",
      timeoutMs: 100,
    });
    const p = silent.read(fg("msedge.exe"));
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBeUndefined();
    vi.useRealTimers();
  });

  it("asks the browser through AppleScript on macOS, and gives nothing when the script fails or is slow", async () => {
    const ran: string[] = [];
    const a = createPageAddress({ platform: "darwin", start: helper("").start, once: async (s) => (ran.push(s), "url:https://github.com/x\n") });
    expect(await a.read(fg("com.google.Chrome"))).toBe("https://github.com/x");
    expect(await a.read(fg("com.apple.Safari"))).toBe("https://github.com/x");
    expect(ran[0]).toContain('"Google Chrome"');
    expect(ran[0]).toContain("URL of front document");
    const broken = createPageAddress({ platform: "darwin", start: helper("").start, once: async () => Promise.reject(new Error("not allowed")) });
    expect(await broken.read(fg("com.google.Chrome"))).toBeUndefined();
  });

  it("takes the text after url: and nothing for an empty address", () => {
    expect(parseAddress("url:https://a.com/x?y=1")).toBe("https://a.com/x?y=1");
    expect(parseAddress("url:")).toBeUndefined();
    expect(parseAddress("none")).toBeUndefined();
  });
});
