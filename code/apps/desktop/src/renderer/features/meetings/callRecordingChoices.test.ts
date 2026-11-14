import { describe, expect, it } from "vite-plus/test";
import type { Capabilities, SettingsView } from "../../../shared/meetings/contract";
import { micChoice, recordChoice } from "./callRecordingChoices";

const caps = (o: Partial<Capabilities>): Capabilities => ({
  platform: "win32",
  systemAudio: "available",
  callDetection: "available",
  micFollowsCallApp: "unavailable",
  callAppOutput: "unavailable",
  ...o,
});
const view = (c: Partial<Capabilities>, cfg: Record<string, unknown> = {}) => ({ config: { recordSource: "call-app", mic: "dictation", ...cfg }, capabilities: caps(c) }) as unknown as SettingsView;

describe("what the call recording settings offer", () => {
  it("offers only the whole system when the system cannot say which program a sound comes from", () => {
    const r = recordChoice(view({}, { recordSource: "call-app" }));
    expect(r.value).toBe("system");
    expect(r.options.map((o) => o.value)).toEqual(["system"]);
  });

  it("offers both choices where the call app's sound can be told apart", () => {
    const r = recordChoice(view({ callAppOutput: "available" }, { recordSource: "call-app" }));
    expect(r.value).toBe("call-app");
    expect(r.options.map((o) => o.value)).toEqual(["call-app", "system"]);
  });

  it("drops 'Follows the call app' and shows the dictation microphone when the system cannot name the call app's microphone", () => {
    const m = micChoice(view({}, { mic: "call-app" }), [{ id: "usb", label: "USB mic", isDefault: false }]);
    expect(m.value).toBe("dictation");
    expect(m.options).toEqual([
      { value: "dictation", label: "Same as dictation" },
      { value: "usb", label: "USB mic" },
    ]);
  });

  it("keeps the saved choice where it can be followed", () => {
    const m = micChoice(view({ micFollowsCallApp: "available" }, { mic: "call-app" }), []);
    expect(m.value).toBe("call-app");
    expect(m.options.map((o) => o.value)).toEqual(["dictation", "call-app"]);
  });
});
