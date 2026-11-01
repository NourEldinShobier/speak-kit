import { act } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { byLabel, click, installDom, mount, text } from "../../testing/dom";
import { SidePanelApp } from "./SidePanelApp";

const playing = {
  status: "playing",
  docId: "d1",
  tabId: 3,
  title: "Local-first software",
  url: "https://example.com/post",
  sentenceIndex: 0,
  sentenceCount: 6,
  elapsedMs: 30_000,
  totalMs: 120_000,
  speed: 1.5,
  voice: "af_heart",
  queueLength: 1,
};
const snapshot = {
  items: [{ docId: "d2", tabId: 4, title: "Second article", url: "https://news.test/a", sentenceCount: 3, estMs: 180_000 }],
  outline: [
    { index: 0, text: "Intro" },
    { index: 3, text: "Middle" },
  ],
  autoPlay: true,
};

let sent: Record<string, unknown>[];
let listeners: ((m: unknown) => void)[];
let storage: Record<string, unknown>;

/** The service worker, reduced to what the side panel talks to. */
function stubChrome() {
  sent = [];
  listeners = [];
  storage = {};
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: async (m: Record<string, unknown>) => {
        sent.push(m);
        return m.t === "get-state" ? playing : m.t === "get-queue" ? snapshot : { ok: true };
      },
      onMessage: {
        addListener: (f: (m: unknown) => void) => listeners.push(f),
        removeListener: (f: (m: unknown) => void) => {
          listeners = listeners.filter((x) => x !== f);
        },
      },
    },
    storage: {
      sync: {
        get: async () => storage,
        set: async (o: Record<string, unknown>) => {
          Object.assign(storage, o);
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
    tabs: { query: async () => [{ id: 9 }] },
  };
}

beforeEach(() => {
  installDom();
  stubChrome();
});
afterEach(() => delete (globalThis as Record<string, unknown>).chrome);

const commands = () => sent.filter((m) => m.t === "player").map((m) => m.command);
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe("SidePanelApp", () => {
  test("shows the playing document and the queue the worker reports", async () => {
    const m = await mount(<SidePanelApp />);
    await flush();
    expect(text(m.root.querySelector(".sp-now-t"))).toBe("Local-first software");
    expect(text(m.root.querySelector(".sp-lblrow"))).toBe("Up next · 1 · 3 minClear all");
    await m.unmount();
  });

  test("controls become player commands for the worker", async () => {
    const m = await mount(<SidePanelApp />);
    await flush();
    await click(byLabel(m.root, "Pause"));
    await click(byLabel(m.root, "Next paragraph"));
    await click(byLabel(m.root, "Back 10 seconds"));
    await click(byLabel(m.root, "Play Second article now"));
    await click(byLabel(m.root, "Remove Second article"));
    await click(m.root.querySelector(".sk-link"));
    expect(commands()).toEqual([
      { cmd: "toggle" },
      { cmd: "next-block" },
      { cmd: "seek-ms", deltaMs: -10000 },
      { cmd: "queue-play", docId: "d2" },
      { cmd: "queue-remove", docId: "d2" },
      { cmd: "queue-clear" },
    ]);
    await m.unmount();
  });

  test("the speed button steps to the next preset and sets it on the player", async () => {
    const m = await mount(<SidePanelApp />);
    await flush();
    await click(byLabel(m.root, "Speed 1.5x, click to change"));
    expect(commands()).toEqual([{ cmd: "set-speed", speed: 2 }]);
    await m.unmount();
  });

  test("the auto-play switch tells the worker and flips at once", async () => {
    const m = await mount(<SidePanelApp />);
    await flush();
    await click(byLabel(m.root, "Play next item automatically"));
    expect(sent.find((s) => s.t === "set-auto-play")).toEqual({ t: "set-auto-play", on: false });
    expect(byLabel(m.root, "Play next item automatically")!.getAttribute("aria-checked")).toBe("false");
    await m.unmount();
  });

  test("a state broadcast from the worker updates the panel", async () => {
    const m = await mount(<SidePanelApp />);
    await flush();
    await act(async () => listeners.forEach((f) => f({ t: "state", state: { ...playing, status: "paused", title: "Paused piece" } })));
    expect(text(m.root.querySelector(".sp-now-t"))).toBe("Paused piece");
    expect(byLabel(m.root, "Play")).not.toBeNull();
    await m.unmount();
  });

  test("Add this page on an empty panel reads the active tab into the queue", async () => {
    const idle = { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: 1.2, voice: "af_heart", queueLength: 0 };
    (globalThis as { chrome: { runtime: { sendMessage: (m: Record<string, unknown>) => Promise<unknown> } } }).chrome.runtime.sendMessage = async (m) => {
      sent.push(m);
      return m.t === "get-state" ? idle : m.t === "get-queue" ? { items: [], outline: [], autoPlay: true } : { ok: true };
    };
    const m = await mount(<SidePanelApp />);
    await flush();
    await click([...m.root.querySelectorAll("button")].find((b) => text(b) === "Add this page") ?? null);
    await flush();
    expect(sent.find((s) => s.t === "read-tab")).toEqual({ t: "read-tab", tabId: 9, mode: "page", queue: true });
    await m.unmount();
  });
});
