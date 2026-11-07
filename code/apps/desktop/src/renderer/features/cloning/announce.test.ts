import { describe, expect, it } from "vite-plus/test";
import type { ClonedVoice } from "@speakkit/protocol";
import { STEP_HEADING, stepAnnouncement } from "./announce";
import { initClone, type CloneState } from "./model";

const take = { wav: new Uint8Array(44), durationMs: 14000, label: "maya.mp3" };
const voice: ClonedVoice = { id: "cb_0a1b2c3d", name: "maya", durationMs: 14000, createdAt: 1, checks: [] };

describe("clone flow announcements", () => {
  it("every step has its own heading", () => {
    expect(Object.values(STEP_HEADING)).toEqual(["Choose a voice sample", "Record a voice sample", "Review your take", "Analyzing your clip", "Clip not accepted", "Name your voice", "Voice saved"]);
  });

  it("says what each step is", () => {
    const say = (st: CloneState, p: number | null = null) => stepAnnouncement(st, p);
    expect(say(initClone())).toBe("Choose where the sample comes from.");
    expect(say({ step: "recording", elapsedMs: 0, level: 0 })).toBe("Recording has started.");
    expect(say({ step: "review", take })).toBe("Recording finished. Listen to the take, then use it or record again.");
    expect(say({ step: "analyzing", take, phase: "checking", voice: null })).toBe("Checking your clip.");
    expect(say({ step: "naming", voice, name: "", exaggeration: 0.5, saving: false, error: null })).toBe("Your clip passed. Name the voice and hear a test.");
  });

  it("reports the engine load in steps of 25 percent, so equal text is not read twice", () => {
    const loading: CloneState = { step: "analyzing", take, phase: "loading", voice };
    expect([null, 0, 0.24, 0.26, 0.5, 0.99, 1].map((p) => stepAnnouncement(loading, p))).toEqual([
      "Loading the voice engine.",
      "Loading the voice engine, 0%.",
      "Loading the voice engine, 0%.",
      "Loading the voice engine, 25%.",
      "Loading the voice engine, 50%.",
      "Loading the voice engine, 75%.",
      "Loading the voice engine, 100%.",
    ]);
  });

  it("announces a rejected clip with the failed checks, and a saved voice with its name", () => {
    const checks = [
      { id: "length", ok: false, message: "Clip is 3.0 s." },
      { id: "noise", ok: true, message: "Low." },
      { id: "sample-rate", ok: false, message: "8000 Hz." },
    ] as const;
    expect(stepAnnouncement({ step: "rejected", message: "", checks: [...checks] }, null)).toBe("The clip was not accepted. Failed: length, sample rate.");
    expect(stepAnnouncement({ step: "rejected", message: "unreadable", checks: [] }, null)).toBe("The clip was not accepted.");
    expect(stepAnnouncement({ step: "done", name: "Maya" }, null)).toBe("Voice saved: Maya.");
  });
});
