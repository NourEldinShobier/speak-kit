import type { AudioStore, Correction, Dictation, DictationState } from "@speakkit/dictation";
import type { DictationConfig } from "../../shared/dictation/settings";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import { createActions, type Failure } from "./service-actions";
import type { DictationOs } from "./index";
import { CorrectionLearner } from "./learn-correction";
import { selectionPort } from "./learn-window";

export type { Failure };
import { HistoryFacade } from "./history-facade";
import { HistoryApi, type FilePickers } from "./history-api";
import type { DictationServiceOptions } from "./service-options";
import type { Stt } from "./stt";
import { ShortcutControls } from "./shortcut-controls";

/** What the service lends to the parts that act on it. */
export interface PartsHost {
  ready(): Promise<unknown>;
  failure: Failure;
  presenter: HudPresenter;
  core(): Dictation | undefined;
  hotkeys(): SwitchableHotkeys | undefined;
  state(): DictationState;
  /** The status changed. */
  changed(): void;
  download(): void;
  audio(): AudioStore | undefined;
  cfg(): DictationConfig;
  os(): DictationOs | undefined;
  /** Replaces the list of corrections: saved, handed to the core and shown on the pages. */
  setCorrections(list: Correction[]): void;
  stt: Stt;
  /** Every speech model, to show the name of the one that heard an entry. */
  catalog(): readonly { id: string; name: string }[];
  files: FilePickers;
  warn(title: string, detail: string): void;
  /** The history was cleared: audio kept for a crash goes too. */
  cleared?(): void;
  /** Where the saved-key question and the test hook are answered. */
  key: Pick<DictationServiceOptions, "hasKey" | "test">;
}

/** The pieces of the service that are not the dictation itself: pause and paste last, the history, and the buttons that act on the last dictation. */
export function createParts(h: PartsHost) {
  const history = new HistoryFacade({ ready: h.ready, core: h.core, changed: h.changed, ...(h.cleared && { cleared: h.cleared }) });
  const records = new HistoryApi({
    ready: h.ready,
    core: h.core,
    audio: h.audio,
    cfg: h.cfg,
    dictating: () => h.state().status !== "idle" && h.state().status !== "error",
    stt: h.stt,
    catalog: h.catalog,
    files: h.files,
    push: h.changed,
    refreshCount: () => history.refresh(),
    warn: h.warn,
    key: h.key,
    ...(h.cleared && { cleared: h.cleared }),
  });
  const learner = new CorrectionLearner({
    ports: selectionPort({ os: h.os, core: h.core }),
    presenter: h.presenter,
    corrections: () => h.cfg().corrections,
    save: h.setCorrections,
    now: Date.now,
  });
  const controls = new ShortcutControls({ hotkeys: h.hotkeys, core: h.core, presenter: h.presenter, changed: h.changed, learn: () => learner.press() });
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
      learnSave: () => learner.save(),
      learnUndo: () => learner.undo(),
      changed: h.changed,
    }),
  };
}

export type Parts = ReturnType<typeof createParts>;
