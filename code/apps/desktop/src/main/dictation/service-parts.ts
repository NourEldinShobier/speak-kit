import type { AudioStore, Dictation, DictationState } from "@speakkit/dictation";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { PauseRules } from "../../shared/dictation/settings";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import { createActions, type Failure } from "./service-actions";

export type { Failure };
import { HistoryFacade } from "./history-facade";
import { HistoryApi, type FilePickers } from "./history-api";
import type { DictationServiceOptions } from "./service-options";
import type { Stt } from "./stt";
import { ShortcutControls } from "./shortcut-controls";
import type { ForegroundInfo } from "./types";

/** What the service lends to the parts that act on it. */
export interface PartsHost {
  ready(): Promise<unknown>;
  failure: Failure;
  presenter: HudPresenter;
  core(): Dictation | undefined;
  hotkeys(): SwitchableHotkeys | undefined;
  state(): DictationState;
  foreground(): ForegroundInfo | null;
  rules(): PauseRules | undefined;
  /** The status changed. */
  changed(): void;
  download(): void;
  audio(): AudioStore | undefined;
  cfg(): DictationConfig;
  stt: Stt;
  files: FilePickers;
  warn(title: string, detail: string): void;
  /** Where the saved-key question and the test hook are answered. */
  key: Pick<DictationServiceOptions, "hasKey" | "test">;
}

/** The pieces of the service that are not the dictation itself: pause and paste last, the history, and the buttons that act on the last dictation. */
export function createParts(h: PartsHost) {
  const controls = new ShortcutControls({ hotkeys: h.hotkeys, core: h.core, presenter: h.presenter, foreground: h.foreground, rules: h.rules, changed: h.changed });
  const history = new HistoryFacade({ ready: h.ready, core: h.core, changed: h.changed });
  const records = new HistoryApi({
    ready: h.ready,
    core: h.core,
    audio: h.audio,
    cfg: h.cfg,
    dictating: () => h.state().status !== "idle" && h.state().status !== "error",
    stt: h.stt,
    files: h.files,
    push: h.changed,
    refreshCount: () => history.refresh(),
    warn: h.warn,
    key: h.key,
  });
  return {
    controls,
    history,
    records,
    actions: createActions({
      ready: h.ready,
      failure: h.failure,
      core: h.core,
      state: h.state,
      presenter: h.presenter,
      download: h.download,
      undoCancel: async () => controls.undoCancel(),
      copyLast: () => history.copyLast(),
      pasteAgain: async () => void (await history.pasteLast()),
    }),
  };
}

export type Parts = ReturnType<typeof createParts>;
