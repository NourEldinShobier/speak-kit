import { describe, expect, it, vi } from "vitest";
import type { CaptureRecord } from "../store";
import type { SendView } from "./auto-send";
import { SendController } from "./controller";
import { createCaptureInbox } from "../../voice-chat/capture-inbox";

const record = (id: string): CaptureRecord => ({
  id,
  kind: "recording",
  title: "Screen",
  at: 1,
  dir: id,
  bytes: 1,
  media: "video.webm",
  frames: [],
  sheet: "sheet.jpg",
  chips: ["saved"],
  words: [{ text: "hi", startMs: 0, endMs: 1 }],
});

function setup(pic: { base64: string; width: number; height: number } | null = { base64: "QUJD", width: 4, height: 3 }) {
  const views: (SendView | undefined)[] = [];
  const timers: (() => void)[] = [];
  const inbox = createCaptureInbox({ now: () => 1 });
  const markSent = vi.fn();
  const failed = vi.fn();
  const c = new SendController({
    inbox,
    picture: async () => pic ?? undefined,
    markSent,
    show: (v) => views.push(v),
    failed,
    schedule: (fn) => (timers.push(fn), () => void timers.splice(timers.indexOf(fn), 1)),
  });
  return { c, inbox, views, markSent, failed, timers };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("send controller", () => {
  it("offers the capture to the inbox after the countdown and marks it sent", async () => {
    const t = setup();
    t.c.begin(record("c1"), 1);
    t.timers.shift()?.();
    await flush();
    expect(t.inbox.waiting("c1")).toBe(true);
    expect(t.markSent).toHaveBeenCalledWith("c1");
    expect(t.views.at(-1)).toEqual({ kind: "sent", destination: "Voice chat", canUndo: true });
  });

  it("reads like the voice chat would: picture, words, scope capture", async () => {
    const t = setup();
    t.c.begin(record("c1"), 0);
    await flush();
    expect(t.inbox.take()).toEqual({ ok: true, look: { image: "QUJD", width: 4, height: 3, text: "hi", ocr: "ok", target: "Screen", scope: "capture" } });
    expect(t.views.at(-1)).toEqual({ kind: "sent", destination: "Voice chat", canUndo: false });
  });

  it("takes the capture back on Undo before it was read", async () => {
    const t = setup();
    t.c.begin(record("c1"), 0);
    await flush();
    t.c.undo();
    expect(t.inbox.waiting("c1")).toBe(false);
    expect(t.views.at(-1)).toEqual({ kind: "undone" });
  });

  it("does not offer anything when Undo comes inside the countdown", async () => {
    const t = setup();
    t.c.begin(record("c1"), 3);
    t.c.undo();
    await flush();
    expect(t.inbox.waiting("c1")).toBe(false);
    expect(t.markSent).not.toHaveBeenCalled();
  });

  it("holds, then sends on Send now", async () => {
    const t = setup();
    t.c.begin(record("c1"), 3);
    t.c.hold();
    expect(t.views.at(-1)).toEqual({ kind: "countdown", secondsLeft: 3, held: true });
    t.c.sendNow();
    await flush();
    expect(t.inbox.waiting("c1")).toBe(true);
  });

  it("fails when the picture cannot be read, and sends nothing", async () => {
    const t = setup(null);
    t.c.begin(record("c1"), 0);
    await flush();
    expect(t.failed).toHaveBeenCalledOnce();
    expect(t.inbox.waiting("c1")).toBe(false);
  });

  it("a new begin stops the running countdown of the earlier capture", async () => {
    const t = setup();
    t.c.begin(record("c1"), 3);
    t.c.begin(record("c2"), 0);
    await flush();
    expect(t.timers).toHaveLength(0);
    expect(t.inbox.waiting("c2")).toBe(true);
    expect(t.inbox.waiting("c1")).toBe(false);
  });

  it("cancel stops a countdown without sending", async () => {
    const t = setup();
    t.c.begin(record("c1"), 3);
    t.c.cancel();
    await flush();
    expect(t.timers).toHaveLength(0);
    expect(t.inbox.waiting("c1")).toBe(false);
  });

  it("ignores the buttons when nothing is being sent", () => {
    const t = setup();
    expect(() => (t.c.hold(), t.c.sendNow(), t.c.undo(), t.c.cancel())).not.toThrow();
  });
});
