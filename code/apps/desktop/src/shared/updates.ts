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

export const UPDATE_ACTIONS = ["check", "download", "install-now", "install-on-quit", "remind-later"] as const;
export type UpdateAction = (typeof UPDATE_ACTIONS)[number];
