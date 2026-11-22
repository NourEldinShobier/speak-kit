import type { DictationState } from "@speakkit/dictation";
import { describe, expect, it, vi } from "vite-plus/test";

const calls = vi.hoisted(() => [] as string[]);
vi.mock("electron", () => ({
  powerSaveBlocker: {
    start: (kind: string) => (calls.push(`start ${kind}`), 5),
    stop: (id: number) => void calls.push(`stop ${id}`),
  },
  clipboard: {},
  shell: {},
}));
vi.mock("./ducking", () => ({ createSystemDucker: () => ({ begin: async () => undefined, end: async () => undefined, dispose: () => undefined }) }));

import { createOutputSide } from "./service-output";

const idle: DictationState = { status: "idle" };
const hold: DictationState = { status: "recording", mode: "hold" };
const rig = () => {
  calls.length = 0;
  return createOutputSide({ cfg: () => ({}) as never, hotkeys: () => undefined, state: () => idle, warn: () => undefined });
};

describe("computer awake while recording", () => {
  it("is held from the start of a recording, whatever the settings", () => {
    const o = rig();
    o.onState(idle, hold);
    expect(calls).toEqual(["start prevent-app-suspension"]);
  });
  it.each<[string, DictationState]>([
    ["stop (transcribing)", { status: "transcribing" }],
    ["cancel (idle)", idle],
    ["failure (error)", { status: "error", code: "mic-silent" }],
  ])("is released after %s", (_name, next) => {
    const o = rig();
    o.onState(idle, hold);
    o.onState(hold, next);
    expect(calls).toEqual(["start prevent-app-suspension", "stop 5"]);
  });
  it("is released when dictation is turned off or the app quits during a recording", async () => {
    const o = rig();
    o.onState(idle, { status: "locked" });
    await o.dispose();
    expect(calls).toEqual(["start prevent-app-suspension", "stop 5"]);
  });
});
