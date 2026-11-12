import type { Dictation, DictationState } from "@speakkit/dictation";
import type { PauseRules } from "../../shared/dictation/settings";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { HudPresenter } from "./hud-presenter";
import { createActions, type Failure } from "./service-actions";

export type { Failure };
import { DictationHistory } from "./service-history";
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
  refreshCount(): Promise<void>;
  download(): void;
}

/** The pieces of the service that are not the dictation itself: pause and paste last, the history, and the buttons that act on the last dictation. */
export function createParts(h: PartsHost) {
  const controls = new ShortcutControls({ hotkeys: h.hotkeys, core: h.core, presenter: h.presenter, foreground: h.foreground, rules: h.rules, changed: h.changed });
  return {
    controls,
    history: new DictationHistory({ ready: h.ready, core: h.core, changed: h.refreshCount }),
    actions: createActions({ ready: h.ready, failure: h.failure, core: h.core, state: h.state, presenter: h.presenter, download: h.download, undoCancel: async () => controls.undoCancel() }),
  };
}

export type Parts = ReturnType<typeof createParts>;
