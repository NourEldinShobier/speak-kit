/** Returns a trigger that runs `fn` once per `ms` however often it is called: the first call schedules the run, calls before it runs are absorbed. */
export function frameBatch(fn: () => void, ms = 16): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      fn();
    }, ms);
  };
}
