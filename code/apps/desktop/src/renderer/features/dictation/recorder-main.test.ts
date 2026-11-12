import { micStatus, type MicStatus } from "@speakkit/dictation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { micEventOf } from "../../../main/dictation/service-support";
import type { RecorderCommand, RecorderEvent, RecorderMicConfig, RecorderResult } from "../../../shared/dictation/contract";

const h = vi.hoisted(() => ({
  commandHandler: undefined as ((c: RecorderCommand) => void) | undefined,
  events: [] as RecorderEvent[],
  replies: new Map<number, RecorderResult>(),
}));

vi.mock("./api", () => ({
  dictation: {
    recorder: {
      onCommand: (cb: (c: RecorderCommand) => void) => {
        h.commandHandler = cb;
        return () => undefined;
      },
      reply: (id: number, r: RecorderResult) => void h.replies.set(id, r),
      level: () => undefined,
      ready: () => undefined,
      event: (e: RecorderEvent) => void h.events.push(e),
    },
  },
}));

interface FakeTrack {
  stopped: boolean;
  ended?: () => void;
}

/** A browser with two microphones, in which every opened stream can be watched and ended like an unplugged device. */
function browser() {
  const tracks: FakeTrack[] = [];
  const opened: string[] = [];
  const listeners: Record<string, () => void> = {};
  let devices = [
    { kind: "audioinput", deviceId: "a", label: "Blue Yeti" },
    { kind: "audioinput", deviceId: "b", label: "Microphone Array (Realtek)" },
  ];
  let failOpen = false;
  const node = () => ({ connect: (n: unknown) => n });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      enumerateDevices: async () => devices,
      getUserMedia: async (c: { audio: { deviceId?: { exact: string } } }) => {
        if (failOpen) throw Object.assign(new Error("gone"), { name: "NotFoundError" });
        opened.push(c.audio.deviceId?.exact ?? "any");
        const track: FakeTrack = { stopped: false };
        tracks.push(track);
        return {
          getTracks: () => [{ stop: () => (track.stopped = true) }],
          getAudioTracks: () => [{ addEventListener: (_: string, f: () => void) => (track.ended = f) }],
        };
      },
      addEventListener: (type: string, f: () => void) => (listeners[type] = f),
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      audioWorklet = { addModule: async () => undefined };
      destination = {};
      createGain = () => ({ gain: {}, connect: (n: unknown) => n });
      createMediaStreamSource = node;
      close = async () => undefined;
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = {};
      connect = (n: unknown) => n;
    },
  );
  return {
    opened,
    live: () => tracks.filter((t) => !t.stopped).length,
    unplug: () => tracks.filter((t) => !t.stopped).forEach((t) => t.ended?.()),
    plug: () => listeners["devicechange"]?.(),
    setDevices: (d: typeof devices) => (devices = d),
    failNextOpens: (on: boolean) => (failOpen = on),
  };
}

const mic = (extra: Partial<RecorderMicConfig> = {}): RecorderMicConfig => ({ saved: "", exclusions: [], avoidBluetooth: true, keepMs: -1, ...extra });
let nextId = 1;
async function send(c: DistributiveOmit): Promise<RecorderResult> {
  const id = nextId++;
  h.commandHandler?.({ ...c, id } as RecorderCommand);
  await vi.advanceTimersByTimeAsync(0);
  return h.replies.get(id) as RecorderResult;
}
type DistributiveOmit = RecorderCommand extends infer C ? (C extends { id: number } ? Omit<C, "id"> : never) : never;

/** What the Audio card ends up showing for the events the page sent. */
const cardAfter = (events: RecorderEvent[]): MicStatus =>
  events.reduce<MicStatus>(
    (s, e) => {
      const m = micEventOf(e);
      return m ? micStatus(s, m, true) : s;
    },
    { kind: "none" },
  );

describe("microphone page", () => {
  let b: ReturnType<typeof browser>;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    h.events.length = 0;
    h.replies.clear();
    h.commandHandler = undefined;
    b = browser();
    await import("./recorder-main");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a kept-ready microphone that is unplugged and comes back ends on 'back', not on 'reconnecting'", async () => {
    await send({ op: "configure", meter: false, mic: mic() });
    expect(cardAfter(h.events)).toEqual({ kind: "ready", label: "Blue Yeti" });
    b.unplug();
    expect(cardAfter(h.events)).toEqual({ kind: "reconnecting", attempt: 1 });
    await vi.advanceTimersByTimeAsync(600);
    expect(b.live()).toBe(1);
    expect(h.events.map((e) => e.type)).not.toContain("lost");
    expect(cardAfter(h.events)).toEqual({ kind: "back", label: "Blue Yeti" });
  });

  it("says 'lost' once after six failed tries, with one reconnecting report for the whole outage", async () => {
    await send({ op: "configure", meter: false, mic: mic() });
    b.failNextOpens(true);
    b.unplug();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.events.filter((e) => e.type === "reopening")).toHaveLength(1);
    expect(cardAfter(h.events)).toEqual({ kind: "lost" });
  });

  it("configure opens the microphone for keep-ready and releases it a second after keep-ready goes off", async () => {
    await send({ op: "configure", meter: false, mic: mic() });
    expect(b.live()).toBe(1);
    await send({ op: "configure", meter: false, mic: mic({ keepMs: 0 }) });
    expect(b.live()).toBe(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(b.live()).toBe(0);
  });

  it("does not open the microphone for a released-when-idle setting without the meter", async () => {
    await send({ op: "configure", meter: false, mic: mic({ keepMs: 0 }) });
    expect(b.opened).toEqual([]);
  });

  it("opens for the meter even when released when idle, and lets go when the meter goes off", async () => {
    await send({ op: "configure", meter: true, mic: mic({ keepMs: 0 }) });
    expect(b.live()).toBe(1);
    await send({ op: "configure", meter: false, mic: mic({ keepMs: 0 }) });
    await vi.advanceTimersByTimeAsync(1100);
    expect(b.live()).toBe(0);
  });

  it("picking another microphone moves the meter to it", async () => {
    await send({ op: "configure", meter: true, mic: mic({ keepMs: 0 }) });
    await send({ op: "configure", meter: true, mic: mic({ keepMs: 0, saved: "b" }) });
    expect(b.opened).toEqual(["a", "b"]);
    expect(b.live()).toBe(1);
  });

  it("a device change while the meter is on and keep-ready is off reopens the microphone", async () => {
    await send({ op: "configure", meter: true, mic: mic({ keepMs: 0 }) });
    b.plug();
    await vi.advanceTimersByTimeAsync(10);
    expect(b.live()).toBe(1);
    expect(b.opened).toHaveLength(2);
  });

  it("reports a refused microphone from configure and stops pretending the meter is on", async () => {
    b.failNextOpens(true);
    const r = await send({ op: "configure", meter: true, mic: mic({ keepMs: 0 }) });
    expect(r).toEqual({ ok: false, code: "mic-missing" });
  });
});
