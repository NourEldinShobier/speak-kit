import type { UiHandlers, UiModel } from "../../shared/ui-types";
import type { Ui } from "./ui";

/**
 * content.js carries extraction, highlight and the controller. The UI (kit builders, CSS, icons, launcher, dock, reader) is a
 * second file, content-ui.js, fetched from the extension on the first need so pages that never show a control never parse it.
 * `defer` gives the controller a synchronous handle: calls made before the file arrives are queued (`render` keeps only the latest),
 * and plain property reads return an inert value.
 */
const GETTERS = new Set(["host", "hasPopover", "bubbleVisible", "gutterTarget", "shell"]);

/** The handle plus the promise of the real object. */
export type Deferred<T> = T & { readonly ready: Promise<T> };

export function defer<T extends object>(load: Promise<T>, latestOnly: string[] = []): Deferred<T> {
  let real: T | undefined;
  const queue: { key: string; run: (r: T) => void }[] = [];
  void load.then(
    (r) => {
      real = r;
      for (const q of queue.splice(0)) q.run(r);
    },
    () => {
      queue.length = 0;
    },
  );
  return new Proxy({} as Deferred<T>, {
    get(_, key: string) {
      if (key === "ready") return load;
      if (real) {
        const v = (real as Record<string, unknown>)[key];
        return typeof v === "function" ? v.bind(real) : v;
      }
      if (GETTERS.has(key)) return key === "hasPopover" || key === "bubbleVisible" ? false : undefined;
      return (...args: unknown[]) => {
        if (latestOnly.includes(key)) {
          const i = queue.findIndex((q) => q.key === key);
          if (i >= 0) queue.splice(i, 1);
        }
        queue.push({ key, run: (r) => (r as Record<string, (...a: unknown[]) => unknown>)[key]!(...args) });
      };
    },
  });
}

/** Fetches content-ui.js and builds the UI. Failure (extension reloaded, blocked) leaves the page without controls. */
export function loadUi(url: string, hd: UiHandlers, model: UiModel): Promise<Ui> {
  return import(/* @vite-ignore */ url).then((m: { Ui: new (hd: UiHandlers, model: UiModel) => Ui }) => new m.Ui(hd, model));
}
