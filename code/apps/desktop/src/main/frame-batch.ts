/**
 * Returns a trigger that runs `fn` at most once per `ms`. A call after a quiet period runs at once (a lone event is not delayed);
 * calls that come while the window is open are absorbed into one run when it closes.
 */
export function frameBatch(fn: () => void, ms = 16): () => void {
  let open: NodeJS.Timeout | undefined;
  let pending = false;
  const run = () => {
    fn();
    open = setTimeout(() => {
      open = undefined;
      if (!pending) return;
      pending = false;
      run();
    }, ms);
  };
  return () => (open ? (pending = true) : run());
}
