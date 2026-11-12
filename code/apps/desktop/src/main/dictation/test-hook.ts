import type { HudView } from "../../shared/dictation/contract";
import type { DictationModelId } from "../../shared/dictation/settings";
import type { DictationService } from "./service";

/** SPEAKKIT_TEST hooks for dictation: what the scripted speech engine answers, whether the microphone is allowed, and what the HUD shows. */
export const dictationTestHook = (d: DictationService) => ({
  /** The next recordings transcribe to this text. */
  say: (text: string) => d.fake?.say({ text }),
  failTranscription: (on: boolean) => d.fake?.say({ fail: on }),
  setInstalled: async (id: DictationModelId, on: boolean) => {
    await d.fake?.setInstalled(id, on);
    await d.models.refresh();
    await d.ready;
  },
  finishDownload: () => d.fake?.finishDownload(),
  denyMic: (on: boolean) => void (d.micDenied = on),
  /** What each transcription was given: language, samples and loudest sample. */
  calls: () => d.fake?.calls().map(({ language, samples, peak }) => ({ language, samples, peak })) ?? [],
  /** What the writer of the rewrite pass does with the next dictation. */
  rewrite: (mode: "ok" | "hang" | "fail") => void (d.fakeRewrite = mode),
  /** The files the open and save dialogs return; null cancels. */
  files: (p: { open?: string | null; save?: string | null }) => void Object.assign(d.scriptedFiles, p),
  status: () => d.status(),
  hud: () => d.presenter.shown,
  /** Puts any pill on the HUD (design check). */
  showHud: (view: HudView) => d.os?.hud.show({ kind: "view", view }),
  hotkeyActive: () => d.hotkeyActive,
  state: () => d.state,
});
