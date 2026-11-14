import { describe, expect, it, vi } from "vitest";
import { createAutoSend, type SendView, type Sender } from "./auto-send";

function setup(o: { sendOk?: boolean; retractable?: boolean } = {}) {
  const views: (SendView | undefined)[] = [];
  const timers: (() => void)[] = [];
  let canUndo = o.retractable ?? true;
  const listeners: (() => void)[] = [];
  const sender: Sender & { sent: number; undone: number } = {
    destination: "Voice chat",
    sent: 0,
    undone: 0,
    send: async () => {
      sender.sent++;
      return o.sendOk ?? true;
    },
    canUndo: () => canUndo,
    undo: () => {
      if (!canUndo) return false;
      sender.undone++;
      canUndo = false;
      return true;
    },
    onChange: (cb) => (listeners.push(cb), () => void listeners.splice(listeners.indexOf(cb), 1)),
  };
  const failed = vi.fn();
  const auto = createAutoSend({ sender, schedule: (fn) => (timers.push(fn), () => void timers.splice(timers.indexOf(fn), 1)), show: (v) => views.push(v), failed });
  const tickOnce = () => timers.shift()?.();
  const read = () => {
    canUndo = false;
    listeners.forEach((l) => l());
  };
  return { auto, sender, views, tickOnce, failed, read, timers, listeners: () => listeners.length };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("auto send", () => {
  it("counts down one second at a time and sends at zero", async () => {
    const t = setup();
    t.auto.start(3);
    expect(t.views).toEqual([{ kind: "countdown", secondsLeft: 3 }]);
    t.tickOnce();
    expect(t.views.at(-1)).toEqual({ kind: "countdown", secondsLeft: 2 });
    t.tickOnce();
    expect(t.views.at(-1)).toEqual({ kind: "countdown", secondsLeft: 1 });
    expect(t.sender.sent).toBe(0);
    t.tickOnce();
    await flush();
    expect(t.sender.sent).toBe(1);
    expect(t.views.at(-1)).toEqual({ kind: "sent", destination: "Voice chat", canUndo: true });
  });

  it("holds the countdown where it is, and sends only on Send now", async () => {
    const t = setup();
    t.auto.start(5);
    t.tickOnce();
    t.auto.hold();
    expect(t.views.at(-1)).toEqual({ kind: "countdown", secondsLeft: 4, held: true });
    expect(t.timers).toHaveLength(0);
    expect(t.sender.sent).toBe(0);
    await t.auto.sendNow();
    expect(t.sender.sent).toBe(1);
    expect(t.views.at(-1)).toMatchObject({ kind: "sent" });
  });

  it("undo inside the countdown sends nothing", () => {
    const t = setup();
    t.auto.start(3);
    t.auto.undo();
    expect(t.views.at(-1)).toEqual({ kind: "undone" });
    expect(t.timers).toHaveLength(0);
    expect(t.sender.sent).toBe(0);
  });

  it("undo of a held countdown sends nothing either", () => {
    const t = setup();
    t.auto.start(3);
    t.auto.hold();
    t.auto.undo();
    expect(t.views.at(-1)).toEqual({ kind: "undone" });
    expect(t.sender.sent).toBe(0);
  });

  it("takes a sent capture back while the destination has not read it", async () => {
    const t = setup();
    await t.auto.sendNow();
    t.auto.undo();
    expect(t.sender.undone).toBe(1);
    expect(t.views.at(-1)).toEqual({ kind: "undone" });
  });

  it("says plainly that it cannot be taken back once it was read, and ignores Undo", async () => {
    const t = setup();
    await t.auto.sendNow();
    t.read();
    expect(t.views.at(-1)).toEqual({ kind: "sent", destination: "Voice chat", canUndo: false });
    t.auto.undo();
    expect(t.sender.undone).toBe(0);
    expect(t.views.at(-1)).toMatchObject({ kind: "sent", canUndo: false });
  });

  it("starts as already read when the destination cannot take it back", async () => {
    const t = setup({ retractable: false });
    await t.auto.sendNow();
    expect(t.views.at(-1)).toEqual({ kind: "sent", destination: "Voice chat", canUndo: false });
  });

  it("reports a failed hand-over and shows no sent state", async () => {
    const t = setup({ sendOk: false });
    await t.auto.sendNow();
    expect(t.failed).toHaveBeenCalledOnce();
    expect(t.views.some((v) => v?.kind === "sent")).toBe(false);
  });

  it("a capsule closed while the hand-over runs takes the capture back and shows nothing", async () => {
    const t = setup();
    const p = t.auto.sendNow();
    t.auto.dispose();
    await p;
    expect(t.sender.undone).toBe(1);
    expect(t.views).toEqual([]);
    expect(t.listeners()).toBe(0);
  });

  it("with 0 seconds sends at once", async () => {
    const t = setup();
    t.auto.start(0);
    await flush();
    expect(t.sender.sent).toBe(1);
  });

  it("sends once even when Send now is pressed twice", async () => {
    const t = setup();
    await Promise.all([t.auto.sendNow(), t.auto.sendNow()]);
    expect(t.sender.sent).toBe(1);
  });

  it("an undo pressed while the hand-over is running takes the capture back afterwards", async () => {
    const t = setup();
    const p = t.auto.sendNow();
    t.auto.undo();
    await p;
    expect(t.sender.undone).toBe(1);
    expect(t.views.at(-1)).toEqual({ kind: "undone" });
  });

  it("ignores Hold, ticks and a second start once it left the countdown", async () => {
    const t = setup();
    t.auto.start(2);
    t.auto.undo();
    t.auto.hold();
    t.auto.start(2);
    expect(t.auto.phase).toBe("undone");
    await flush();
    expect(t.sender.sent).toBe(0);
  });

  it("stops everything on dispose", () => {
    const t = setup();
    t.auto.start(3);
    t.auto.dispose();
    expect(t.timers).toHaveLength(0);
    expect(t.sender.sent).toBe(0);
  });
});
