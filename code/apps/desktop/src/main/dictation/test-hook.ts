import type { HudView } from "../../shared/dictation/contract";
import type { DictationModelId } from "../../shared/dictation/settings";
import type { DictationService } from "./service";

/** SPEAKKIT_TEST hooks for dictation: what the scripted speech engine answers, whether the microphone is allowed, and what the HUD shows. */
export const dictationTestHook = (d: DictationService) => ({
  /** The next recordings transcribe to this text. */
  say: (text: string) => d.fake?.say({ text }),
  failTranscription: (on: boolean) => d.fake?.say({ fail: on }),
  /** The next transcription never answers until it is aborted (a hung engine, or a quit while one runs). */
  hangNext: () => d.fake?.say({ hang: true }),
  setInstalled: async (id: DictationModelId, on: boolean) => {
    await d.fake?.setInstalled(id, on);
    await d.models.refresh();
    await d.ready;
  },
  finishDownload: () => d.fake?.finishDownload(),
  denyMic: (on: boolean) => void (d.micDenied = on),
  /** What each transcription was given: language, samples and loudest sample. */
  calls: () => d.fake?.calls().map(({ language, samples, peak }) => ({ language, samples, peak })) ?? [],
  status: () => d.status(),
  hud: () => d.presenter.shown,
  /** Puts any pill on the HUD (design check). */
  showHud: (view: HudView) => d.os?.hud.show({ kind: "view", view }),
  hotkeyActive: () => d.status().hotkeyReady,
  /** Whether the level meter is holding the microphone open. */
  meterOn: () => d.mic.meter,
  state: () => d.state,
});
