import type { Dictation } from "@speakkit/dictation";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { createHookFailure } from "./hook-failure";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import type { DictationOs } from "./index";
import type { MicState } from "./mic-state";
import { settle, type ModelManager } from "./models";
import type { RecorderHost } from "./recorder";
import { prepareModel, warmCaret, warmWriterAfter } from "./service-extras";
import { coreSettings, hotkeyLayout } from "./service-support";

interface Parts {
  hotkeys: SwitchableHotkeys | undefined;
  hook: ReturnType<typeof createHookFailure>;
  recorder: RecorderHost | undefined;
  mic: MicState;
  presenter: HudPresenter;
  os: DictationOs | undefined;
  models: ModelManager;
  writer: { warm(): Promise<void>; unload(): Promise<void> };
}

export type StartParts = Parts & { core: Dictation; hotkeys: SwitchableHotkeys; cfg: DictationConfig; recover: (() => void) | undefined };

/** Dictation turned on: the key hook, the microphone window and an installed model. `quiet` is the start at launch. */
export async function startParts(p: StartParts, { quiet, idleMinutes }: { quiet: boolean; idleMinutes: number }): Promise<void> {
  p.core.configure(coreSettings(p.cfg));
  warmCaret(p.os, p.cfg);
  p.hotkeys.layout(hotkeyLayout(p.cfg));
  const ready = p.hotkeys.enable(true);
  p.hook.set(!ready);
  void p.recorder?.prepare().then(() => p.mic.refresh());
  p.recover?.();
  await p.models.refresh();
  const speech = prepareModel(p.models, { quiet, idleMinutes });
  if (!quiet || idleMinutes === 0) warmWriterAfter(speech, p.writer, p.cfg);
  if (!quiet && ready && p.models.installed) p.presenter.flashReady();
}

/** Dictation turned off: nothing keeps running and no model stays in memory. */
export async function stopParts(p: Parts & { core: Dictation | undefined }): Promise<void> {
  p.core?.cancel();
  p.hotkeys?.enable(false);
  p.hook.set(false);
  p.recorder?.close();
  p.mic.reset();
  p.presenter.dismiss();
  p.os?.hud.dispose(); // the HUD window goes now; the next recording makes a new one
  await p.models.unload();
  await settle(p.writer.unload());
}
