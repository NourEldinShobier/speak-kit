import type { AreaName } from "../shared/control/settings-registry";
import type { TranscriptsPatch } from "../shared/transcripts/settings";
import type { EnginesPatch } from "../shared/speech-models/config";
import { applyEnginesPatch } from "./speech-models/patch";
import type { SpeechModels } from "./speech-models/service";
import type { TranscriptsFeature } from "./transcripts";

/** Stores the settings of one feature area; what a Settings page or an import changes there goes through the feature that owns it. */
export function areaPatcher(f: { speech: SpeechModels; transcripts: TranscriptsFeature }) {
  return async (area: AreaName, patch: Record<string, unknown>): Promise<void> => {
    if (area === "transcripts") await f.transcripts.handlers.patchSettings(patch as TranscriptsPatch);
    else await applyEnginesPatch(f.speech, patch as EnginesPatch);
  };
}
