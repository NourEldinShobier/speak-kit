import type { Tone } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";

export const GRADE_TONE: Record<Voice["quality"], Tone> = { A: "green", B: "blue", C: "orange", D: "red" };
