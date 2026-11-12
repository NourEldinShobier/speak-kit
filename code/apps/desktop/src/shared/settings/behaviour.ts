import type { Config } from "../schemas";

/** What the close button does. With the tray icon hidden there is nothing to reopen a hidden window from, so closing quits. */
export function effectiveCloseAction(c: Pick<Config, "closeAction" | "hideTrayIcon">): "hide" | "quit" {
  return c.hideTrayIcon ? "quit" : c.closeAction;
}

/** What closing the window does right now: running work (an export, a reading) is confirmed before a quit. */
export function closeOutcome(c: Pick<Config, "closeAction" | "hideTrayIcon">, busy: boolean): "hide" | "quit" | "confirm-quit" {
  const a = effectiveCloseAction(c);
  return a === "quit" && busy ? "confirm-quit" : a;
}

/** The tray icon is shown unless hidden by the user. */
export const showTrayIcon = (c: Pick<Config, "hideTrayIcon">): boolean => !c.hideTrayIcon;

/** The Settings row text for the close behaviour; it names the way back when the tray is hidden. */
export function closeHint(c: Pick<Config, "closeAction" | "hideTrayIcon">): string {
  if (c.hideTrayIcon) return "The tray icon is hidden, so closing the window quits Speak Kit. Start it again from the Start menu or Launchpad.";
  return c.closeAction === "hide"
    ? "Keeps Speak Kit in the tray so the extension and the shortcuts keep working. Quit from the tray menu."
    : "Closing the window quits Speak Kit and stops the extension and the shortcuts.";
}

export type MotionMode = "on" | "off";

/** Reduce motion: the app's own choice wins, otherwise the operating system's. */
export function reduceMotion(choice: Config["reduceMotion"], osPrefersReduced: boolean): MotionMode {
  if (choice === "on") return "on";
  if (choice === "off") return "off";
  return osPrefersReduced ? "on" : "off";
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
