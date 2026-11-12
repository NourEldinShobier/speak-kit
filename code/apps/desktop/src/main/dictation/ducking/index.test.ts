import { describe, expect, it } from "vite-plus/test";
import type { DuckMode } from "@speakkit/dictation";
import type { LineProcess } from "../caret-reader";
import { createSystemDucker } from "./index";

/** A helper process standing in for the Windows script: a volume that commands change, a device name and a media player. */
function fakeHelper(o: { name?: string; playing?: boolean } = {}) {
  const state = { volume: 0.8, muted: false, name: o.name ?? "Speakers (Realtek)", peak: o.playing ? 0.5 : 0 };
  const sent: string[] = [];
  let lines: (l: string) => void = () => undefined;
  let started = 0;
  const start = (): LineProcess => {
    started++;
    queueMicrotask(() => lines("ready"));
    return {
      write(line) {
        sent.push(line);
        const [c, arg] = line.split(" ");
        const answers: Record<string, () => string> = {
          volume: () => String(state.volume),
          setvolume: () => ((state.volume = Number(arg)), "ok"),
          muted: () => (state.muted ? "1" : "0"),
          setmuted: () => ((state.muted = arg === "1"), "ok"),
          peak: () => String(state.peak),
          name: () => state.name,
          playpause: () => ((state.peak = state.peak ? 0 : 0.5), "ok"),
        };
        queueMicrotask(() => lines(answers[c!]?.() ?? "error"));
      },
      onLine: (fn) => void (lines = fn),
      onExit: () => undefined,
      kill: () => undefined,
    };
  };
  return { state, sent, start, started: () => started };
}

function rig(mode: DuckMode, o: { name?: string; playing?: boolean; speakersOnly?: boolean } = {}) {
  const h = fakeHelper(o);
  const ducker = createSystemDucker({ mode: () => mode, speakersOnly: () => o.speakersOnly ?? true, platform: "win32", start: h.start });
  return { h, ducker };
}

describe("system ducker (Windows)", () => {
  it("starts no helper at all while the setting is Do nothing", async () => {
    const { h, ducker } = rig("nothing");
    await ducker.begin();
    await ducker.end();
    expect(h.started()).toBe(0);
  });

  it("lowers the volume for the recording and puts it back to where it was", async () => {
    const { h, ducker } = rig("lower");
    await ducker.begin();
    expect(h.state.volume).toBeCloseTo(0.2, 3);
    await ducker.end();
    expect(h.state.volume).toBeCloseTo(0.8, 3);
  });

  it("mutes and unmutes, and leaves an already muted output muted", async () => {
    const a = rig("mute");
    await a.ducker.begin();
    expect(a.h.state.muted).toBe(true);
    await a.ducker.end();
    expect(a.h.state.muted).toBe(false);
    const b = rig("mute");
    b.h.state.muted = true;
    await b.ducker.begin();
    await b.ducker.end();
    expect(b.h.state.muted).toBe(true);
    expect(b.h.sent.filter((l) => l.startsWith("setmuted"))).toEqual([]);
  });

  it("pauses what is playing and resumes it, and presses nothing when nothing plays", async () => {
    const a = rig("pause", { playing: true });
    await a.ducker.begin();
    expect(a.h.state.peak).toBe(0);
    await a.ducker.end();
    expect(a.h.state.peak).toBe(0.5);
    const b = rig("pause", { playing: false });
    await b.ducker.begin();
    await b.ducker.end();
    expect(b.h.sent.filter((l) => l === "playpause")).toEqual([]);
  });

  it("leaves audio alone for headphones, and ducks them anyway when speakers only is off", async () => {
    const a = rig("lower", { name: "Headphones (Hands-Free)" });
    await a.ducker.begin();
    expect(a.h.state.volume).toBe(0.8);
    const b = rig("lower", { name: "Headphones (Hands-Free)", speakersOnly: false });
    await b.ducker.begin();
    expect(b.h.state.volume).toBeCloseTo(0.2, 3);
    expect(b.h.sent).not.toContain("name");
  });

  it("asks for the device name once within half a minute", async () => {
    let t = 0;
    const h = fakeHelper();
    const d = createSystemDucker({ mode: () => "mute", speakersOnly: () => true, platform: "win32", start: h.start, now: () => t });
    await d.begin();
    await d.end();
    await d.begin();
    await d.end();
    expect(h.sent.filter((l) => l === "name")).toHaveLength(1);
    t = 31_000;
    await d.begin();
    expect(h.sent.filter((l) => l === "name")).toHaveLength(2);
  });

  it("does nothing on a platform without audio control", async () => {
    const d = createSystemDucker({ mode: () => "lower", speakersOnly: () => true, platform: "linux" });
    await d.begin();
    await d.end();
    d.dispose();
  });
});

describe("system ducker (macOS)", () => {
  it("lowers the volume through AppleScript and restores it", async () => {
    let volume = 70;
    const ran: string[] = [];
    const d = createSystemDucker({
      mode: () => "lower",
      speakersOnly: () => false,
      platform: "darwin",
      osa: async (s) => {
        ran.push(s);
        if (s.startsWith("output volume")) return String(volume);
        const m = /output volume (\d+)/.exec(s);
        if (m) volume = Number(m[1]);
        return "";
      },
    });
    await d.begin();
    expect(volume).toBe(20);
    await d.end();
    expect(volume).toBe(70);
  });
});
