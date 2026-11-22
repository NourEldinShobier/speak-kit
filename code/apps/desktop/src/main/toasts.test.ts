import { describe, expect, it } from "vite-plus/test";
import { NOTIFY_CHANNELS, THROTTLE_MS, ToastCenter } from "./toasts";

function setup(over: { looking?: boolean } = {}) {
  const shown: unknown[] = [];
  const bell: string[] = [];
  let now = 1_000;
  const center = new ToastCenter({
    looking: () => over.looking ?? false,
    show: (t) => shown.push({ title: t.title, silent: t.silent }),
    bell: (_e, title) => bell.push(title),
    now: () => now,
  });
  return { center, shown, bell, advance: (ms: number) => (now += ms) };
}
const exp = (taskKey: string) => ({ event: "export-done" as const, taskKey, title: `Export ${taskKey}`, body: "done" });

describe("ToastCenter", () => {
  it("shows a toast and a bell line, silent unless sound is on", () => {
    const t = setup();
    expect(t.center.notify(exp("a"))).toBe("shown");
    expect(t.shown).toEqual([{ title: "Export a", silent: true }]);
    expect(t.bell).toEqual(["Export a"]);
    expect(t.center.notify({ event: "engine-error", title: "Engine", body: "x" })).toBe("shown");
    expect(t.shown.at(-1)).toEqual({ title: "Engine", silent: false });
  });

  it("drops a repeat of the same task for 10 minutes, but not another task", () => {
    const t = setup();
    expect(t.center.notify(exp("a"))).toBe("shown");
    t.advance(THROTTLE_MS - 1);
    expect(t.center.notify(exp("a"))).toBe("throttled");
    expect(t.center.notify(exp("b"))).toBe("shown");
    t.advance(1);
    expect(t.center.notify(exp("a"))).toBe("shown");
    expect(t.bell).toEqual(["Export a", "Export b", "Export a"]);
  });

  it("a focused window keeps the bell line and drops the toast", () => {
    const looking = setup({ looking: true });
    expect(looking.center.notify(exp("a"))).toBe("bell-only");
    expect(looking.shown).toEqual([]);
    expect(looking.bell).toEqual(["Export a"]);
  });

  it("an event with toast and bell off does nothing", () => {
    const t = setup();
    expect(t.center.notify({ event: "reading-finished", title: "Done", body: "" })).toBe("off");
    expect(t.shown).toEqual([]);
    expect(t.bell).toEqual([]);
  });

  it("each event uses a fixed set of channels", () => {
    expect(NOTIFY_CHANNELS).toEqual({
      "reading-finished": { toast: false, bell: false, sound: false },
      "export-done": { toast: true, bell: true, sound: false },
      "engine-error": { toast: true, bell: true, sound: true },
      "update-ready": { toast: true, bell: true, sound: false },
    });
  });
});
