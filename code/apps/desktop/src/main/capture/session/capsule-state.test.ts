import { describe, expect, it } from "vitest";
import { noticeFor } from "../../../shared/capture/notices";
import { capsuleFor, type CapsuleInputs } from "./capsule-state";

const base: CapsuleInputs = { session: { phase: "idle" }, title: "Figma · Pricing page", now: 10_000, pen: false, confirmDiscard: false, micMissing: false, dictationPaused: false, switching: false };

describe("capsule state", () => {
  it("shows nothing while idle or while the picker is open", () => {
    expect(capsuleFor(base)).toBeNull();
    expect(capsuleFor({ ...base, session: { phase: "picking" }, after: { kind: "saved", what: "x" } })).toBeNull();
  });
  it("shows the elapsed time and the flags while recording", () => {
    expect(capsuleFor({ ...base, session: { phase: "recording", startedAt: 4000 }, pen: true, micMissing: true, confirmDiscard: true })).toEqual({
      kind: "recording",
      target: "Figma · Pricing page",
      elapsedMs: 6000,
      pen: true,
      micMissing: true,
      confirmDiscard: true,
    });
  });
  it("never shows a negative time", () => {
    expect(capsuleFor({ ...base, session: { phase: "recording", startedAt: 99_999 } })).toMatchObject({ elapsedMs: 0 });
  });
  it("lists the finishing steps in order, with the finished ones done", () => {
    const labels = (step: "video" | "words" | "saving") =>
      (capsuleFor({ ...base, session: { phase: "finishing", step } }) as { steps: { label: string; state: string }[] }).steps.map((s) => `${s.label}:${s.state}`);
    expect(labels("video")).toEqual(["Saving the video:active", "Writing the words...:waiting", "Copying:waiting"]);
    expect(labels("words")).toEqual(["Video saved:done", "Writing the words...:active", "Copying:waiting"]);
    expect(labels("saving")).toEqual(["Video saved:done", "Writing the words...:done", "Copying:active"]);
  });
  it("keeps what happened after the capture on screen", () => {
    expect(capsuleFor({ ...base, after: { kind: "saved", what: "Copied picture and text" } })).toEqual({ kind: "saved", target: "Figma · Pricing page", what: "Copied picture and text" });
    const notice = noticeFor("nothing-recorded");
    expect(capsuleFor({ ...base, after: { kind: "failed", notice } })).toMatchObject({ kind: "failed", notice });
  });
  it("shows the replay indicator while nothing else is on, and gives way to a capture and to what follows one", () => {
    expect(capsuleFor({ ...base, replay: { saving: false } })).toEqual({ kind: "replay", target: "Figma · Pricing page" });
    expect(capsuleFor({ ...base, replay: { saving: true } })).toEqual({ kind: "replay", target: "Figma · Pricing page", saving: true });
    expect(capsuleFor({ ...base, replay: { saving: false }, after: { kind: "saved", what: "x" } })).toMatchObject({ kind: "saved" });
    expect(capsuleFor({ ...base, replay: { saving: false }, session: { phase: "recording", startedAt: 4000 } })).toMatchObject({ kind: "recording" });
    expect(capsuleFor({ ...base, replay: { saving: false }, session: { phase: "picking" } })).toBeNull();
  });
});
