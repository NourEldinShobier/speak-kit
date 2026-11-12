import { describe, expect, it } from "vitest";
import { createCountdown } from "./index";

describe("send countdown", () => {
  it("counts down from three and sends once when the time is up", () => {
    let sent = 0;
    const c = createCountdown(0, () => sent++);
    expect(c.state).toEqual({ kind: "counting", secondsLeft: 3 });
    c.tick(1000);
    expect(c.state).toEqual({ kind: "counting", secondsLeft: 2 });
    c.tick(2999);
    expect(c.state).toEqual({ kind: "counting", secondsLeft: 1 });
    c.tick(3000);
    c.tick(4000);
    expect(c.state).toEqual({ kind: "sent" });
    expect(sent).toBe(1);
  });
  it("undo inside the countdown sends nothing", () => {
    let sent = 0;
    const c = createCountdown(0, () => sent++);
    expect(c.undo()).toEqual({ ok: true });
    c.tick(10_000);
    expect(c.state).toEqual({ kind: "undone" });
    expect(sent).toBe(0);
  });
  it("undo after the send is refused with a reason, because Voice chat cannot take it back", () => {
    const c = createCountdown(0, () => {});
    c.tick(3000);
    expect(c.undo()).toEqual({ ok: false, reason: "cannot-retract" });
    expect(c.state).toEqual({ kind: "sent" });
  });
  it("undo after the send works when the target can retract", () => {
    const c = createCountdown(0, () => {}, { canRetract: true });
    c.tick(3000);
    expect(c.undo()).toEqual({ ok: true });
  });
  it("hold pauses the clock and release resumes with the time that was left", () => {
    let sent = 0;
    const c = createCountdown(0, () => sent++);
    c.tick(1000);
    c.hold(1000);
    c.tick(30_000);
    expect(c.state).toEqual({ kind: "held", secondsLeft: 2 });
    expect(sent).toBe(0);
    c.release(30_000);
    c.tick(31_999);
    expect(sent).toBe(0);
    c.tick(32_000);
    expect(sent).toBe(1);
  });
  it("a hold ends after two minutes with nothing sent", () => {
    let sent = 0;
    const c = createCountdown(0, () => sent++);
    c.hold(500);
    c.tick(500 + 119_999);
    expect(c.state.kind).toBe("held");
    c.tick(500 + 120_000);
    expect(c.state).toEqual({ kind: "expired" });
    expect(sent).toBe(0);
    expect(c.undo()).toEqual({ ok: false, reason: "not-active" });
  });
  it("send now works from a hold and only once", () => {
    let sent = 0;
    const c = createCountdown(0, () => sent++);
    c.hold(100);
    c.sendNow();
    c.sendNow();
    expect(sent).toBe(1);
  });
  it("hold and release do nothing outside their state", () => {
    const c = createCountdown(0, () => {});
    c.release(10);
    expect(c.state.kind).toBe("counting");
    c.tick(3000);
    c.hold(3100);
    expect(c.state).toEqual({ kind: "sent" });
  });
});
