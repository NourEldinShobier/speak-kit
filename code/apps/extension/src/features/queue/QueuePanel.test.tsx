import type { PlayerState } from "@speakkit/protocol";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { byLabel, click, installDom, mount, text } from "../../testing/dom";
import { QueuePanel, type PanelActions } from "./QueuePanel";

beforeEach(installDom);

const actions = () => {
  const fn = vi.fn();
  const a = new Proxy({} as PanelActions, {
    get:
      (_, k) =>
      (...args: unknown[]) =>
        fn(String(k), ...args.filter((x) => !(x as { nativeEvent?: unknown } | null)?.nativeEvent)),
  });
  return { a, fn };
};

const playing: PlayerState = {
  status: "playing",
  docId: "d1",
  tabId: 3,
  title: "Local-first software",
  url: "https://example.com/post",
  sentenceIndex: 4,
  sentenceCount: 9,
  elapsedMs: 75_000,
  totalMs: 300_000,
  speed: 1.2,
  voice: "af_heart",
  queueLength: 1,
};
const queue = {
  items: [{ docId: "d2", tabId: 4, title: "Second article", url: "https://news.test/a", sentenceCount: 10, estMs: 360_000 }],
  outline: [
    { index: 0, text: "Intro" },
    { index: 3, text: "Middle" },
    { index: 6, text: "End" },
  ],
  autoPlay: true,
};

describe("QueuePanel", () => {
  test("empty: says nothing is queued and Add this page calls addPage", async () => {
    const { a, fn } = actions();
    const m = await mount(<QueuePanel state={null} queue={null} a={a} />);
    expect(text(m.root.querySelector(".sp-empty"))).toContain("Nothing queued");
    expect(m.root.querySelector(".sp-foot")).toBeNull();
    await click([...m.root.querySelectorAll("button")].find((b) => text(b) === "Add this page") ?? null);
    expect(fn).toHaveBeenCalledWith("addPage");
    await m.unmount();
  });

  test("now playing shows title, host, paragraph position, times and the outline with the current paragraph marked", async () => {
    const { a } = actions();
    const m = await mount(<QueuePanel state={playing} queue={queue} a={a} />);
    const now = m.root.querySelector(".sp-now")!;
    expect(text(now.querySelector(".sp-now-t"))).toBe("Local-first software");
    expect(text(now.querySelector(".sp-now-s"))).toBe("example.com · paragraph 2 of 3");
    expect(text(now.querySelector(".sp-times"))).toBe("1:153:45 left");
    const rows = [...m.root.querySelectorAll(".sp-outline li")];
    expect(rows.map((r) => r.className)).toEqual(["", "cur", ""]);
    expect(rows[1]!.querySelector("button")!.getAttribute("aria-current")).toBe("true");
    await m.unmount();
  });

  test("transport buttons send their actions", async () => {
    const { a, fn } = actions();
    const m = await mount(<QueuePanel state={playing} queue={queue} a={a} />);
    for (const label of ["Pause", "Previous paragraph", "Next paragraph", "Back 10 seconds", "Forward 10 seconds", "Speed 1.2x, click to change", "Close panel"]) await click(byLabel(m.root, label));
    expect(fn.mock.calls).toEqual([["toggle"], ["block", -1], ["block", 1], ["seekMs", -10000], ["seekMs", 10000], ["cycleSpeed"], ["close"]]);
    await m.unmount();
  });

  test("the play button reads Play when paused", async () => {
    const { a } = actions();
    const m = await mount(<QueuePanel state={{ ...playing, status: "paused" }} queue={queue} a={a} />);
    expect(byLabel(m.root, "Play")).not.toBeNull();
    expect(byLabel(m.root, "Pause")).toBeNull();
    await m.unmount();
  });

  test("outline row seeks to its first sentence; queue rows play now, remove and Clear all", async () => {
    const { a, fn } = actions();
    const m = await mount(<QueuePanel state={playing} queue={queue} a={a} />);
    await click(m.root.querySelectorAll(".sp-outline button")[2]!);
    await click(byLabel(m.root, "Play Second article now"));
    await click(byLabel(m.root, "Remove Second article"));
    await click(m.root.querySelector(".sk-link"));
    expect(fn.mock.calls).toEqual([["seekSentence", 6], ["playItem", "d2"], ["removeItem", "d2"], ["clear"]]);
    expect(text(m.root.querySelector(".sp-queue li .tx"))).toBe("Second articlenews.test · 6 min");
    expect(text(m.root.querySelector(".sp-lblrow"))).toBe("Up next · 1 · 6 minClear all");
    await m.unmount();
  });

  test("the auto-play switch reflects the queue setting and reports a change", async () => {
    const { a, fn } = actions();
    const m = await mount(<QueuePanel state={playing} queue={{ ...queue, autoPlay: false }} a={a} />);
    const sw = byLabel(m.root, "Play next item automatically")!;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await click(sw);
    expect(fn).toHaveBeenCalledWith("setAutoPlay", true);
    await m.unmount();
  });
});
