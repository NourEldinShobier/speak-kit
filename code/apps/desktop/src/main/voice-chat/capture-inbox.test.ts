import type { ScreenLook } from "@speakkit/protocol";
import { describe, expect, it, vi } from "vite-plus/test";
import { createCaptureInbox, lookOrCapture, WAIT_MS } from "./capture-inbox";

const look = (target: string): ScreenLook => ({ image: "QUJD", width: 1, height: 1, text: "hello", ocr: "ok", target, scope: "capture" });
const setup = () => {
  const clock = { t: 1000 };
  return { clock, inbox: createCaptureInbox({ now: () => clock.t }) };
};

describe("capture inbox", () => {
  it("hands the waiting capture over once", () => {
    const { inbox } = setup();
    inbox.offer("c1", look("Screen"));
    expect(inbox.take()).toEqual({ ok: true, look: look("Screen") });
    expect(inbox.take()).toEqual({ ok: false, code: "no-capture" });
  });

  it("says no-capture when nothing was sent", () => {
    expect(setup().inbox.take()).toEqual({ ok: false, code: "no-capture" });
  });

  it("lets the sender take a capture back until it was read", () => {
    const { inbox } = setup();
    inbox.offer("c1", look("A"));
    expect(inbox.waiting("c1")).toBe(true);
    expect(inbox.retract("c1")).toBe(true);
    expect(inbox.take().ok).toBe(false);
    inbox.offer("c2", look("B"));
    inbox.take();
    expect(inbox.retract("c2")).toBe(false);
  });

  it("replaces an unread capture with a newer one, and the old one cannot be retracted", () => {
    const { inbox } = setup();
    inbox.offer("c1", look("A"));
    inbox.offer("c2", look("B"));
    expect(inbox.retract("c1")).toBe(false);
    expect(inbox.waiting("c1")).toBe(false);
    expect(inbox.take()).toMatchObject({ look: { target: "B" } });
  });

  it("forgets a capture nobody read within 15 minutes", () => {
    const { inbox, clock } = setup();
    inbox.offer("c1", look("A"));
    clock.t += WAIT_MS - 1;
    expect(inbox.waiting("c1")).toBe(true);
    clock.t += 1;
    expect(inbox.waiting("c1")).toBe(false);
    expect(inbox.retract("c1")).toBe(false);
    expect(inbox.take().ok).toBe(false);
  });

  it("tells listeners when the capture is sent, read or taken back, until they stop", () => {
    const { inbox } = setup();
    const seen = vi.fn();
    const off = inbox.onChange(seen);
    inbox.offer("c1", look("A"));
    inbox.take();
    inbox.offer("c2", look("B"));
    inbox.retract("c2");
    expect(seen).toHaveBeenCalledTimes(4);
    off();
    inbox.offer("c3", look("C"));
    expect(seen).toHaveBeenCalledTimes(4);
  });

  it("does not notify when a take finds nothing", () => {
    const { inbox } = setup();
    const seen = vi.fn();
    inbox.onChange(seen);
    inbox.take();
    inbox.retract("x");
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("look routing", () => {
  const screen = vi.fn(async () => ({ ok: false as const, code: "declined" as const }));
  const req = (scope: "window" | "screen" | "capture") => ({ session: "s", scope });

  it("answers a capture request from the inbox and never looks at the screen", async () => {
    const { inbox } = setup();
    inbox.offer("c1", look("Screen"));
    const go = lookOrCapture(inbox, screen);
    expect(await go(req("capture"), new AbortController().signal)).toMatchObject({ ok: true, look: { target: "Screen" } });
    expect(await go(req("capture"), new AbortController().signal)).toEqual({ ok: false, code: "no-capture" });
    expect(screen).not.toHaveBeenCalled();
  });

  it("passes a window or screen request on", async () => {
    const { inbox } = setup();
    const go = lookOrCapture(inbox, screen);
    expect(await go(req("window"), new AbortController().signal)).toEqual({ ok: false, code: "declined" });
    expect(screen).toHaveBeenCalledOnce();
  });
});
