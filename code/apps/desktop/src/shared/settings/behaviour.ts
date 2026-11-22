/** What closing the window does: it hides to the tray. Without a tray icon nothing could bring it back, so it quits; running work (an export, a reading) is confirmed before that quit. */
export function closeOutcome(busy: boolean, trayMissing: boolean): "hide" | "quit" | "confirm-quit" {
  if (!trayMissing) return "hide";
  return busy ? "confirm-quit" : "quit";
}

/** The in-app keys the Accessibility page lists. Global keys come from the Shortcuts page. */
export const KEYBOARD_MAP: readonly { keys: string; does: string }[] = [
  { keys: "Tab, Shift+Tab", does: "Move between controls" },
  { keys: "Arrow keys", does: "Move inside lists, menus and tabs" },
  { keys: "Enter or Space", does: "Press the focused button or toggle" },
  { keys: "Escape", does: "Close a dialog or menu; leave Settings" },
  { keys: "Ctrl+K", does: "Open the command palette" },
  { keys: "Alt+Left, Alt+Right", does: "Go back or forward" },
];
