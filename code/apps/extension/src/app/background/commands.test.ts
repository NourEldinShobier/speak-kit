import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const calls: string[] = [];
let status = "idle";
vi.mock("./connection", () => ({ engine: { warm: async () => void calls.push("warm") } }));
vi.mock("./player", () => ({ runPlayerCommand: async (c: { cmd: string }) => void calls.push(`player:${c.cmd}`) }));
vi.mock("./reading", () => ({ activeTabId: async () => 7, startRead: async (_t: number, mode: string) => void calls.push(`read:${mode}`) }));
vi.mock("./state", () => ({ getState: async () => ({ status }), sendToTab: (id: number, m: { t: string }) => void calls.push(`tab${id}:${m.t}`) }));

const { onCommand } = await import("./commands");

describe("keyboard commands", () => {
  beforeEach(() => {
    calls.length = 0;
    status = "idle";
  });

  it("read-selection wakes the model before the read starts", async () => {
    await onCommand("read-selection", { id: 3 } as chrome.tabs.Tab);
    expect(calls).toEqual(["warm", "read:selection"]);
  });

  it("play-pause with nothing playing wakes the model and starts a read; while playing it only toggles", async () => {
    await onCommand("play-pause");
    expect(calls).toEqual(["warm", "read:selection"]);
    calls.length = 0;
    status = "playing";
    await onCommand("play-pause");
    expect(calls).toEqual(["player:toggle"]);
  });

  it("voice-chat asks the page to start or end a conversation, and touches neither the player nor the model", async () => {
    await onCommand("voice-chat", { id: 3 } as chrome.tabs.Tab);
    expect(calls).toEqual(["tab3:voice-toggle"]);
  });

  it("stop never wakes the model", async () => {
    await onCommand("stop");
    expect(calls).toEqual(["player:stop"]);
  });
});
