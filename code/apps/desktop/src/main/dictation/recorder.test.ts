import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vite-plus/test";
import type { IpcMain, WebContents } from "electron";
import { REC_COMMAND, REC_LEVEL, REC_READY, REC_REPLY } from "../../shared/dictation/channels";
import type { RecorderCommand } from "../../shared/dictation/contract";
import { createRecorderHost, type RecorderPage } from "./recorder";

/** The microphone page as the host sees it: commands sent to it are collected, and the test answers them. */
function setup(timeoutMs = 200) {
  const ipc = new EventEmitter();
  const contents = Object.assign(new EventEmitter(), { sent: [] as RecorderCommand[], send: (_ch: string, cmd: RecorderCommand) => void contents.sent.push(cmd) });
  const pages: RecorderPage[] = [];
  let destroyed = false;
  const open = () => {
    const page: RecorderPage = {
      contents: contents as unknown as WebContents,
      destroy: () => ((destroyed = true), contents.emit("destroyed")),
      get destroyed() {
        return destroyed;
      },
    };
    pages.push(page);
    return page;
  };
  const levels: number[] = [];
  const host = createRecorderHost({ ipcMain: ipc as unknown as IpcMain, open, onLevel: (n) => levels.push(n), timeoutMs });
  const from = (channel: string, ...args: unknown[]) => ipc.emit(channel, { sender: contents }, ...args);
  const reset = () => ((destroyed = false), (contents.sent.length = 0));
  return { host, contents, from, levels, pages, ipc, reset, isDestroyed: () => destroyed };
}

describe("recorder host", () => {
  it("opens the page on first use and waits for it to say it is ready", async () => {
    const s = setup();
    const started = s.host.start({ prerollMs: 450 });
    s.from(REC_READY);
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1));
    expect(s.contents.sent[0]).toMatchObject({ op: "start", prerollMs: 450 });
    s.from(REC_REPLY, s.contents.sent[0]!.id, { ok: true });
    expect(await started).toEqual({ ok: true });
    expect(s.pages).toHaveLength(1);
  });

  it("reports a microphone problem with its code", async () => {
    const s = setup();
    const started = s.host.start({ prerollMs: 0 });
    s.from(REC_READY);
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1));
    s.from(REC_REPLY, s.contents.sent[0]!.id, { ok: false, code: "mic-denied" });
    expect(await started).toEqual({ ok: false, code: "mic-denied" });
  });

  it("returns the recording as a clip", async () => {
    const s = setup();
    s.from(REC_READY);
    void s.host.prepare();
    s.from(REC_READY);
    const stopped = s.host.stop();
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1));
    const pcm = new Float32Array([0.1, -0.4]);
    s.from(REC_REPLY, s.contents.sent[0]!.id, { ok: true, pcm, sampleRate: 16_000, peak: 0.4, interrupted: true });
    expect(await stopped).toEqual({ pcm, sampleRate: 16_000, peak: 0.4, interrupted: true });
  });

  it("refuses a reply from anything but its own page, or in the wrong shape", async () => {
    const s = setup(80);
    void s.host.prepare();
    s.from(REC_READY);
    const started = s.host.start({ prerollMs: 0 });
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1));
    const id = s.contents.sent[0]!.id;
    s.ipc.emit(REC_REPLY, { sender: {} }, id, { ok: true });
    s.from(REC_REPLY, id, { ok: "yes" });
    s.from(REC_REPLY, "not a number", { ok: true });
    expect(await started).toEqual({ ok: false, code: "mic-failed" }); // nothing valid arrived before the deadline
  });

  it("a page that never answers ends in mic-failed, not a hang", async () => {
    const s = setup(50);
    s.from(REC_READY);
    void s.host.prepare();
    s.from(REC_READY);
    expect(await s.host.start({ prerollMs: 0 })).toEqual({ ok: false, code: "mic-failed" });
  });

  it("a page that never loads is dropped, so the next recording opens a new one", async () => {
    const s = setup(120);
    expect(await s.host.start({ prerollMs: 0 })).toEqual({ ok: false, code: "mic-failed" });
    expect(s.isDestroyed()).toBe(true);
    s.reset();
    const second = s.host.start({ prerollMs: 0 });
    s.from(REC_READY);
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1), { interval: 5 });
    s.from(REC_REPLY, s.contents.sent[0]!.id, { ok: true });
    expect(await second).toEqual({ ok: true });
    expect(s.pages).toHaveLength(2);
  });

  it("stop throws when the page returns no audio", async () => {
    const s = setup();
    void s.host.prepare();
    s.from(REC_READY);
    const stopped = s.host.stop();
    await vi.waitFor(() => expect(s.contents.sent).toHaveLength(1));
    s.from(REC_REPLY, s.contents.sent[0]!.id, { ok: true });
    await expect(stopped).rejects.toThrow("no audio");
  });

  it("passes the level on, clamped, and only from its own page", async () => {
    const s = setup();
    void s.host.prepare();
    s.from(REC_READY);
    s.from(REC_LEVEL, 0.5);
    s.from(REC_LEVEL, 7);
    s.from(REC_LEVEL, Number.NaN);
    s.from(REC_LEVEL, "loud");
    s.ipc.emit(REC_LEVEL, { sender: {} }, 0.9);
    expect(s.levels).toEqual([0.5, 1]);
  });

  it("close destroys the page and owns() follows it", async () => {
    const s = setup();
    void s.host.prepare();
    expect(s.host.owns(s.contents as unknown as WebContents)).toBe(true);
    s.host.close();
    expect(s.isDestroyed()).toBe(true);
    expect(s.host.owns(s.contents as unknown as WebContents)).toBe(false);
  });

  it("dispose stops listening", () => {
    const s = setup();
    s.host.dispose();
    expect(s.ipc.listenerCount(REC_READY) + s.ipc.listenerCount(REC_REPLY) + s.ipc.listenerCount(REC_LEVEL)).toBe(0);
  });

  it("sends the commands on the command channel", async () => {
    const s = setup();
    const spy = vi.spyOn(s.contents, "send");
    void s.host.prepare();
    s.from(REC_READY);
    void s.host.discard();
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(REC_COMMAND, expect.objectContaining({ op: "discard" })));
  });
});
