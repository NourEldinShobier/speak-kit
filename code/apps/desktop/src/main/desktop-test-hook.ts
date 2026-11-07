import { monitorEventLoopDelay } from "node:perf_hooks";
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
export const desktopTestHook = ({ shortcuts, shownToasts, tray, reading, installs }: HookParts) => {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  return {
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
    readText: (text: string) => reading.readText(text, "text"),
    /** Main-process event-loop delay since the app started, in ms (nanoseconds from the histogram). */
    loopDelay: () => ({ p50Ms: loop.percentile(50) / 1e6, p99Ms: loop.percentile(99) / 1e6, maxMs: loop.max / 1e6 }),
  };
};
