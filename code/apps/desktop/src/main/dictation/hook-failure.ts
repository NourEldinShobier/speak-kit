import { shouldRetryHotkey } from "./service-support";

export interface HookFailure {
  /** The hotkey could not start or stopped working and could not be reinstalled. */
  readonly failed: boolean;
  /** Sets the flag without telling anyone (the key hook was never built). */
  mark(failed: boolean): void;
  /** Sets the flag, shows the failure in the pill, and tells the page. */
  set(failed: boolean): void;
  /** The hook died; `recovered` is true when it was reinstalled. */
  onFault(error: unknown, recovered: boolean): void;
  /** Starts the hotkey again after what blocked it was fixed (a permission was allowed). */
  retry(permitted: boolean): Promise<void>;
}

interface Deps {
  /** Settles once the service has finished starting. */
  ready(): Promise<unknown>;
  enabled(): boolean;
  alert(): void;
  changed(): void;
  warn(title: string, detail: string): void;
  restart(): Promise<void>;
}

/** Whether the hotkey is dead, and what happens when it dies or comes back. */
export function createHookFailure(d: Deps): HookFailure {
  let failed = false;
  const set = (on: boolean): void => {
    failed = on;
    if (on) d.alert();
    d.changed();
  };
  return {
    get failed() {
      return failed;
    },
    mark: (on) => void (failed = on),
    set,
    onFault(error, recovered) {
      d.warn("dictation hook failed", `${String(error)} (${recovered ? "reinstalled" : "not reinstalled"})`);
      if (d.enabled()) set(!recovered); // switched off meanwhile: nothing to report
    },
    async retry(permitted) {
      await d.ready();
      if (shouldRetryHotkey({ failed, enabled: d.enabled(), permitted })) await d.restart();
    },
  };
}
