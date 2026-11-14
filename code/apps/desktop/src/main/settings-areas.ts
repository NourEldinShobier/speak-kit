import type { AreaName } from "../shared/control/settings-registry";
import type { CapturePatch } from "../shared/capture/settings";
import type { MeetingsPatch } from "../shared/meetings/settings";
import type { TranscriptsPatch } from "../shared/transcripts/settings";
import type { EnginesPatch } from "../shared/speech-models/config";
import { applyEnginesPatch } from "./speech-models/patch";
import type { SpeechModels } from "./speech-models/service";
import type { CaptureService } from "./capture";
import type { MeetingsFeature } from "./meetings";
import type { TranscriptsFeature } from "./transcripts";

/** Stores the settings of one feature area; what a Settings page or an import changes there goes through the feature that owns it. */
export function areaPatcher(f: { speech: SpeechModels; capture: CaptureService; transcripts: TranscriptsFeature; meetings(): MeetingsFeature | undefined }) {
  return async (area: AreaName, patch: Record<string, unknown>): Promise<void> => {
    if (area === "capture") await f.capture.patchSettings(patch as CapturePatch);
    else if (area === "transcripts") await f.transcripts.handlers.patchSettings(patch as TranscriptsPatch);
    else if (area === "meetings") await f.meetings()!.handlers.patchSettings(patch as MeetingsPatch);
    else await applyEnginesPatch(f.speech, patch as EnginesPatch);
  };
}
