/** Runs `send` at once when asked to, or when at least `ms` have passed since the last run; otherwise once, `ms` after the first skipped request. */
export function createThrottle(send: () => void, ms: number): { push(soon?: boolean): void; dispose(): void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    last = Date.now();
    send();
  };
  return {
    push(soon = false) {
      if (soon || Date.now() - last >= ms) run();
      else timer ??= setTimeout(run, ms);
    },
    dispose: () => clearTimeout(timer),
  };
}
