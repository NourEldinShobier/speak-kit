import { ipcMain, type IpcMainEvent } from "electron";
import * as v from "valibot";
import { CAPSULE_ACTION, CAPSULE_HOVER } from "../../shared/capture/channels";
import { CapsuleActionSchema, type CapsuleAction } from "../../shared/capture/contract";
import { capsuleHandlers, type CapsuleActionDeps } from "./capsule-actions";

/** What the capsule page sends to the main process: a button that was pressed, and whether the pointer is over the pill. Only the capsule page itself is listened to. */
export class CapsuleInput {
  readonly #deps: () => CapsuleActionDeps;

  /** `deps` is read at each press, so the buttons always act on the session of the moment. */
  constructor(deps: () => CapsuleActionDeps) {
    this.#deps = deps;
  }

  /** Presses a button, then shows what changed. */
  press(action: CapsuleAction) {
    const d = this.#deps();
    capsuleHandlers(d)[action]();
    d.controller.update();
  }

  /** Starts listening to the capsule page; returns the function that stops. */
  listen(): () => void {
    const c = () => this.#deps().controller;
    const onAction = (e: IpcMainEvent, action: unknown) => {
      const parsed = v.safeParse(CapsuleActionSchema, action);
      if (parsed.success && c().owns(e.sender)) this.press(parsed.output);
    };
    const onHover = (e: IpcMainEvent, over: unknown) => typeof over === "boolean" && c().owns(e.sender) && c().hover(over);
    ipcMain.on(CAPSULE_ACTION, onAction);
    ipcMain.on(CAPSULE_HOVER, onHover);
    return () => {
      ipcMain.off(CAPSULE_ACTION, onAction);
      ipcMain.off(CAPSULE_HOVER, onHover);
    };
  }
}
