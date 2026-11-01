import { describe, expect, it } from "vite-plus/test";
import { parseConfig, type Notifications } from "../shared/schemas";
import { THROTTLE_MS, ToastCenter } from "./toasts";

function setup(over: Partial<{ notifications: Notifications; doNotDisturb: boolean; looking: boolean }> = {}) {
  const shown: unknown[] = [];
  const bell: string[] = [];
  let now = 1_000;
  const prefs = { notifications: parseConfig({}).notifications, doNotDisturb: false, ...over };
  const center = new ToastCenter({
    prefs: () => prefs,
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

  it("Do Not Disturb and a focused window keep the bell line and drop the toast", () => {
    const dnd = setup({ doNotDisturb: true });
    expect(dnd.center.notify(exp("a"))).toBe("bell-only");
    expect(dnd.shown).toEqual([]);
    expect(dnd.bell).toEqual(["Export a"]);
    const looking = setup({ looking: true });
    expect(looking.center.notify(exp("a"))).toBe("bell-only");
  });

  it("an event with toast and bell off does nothing", () => {
    const t = setup();
    expect(t.center.notify({ event: "reading-finished", title: "Done", body: "" })).toBe("off");
    expect(t.shown).toEqual([]);
    expect(t.bell).toEqual([]);
  });

  it("toast off but bell on records only the bell", () => {
    const n = parseConfig({}).notifications;
    const t = setup({ notifications: { ...n, "export-done": { toast: false, bell: true, sound: false } } });
    expect(t.center.notify(exp("a"))).toBe("bell-only");
    expect(t.bell).toEqual(["Export a"]);
  });
});
