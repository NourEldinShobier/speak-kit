import type { CloneState } from "./model";

/** The heading each screen of the flow opens with. It is read out and takes focus when the screen appears, so a keyboard or screen-reader user lands on the new step. */
export const STEP_HEADING: Record<CloneState["step"], string> = {
  choose: "Choose a voice sample",
  recording: "Record a voice sample",
  review: "Review your take",
  analyzing: "Analyzing your clip",
  rejected: "Clip not accepted",
  naming: "Name your voice",
  done: "Voice saved",
};

/** What the polite status line says about the current step: the engine load in steps of 25 %, so a screen reader is not read every percent. */
export function stepAnnouncement(st: CloneState, progress: number | null): string {
  switch (st.step) {
    case "choose":
      return "Choose where the sample comes from.";
    case "recording":
      return "Recording has started.";
    case "review":
      return "Recording finished. Listen to the take, then use it or record again.";
    case "analyzing":
      if (st.phase === "checking") return "Checking your clip.";
      return progress === null ? "Loading the voice engine." : `Loading the voice engine, ${Math.floor(progress * 4) * 25}%.`;
    case "rejected":
      return st.checks.length > 0
        ? `The clip was not accepted. Failed: ${st.checks
            .filter((c) => !c.ok)
            .map((c) => TITLE[c.id])
            .join(", ")}.`
        : "The clip was not accepted.";
    case "naming":
      return "Your clip passed. Name the voice and hear a test.";
    case "done":
      return `Voice saved: ${st.name}.`;
  }
}

const TITLE = { length: "length", "sample-rate": "sample rate", loudness: "loudness", silence: "silence", noise: "noise" } as const;
