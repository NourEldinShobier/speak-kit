import { describe, expect, it } from "vite-plus/test";
import { STREAM_LIMITS } from "@speakkit/protocol";
import { AutomationFault } from "../automation";
import { HttpError } from "../http";
import { StreamSessions, type Heard, type StreamEvent, type StreamsHost } from "./sessions";

const RATE = 16_000;
const bytes = (ms: number, amp: number) => Buffer.from(new Int16Array((RATE * ms) / 1000).fill(amp).buffer);
const phrase = () => Buffer.concat([bytes(1500, 9000), bytes(720, 0)]);

function rig(script: (call: number) => Heard = (n) => ({ ok: true, text: ` words ${n} `, speech: true })) {
  let clock = 1000;
  const calls: { samples: number; language: string }[] = [];
  const host: StreamsHost = {
    transcribe: async (pcm, language) => (calls.push({ samples: pcm.length, language }), script(calls.length)),
    process: (text, language) => `${text.toUpperCase()}@${language}`,
  };
  const sessions = new StreamSessions(host, { now: () => clock, retryMs: 1 });
  return { sessions, calls, tick: (ms: number) => void (clock += ms) };
}
const message = async (p: () => unknown) => {
  try {
    await p();
  } catch (e) {
    return (e as Error).message;
  }
  return "no error";
};
const code = async (p: () => unknown) => {
  try {
    await p();
  } catch (e) {
    if (e instanceof AutomationFault) return e.code;
    return e instanceof HttpError ? e.status : String(e);
  }
  return "no error";
};

describe("a live stream", () => {
  it("sends each finished segment as an event, then the whole text on finish", async () => {
    const { sessions, calls } = rig();
    const { id, owner } = sessions.create({});
    const events: StreamEvent[] = [];
    sessions.subscribe(id, owner, (e) => events.push(e));
    sessions.audio(id, owner, phrase());
    sessions.audio(id, owner, Buffer.concat([bytes(1200, 9000), bytes(800, 0)]));
    const result = await sessions.finish(id, owner);
    expect(result).toEqual({
      text: "words 1 words 2",
      segments: [
        { n: 1, text: "words 1" },
        { n: 2, text: "words 2" },
      ],
    });
    expect(events.map((e) => e.type)).toEqual(["segment", "segment", "done"]);
    expect(calls).toEqual([
      { samples: 35_520, language: "auto" },
      { samples: 30_720, language: "auto" },
    ]);
  });

  it("adds times only when asked, and the processed text only when asked", async () => {
    const plain = rig();
    const a = plain.sessions.create({});
    plain.sessions.audio(a.id, a.owner, phrase());
    expect(Object.keys((await plain.sessions.finish(a.id, a.owner)).segments[0]!)).toEqual(["n", "text"]);
    const full = rig();
    const b = full.sessions.create({ timestamps: true, process: true, language: "en" });
    full.sessions.audio(b.id, b.owner, phrase());
    expect(await full.sessions.finish(b.id, b.owner)).toEqual({
      text: "words 1",
      processed: "WORDS 1@en",
      segments: [{ n: 1, text: "words 1", startMs: 0, endMs: 2220 }],
    });
  });

  it("finish sends the segment still open, and a pause with no words says nothing", async () => {
    const { sessions } = rig((n) => (n === 1 ? { ok: true, text: "", speech: false } : { ok: true, text: "tail", speech: true }));
    const { id, owner } = sessions.create({});
    sessions.audio(id, owner, phrase());
    sessions.audio(id, owner, bytes(600, 9000));
    expect(await sessions.finish(id, owner)).toEqual({ text: "tail", segments: [{ n: 1, text: "tail" }] });
  });

  it("waits while dictation holds the engine, then goes on", async () => {
    const { sessions, calls } = rig((n) => (n < 3 ? { ok: false, code: "busy" } : { ok: true, text: "later", speech: true }));
    const { id, owner } = sessions.create({});
    sessions.audio(id, owner, phrase());
    expect((await sessions.finish(id, owner)).text).toBe("later");
    expect(calls.length).toBe(3);
  });

  it("fails the stream with the engine's reason and tells the next call", async () => {
    const { sessions } = rig(() => ({ ok: false, code: "model_missing" }));
    const { id, owner } = sessions.create({});
    const events: StreamEvent[] = [];
    sessions.subscribe(id, owner, (e) => events.push(e));
    sessions.audio(id, owner, phrase());
    expect(await code(() => sessions.finish(id, owner))).toBe("failed");
    expect(events).toEqual([{ type: "failed", code: "model_missing", message: "The speech model is not downloaded yet." }]);
    expect(sessions.open).toBe(0);
  });
});

describe("stream details", () => {
  it("gives a late listener what was said so far and why it failed, and builds ids and owners of the right length", async () => {
    const { sessions } = rig();
    const { id, owner } = sessions.create({});
    expect([id.length, owner.length]).toEqual([12, 48]);
    sessions.audio(id, owner, phrase());
    await new Promise((r) => setTimeout(r, 5));
    const late: StreamEvent[] = [];
    sessions.subscribe(id, owner, (e) => late.push(e));
    expect(late).toEqual([{ type: "segment", segment: { n: 1, text: "words 1" } }]);
    const broken = rig(() => ({ ok: false, code: "failed" }));
    const b = broken.sessions.create({});
    broken.sessions.audio(b.id, b.owner, phrase());
    await new Promise((r) => setTimeout(r, 5));
    const seen: StreamEvent[] = [];
    broken.sessions.subscribe(b.id, b.owner, (e) => seen.push(e));
    expect(seen).toEqual([{ type: "failed", code: "failed", message: "The speech engine failed on a segment." }]);
    expect(await message(() => broken.sessions.audio(b.id, b.owner, phrase()))).toBe("The speech engine failed on a segment.");
  });

  it("asks the engine 120 times while dictation holds it, then fails with a sentence", async () => {
    const { sessions, calls } = rig(() => ({ ok: false, code: "busy" }));
    const { id, owner } = sessions.create({});
    sessions.audio(id, owner, phrase());
    expect(await message(() => sessions.finish(id, owner))).toBe("Dictation kept the speech engine busy for too long.");
    expect(calls.length).toBe(120);
  });

  it("says what is wrong in plain sentences", async () => {
    const { sessions } = rig();
    const { id, owner } = sessions.create({});
    sessions.create({});
    expect(await message(() => sessions.create({}))).toBe("at most 2 streams at once");
    expect(await message(() => sessions.audio(id, owner, Buffer.alloc(3)))).toBe("audio is 16-bit samples: an even, non-zero number of bytes");
    expect(await message(() => sessions.audio(id, "x", phrase()))).toBe("this stream belongs to another program");
    expect(await message(() => sessions.audio("none", owner, phrase()))).toBe("no such stream");
  });

  it("takes exactly 30 minutes of audio and refuses one sample more, and a lease of exactly 30 s is not over", async () => {
    const { sessions, tick } = rig(() => ({ ok: true, text: "", speech: false }));
    const { id, owner } = sessions.create({});
    const chunk = Buffer.alloc(1024 * 1024);
    const full = Math.floor(STREAM_LIMITS.maxStreamBytes / chunk.length);
    for (let i = 0; i < full; i++) sessions.audio(id, owner, chunk);
    const rest = STREAM_LIMITS.maxStreamBytes - full * chunk.length;
    expect(sessions.audio(id, owner, Buffer.alloc(rest))).toBe(rest);
    expect(await message(() => sessions.audio(id, owner, Buffer.alloc(2)))).toBe("a stream carries at most 30 minutes of audio");
    tick(STREAM_LIMITS.leaseMs);
    expect(sessions.sweep()).toBe(0);
    tick(1);
    expect(sessions.sweep()).toBe(1);
  });

  it("a cancelled stream is gone, and so is a finished one", async () => {
    const { sessions } = rig();
    const a = sessions.create({});
    sessions.audio(a.id, a.owner, phrase());
    sessions.cancel(a.id, a.owner);
    expect(await code(() => sessions.cancel(a.id, a.owner))).toBe(404);
    const b = sessions.create({});
    await sessions.finish(b.id, b.owner);
    expect(sessions.open).toBe(0);
  });
});

describe("ownership and limits", () => {
  it("refuses another program's call, an unknown stream and a third stream", async () => {
    const { sessions } = rig();
    const a = sessions.create({});
    sessions.create({});
    expect(await code(() => sessions.audio(a.id, "nope", phrase()))).toBe("permission_denied");
    expect(await code(() => sessions.audio(a.id, undefined, phrase()))).toBe("permission_denied");
    expect(await code(() => sessions.audio("missing", a.owner, phrase()))).toBe(404);
    expect(await code(() => sessions.create({}))).toBe("queue_full");
    sessions.cancel(a.id, a.owner);
    expect(sessions.open).toBe(1);
    expect(await code(() => sessions.create({}))).toBe("no error");
  });

  it("refuses audio that is not whole 16-bit samples and audio past 30 minutes", async () => {
    const { sessions } = rig();
    const { id, owner } = sessions.create({});
    expect(await code(() => sessions.audio(id, owner, Buffer.alloc(3)))).toBe("invalid_input");
    expect(await code(() => sessions.audio(id, owner, Buffer.alloc(0)))).toBe("invalid_input");
    const chunk = Buffer.alloc(STREAM_LIMITS.maxChunkBytes);
    const n = Math.floor(STREAM_LIMITS.maxStreamBytes / chunk.length);
    for (let i = 0; i < n; i++) sessions.audio(id, owner, chunk);
    expect(await code(() => sessions.audio(id, owner, chunk))).toBe("too_large");
  });

  it("drops a stream nobody feeds for the lease, and a heartbeat or audio keeps it", () => {
    const { sessions, tick } = rig();
    const idle = sessions.create({});
    const kept = sessions.create({});
    tick(STREAM_LIMITS.leaseMs - 1);
    sessions.heartbeat(kept.id, kept.owner);
    tick(2);
    expect(sessions.sweep()).toBe(1);
    expect(sessions.open).toBe(1);
    expect(sessions.sweep()).toBe(0);
    expect(() => sessions.heartbeat(idle.id, idle.owner)).toThrow(HttpError);
    sessions.dispose();
    expect(sessions.open).toBe(0);
  });
});
