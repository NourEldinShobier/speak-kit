import type { CaptureConfig } from "../../../shared/capture/settings";

/** The engine that makes the words of a capture: the choice in the settings counts only while the speech engines experiment is on. */
export const engineOf = (c: Pick<CaptureConfig, "narrationEngine" | "experiments">): CaptureConfig["narrationEngine"] => (c.experiments.speechEngines ? c.narrationEngine : "dictation");

/** Live uses the dictation model, only at another time (while recording), so the model behind it is the dictation one. */
export const modelOf = (e: CaptureConfig["narrationEngine"]): "dictation" | "windows" | "command" => (e === "live" ? "dictation" : e);
