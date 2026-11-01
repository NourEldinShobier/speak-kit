import type { ShownToast } from "./desktop-toasts";
import type { setupShortcuts } from "./desktop-shortcuts";
import type { setupTray } from "./desktop-tray";
import type { createReading } from "./reader/service";

interface HookParts {
  shortcuts: ReturnType<typeof setupShortcuts>;
  shownToasts: ShownToast[];
  tray: ReturnType<typeof setupTray>;
  reading: ReturnType<typeof createReading>;
  installs(): number;
}

/** SPEAKKIT_TEST hooks: simulate what Playwright cannot do (global key presses, native menus, toasts). */
export const desktopTestHook = ({ shortcuts, shownToasts, tray, reading, installs }: HookParts) => ({
  ...shortcuts.testHook,
  toasts: () => shownToasts.map(({ title, body, silent }) => ({ title, body, silent })),
  clickToast: (i: number) => shownToasts[i]?.onClick?.(),
  installs,
  trayItems: () => tray.items().map((i) => ({ label: i.label, enabled: i.enabled, type: i.type, checked: i.checked })),
  clickTray: (label: string) => {
    const item = tray.items().find((i) => i.label === label);
    if (!item || !item.enabled) throw new Error(`no enabled tray item ${label}`);
    item.click();
  },
  trayState: () => tray.summary(),
  togglePanel: tray.togglePanel,
  readText: (text: string) => reading.readText(text, "text"),
});
