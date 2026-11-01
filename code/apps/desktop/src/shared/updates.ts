/** Update flow shown by the title bar pill, the popover (H18), the update card (H9) and the updating card (H19). Updates are never forced. */
export type UpdateState =
  | { kind: "unsupported" }
  | { kind: "idle"; checkedAtMs: number | null }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string; onQuit: boolean }
  | { kind: "restarting"; version: string }
  | { kind: "error"; message: string };

export const UPDATE_UNSUPPORTED: UpdateState = { kind: "unsupported" };

export type UpdateAction = "check" | "download" | "install-now" | "install-on-quit" | "remind-later";
export const UPDATE_ACTIONS: readonly UpdateAction[] = ["check", "download", "install-now", "install-on-quit", "remind-later"];

/** The update is downloaded and waiting for the user: shows the green pill. */
export const updateReady = (u: UpdateState) => u.kind === "ready";
/** Something the user should know about: a dot on the About item and a line in the bell. */
export const updateNeedsAttention = (u: UpdateState) => u.kind === "available" || u.kind === "downloading" || u.kind === "ready";
