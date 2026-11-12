import type { HotkeySource } from "../../dictation/types";

/**
 * Left clicks while a recording runs, from the operating system's mouse hook. The hook is opened the first time it is needed and exists only between a
 * watch and its stop. Where it cannot be had the watch does nothing: the zoom suggestions then rest on the pointer alone.
 */
export function lazyClicks(open: () => Promise<Pick<HotkeySource, "watchClicks">>, log: (line: string) => void): (onClick: () => void) => () => void {
  let source: Promise<Pick<HotkeySource, "watchClicks"> | undefined> | undefined;
  return (onClick) => {
    let stopped = false;
    let stop: (() => void) | undefined;
    source ??= open().catch((e) => (log(`capture: the mouse hook could not be opened (${String(e)})`), undefined));
    void source.then((s) => {
      stop = stopped ? undefined : s?.watchClicks?.(onClick);
    });
    return () => {
      stopped = true;
      stop?.();
      stop = undefined;
    };
  };
}
