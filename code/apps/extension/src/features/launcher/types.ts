import type { Shell, UiHandlers, UiModel } from "../../shared/ui-types";

/** What each in-page surface of the launcher needs: the shadow shell, the controller's handlers and the current model. */
export interface Surface {
  shell: Shell;
  hd: UiHandlers;
  model(): UiModel;
}
