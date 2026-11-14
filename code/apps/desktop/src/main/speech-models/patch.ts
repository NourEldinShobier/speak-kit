import type { EnginesPatch } from "../../shared/speech-models/config";
import type { SpeechModels } from "./service";

/** The choices of the Engines page as the settings registry hands them over: the page, the command line and an import all arrive here, and each choice acts as its own setting does. */
export async function applyEnginesPatch(speech: SpeechModels, p: EnginesPatch): Promise<void> {
  if (p.idleMinutes !== undefined) speech.setIdleMinutes(p.idleMinutes);
  if (p.releaseOnClose !== undefined) speech.setReleaseOnClose(p.releaseOnClose);
  if (p.autoSwitch) speech.setAutoSwitch(p.autoSwitch);
  if (p.device !== undefined) await speech.setDevice(p.device);
}
