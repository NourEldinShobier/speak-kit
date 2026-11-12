import { describe, expect, it } from "vite-plus/test";
import { lazyClicks } from "./clicks";

function setup(o: { fail?: boolean; none?: boolean } = {}) {
  let opened = 0;
  const log: string[] = [];
  const watching: (() => void)[] = [];
  let stopped = 0;
  const watch = lazyClicks(
    async () => {
      opened++;
      if (o.fail) throw new Error("no koffi");
      return { watchClicks: o.none ? () => undefined : (fn: () => void) => (watching.push(fn), () => void stopped++) };
    },
    (l) => log.push(l),
  );
  return { watch, log, watching, opened: () => opened, stopped: () => stopped };
}
const later = () => new Promise((r) => setTimeout(r, 0));

describe("click watch", () => {
  it("opens the hook once, on the first watch, and passes the clicks on until stopped", async () => {
    const t = setup();
    expect(t.opened()).toBe(0);
    const clicks: number[] = [];
    const stop = t.watch(() => clicks.push(1));
    await later();
    t.watching[0]!();
    stop();
    expect(clicks).toEqual([1]);
    expect(t.stopped()).toBe(1);
    t.watch(() => undefined);
    await later();
    expect(t.opened()).toBe(1);
  });

  it("does not watch when stopped before the hook was ready", async () => {
    const t = setup();
    t.watch(() => undefined)();
    await later();
    expect(t.watching).toEqual([]);
  });

  it("logs once and gives no clicks when the hook cannot be opened or has no mouse", async () => {
    const failing = setup({ fail: true });
    failing.watch(() => undefined);
    failing.watch(() => undefined);
    await later();
    expect(failing.log).toEqual(["capture: the mouse hook could not be opened (Error: no koffi)"]);
    const none = setup({ none: true });
    none.watch(() => undefined)();
    await later();
    expect(none.watching).toEqual([]);
  });
});
