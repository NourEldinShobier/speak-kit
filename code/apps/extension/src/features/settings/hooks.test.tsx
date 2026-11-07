import { act } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { installDom, mount } from "../../testing/dom";
import { useSettings } from "./hooks";
import type { Settings } from "./types";

let stored: Record<string, unknown>;
let release: () => void;
let api: ReturnType<typeof useSettings>;

function Probe() {
  api = useSettings();
  return null;
}

beforeEach(() => {
  installDom();
  stored = { "speakkit.settings": { speed: 2, voice: "bm_george" } };
  const gate = new Promise<void>((r) => (release = r));
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      sync: { get: async () => (await gate, stored), set: async (o: Record<string, unknown>) => void Object.assign(stored, o) },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
});
afterEach(() => delete (globalThis as Record<string, unknown>).chrome);

describe("useSettings", () => {
  test("a change made before the stored settings arrive is applied on top of them, not over the defaults", async () => {
    const m = await mount(<Probe />);
    await act(async () => api.update((s: Settings) => ({ ...s, launcher: { ...s.launcher, side: "left" } })));
    await act(async () => release());
    expect(api.ready).toBe(true);
    expect([api.settings.launcher.side, api.settings.speed, api.settings.voice]).toEqual(["left", 2, "bm_george"]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    const saved = stored["speakkit.settings"] as Settings;
    expect([saved.launcher.side, saved.speed, saved.voice]).toEqual(["left", 2, "bm_george"]);
    await m.unmount();
  });

  test("a change after loading is saved once, after a quiet moment", async () => {
    const m = await mount(<Probe />);
    await act(async () => release());
    await act(async () => api.update((s: Settings) => ({ ...s, speed: 1.5 })));
    expect((stored["speakkit.settings"] as Settings).speed).toBe(2);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect((stored["speakkit.settings"] as Settings).speed).toBe(1.5);
    expect(api.saved).toBe(true);
    await m.unmount();
  });
});
