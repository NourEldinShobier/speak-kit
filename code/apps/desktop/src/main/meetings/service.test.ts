import { DiskFullError, type Fs } from "@speakkit/transcripts";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../../shared/schemas";
import type { CapsuleView, Push, RecResult } from "../../shared/meetings/contract";
import type { Ctx } from "../context";
import type { Stt } from "../dictation/stt";
import type { CapsuleWindow } from "./capsule";
import type { RecorderPort } from "./hosts";
import type { MeetingsPlatform } from "./platform/types";
import { createMeetingsService, type MeetingsPorts, type MeetingsService } from "./service";

class MemFs implements Fs {
  files = new Map<string, Uint8Array>();
  full = false;
  async read(f: string) {
    return this.files.get(f.replaceAll("\\", "/"))?.slice();
  }
  async write(f: string, d: Uint8Array | string) {
    if (this.full) throw new DiskFullError();
    this.files.set(f.replaceAll("\\", "/"), typeof d === "string" ? new TextEncoder().encode(d) : d.slice());
  }
  async append(f: string, d: Uint8Array) {
    if (this.full) throw new DiskFullError();
    const k = f.replaceAll("\\", "/");
    const old = this.files.get(k) ?? new Uint8Array(0);
    const n = new Uint8Array(old.length + d.length);
    n.set(old);
    n.set(d, old.length);
    this.files.set(k, n);
  }
  async remove(f: string) {
    this.files.delete(f.replaceAll("\\", "/"));
  }
  async rename(a: string, b: string) {
    const v = this.files.get(a);
    if (v) this.files.set(b, v);
    this.files.delete(a);
  }
  async exists(f: string) {
    return this.files.has(f.replaceAll("\\", "/"));
  }
}

class FakeRecorder implements RecorderPort {
  starts: { micDevice: string; system: boolean }[] = [];
  stops = 0;
  reopens = 0;
  startResult: RecResult = { ok: true, system: "on" };
  reopenResult: RecResult = { ok: true, system: "on" };
  chunk: Parameters<RecorderPort["onChunk"]>[0] = () => {};
  level: Parameters<RecorderPort["onLevel"]>[0] = () => {};
  ended: Parameters<RecorderPort["onEnded"]>[0] = () => {};
  async start(o: { micDevice: string; system: boolean }) {
    this.starts.push(o);
    return this.startResult;
  }
  async stop() {
    this.stops++;
  }
  async reopenSystem() {
    this.reopens++;
    return this.reopenResult;
  }
  async devices(): Promise<RecResult> {
    return { ok: true, devices: { inputs: [], outputs: [{ id: "d", label: "Speakers", isDefault: true }] } };
  }
  onChunk(cb: Parameters<RecorderPort["onChunk"]>[0]) {
    this.chunk = cb;
  }
  onLevel(cb: Parameters<RecorderPort["onLevel"]>[0]) {
    this.level = cb;
  }
  onEnded(cb: Parameters<RecorderPort["onEnded"]>[0]) {
    this.ended = cb;
  }
  dispose() {}
}

const tone = (sec: number) => Int16Array.from({ length: sec * 16000 }, (_, i) => Math.round(Math.sin((i / 16000) * 2 * Math.PI * 440) * 8000));
const zoomCall = { micUsers: [{ pid: 10, exe: "zoom" }], windows: [{ pid: 10, exe: "zoom", title: "Zoom Meeting" }] };
const slackCall = { micUsers: [{ pid: 20, exe: "slack" }], windows: [{ pid: 20, exe: "slack", title: "Huddle" }] };
const quiet = { micUsers: [], windows: [] };

function harness(o: { texts?: string[] } = {}) {
  const config = parseConfig({});
  const fs = new MemFs();
  const recorder = new FakeRecorder();
  const probe = { current: quiet as { micUsers: { pid: number; exe: string }[]; windows: { pid: number; exe: string; title: string }[] } };
  const pushes: Push[] = [];
  const revealed: string[] = [];
  const opened: string[] = [];
  const registered: string[] = [];
  const activity: string[] = [];
  const texts = o.texts ?? ["we ship on friday", "sounds good to me"];
  const platform: MeetingsPlatform = {
    capabilities: () => ({ platform: "win32", systemAudio: "available", callDetection: "available", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" }),
    probe: async () => probe.current,
    callAppMic: async () => null,
  };
  const win = { at: { x: 0, y: 0 }, shown: false, through: false, sent: [] as (CapsuleView | null)[], destroyed: false };
  const window: CapsuleWindow = {
    setPosition: (x, y) => void (win.at = { x, y }),
    position: () => win.at,
    setClickThrough: (on) => void (win.through = on),
    send: (v) => void win.sent.push(v),
    show: () => void (win.shown = true),
    hide: () => void (win.shown = false),
    destroy: () => void (win.destroyed = true),
    get destroyed() {
      return win.destroyed;
    },
  };
  let t = new Date(2026, 10, 3, 14, 5).getTime();
  let id = 0;
  const stt = {
    status: () => ({ state: "ready" }),
    downloaded: async () => true,
    warm: async () => {},
    unload: async () => {},
    transcribe: async () => ({ text: texts.shift() ?? "", speech: true }),
  } as unknown as Stt;
  const ctx = { config, saveConfig: () => {}, publish: () => ({}), addActivity: (_k: string, title: string) => void activity.push(title), showWindow: () => {}, sendUi: () => {} } as unknown as Ctx;
  const ports: MeetingsPorts = {
    dataDir: "/data",
    documentsDir: "/docs",
    fs,
    stt,
    model: () => config.dictation.model,
    dictationBusy: () => false,
    platform,
    recorder,
    capsule: { open: () => window, displays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }], cursor: () => ({ x: 5, y: 5 }) },
    complete: async () => ({ ok: false, code: "no-key" }),
    keySaved: async () => false,
    writerName: "OpenAI",
    vocabulary: () => [],
    clipboard: { writeText: () => {} },
    shell: { reveal: (f) => void revealed.push(f), openFolder: async () => {} },
    dialog: { pickFolder: async () => null },
    shortcut: { register: (a) => (registered.push(a), true), unregister: () => {} },
    devices: async () => ({ inputs: [], outputs: [{ id: "d", label: "Speakers", isDefault: true }] }),
    push: (p) => void pushes.push(p),
    changed: () => {},
    openMeeting: (m) => void opened.push(m),
    now: () => t,
    sleep: async (ms) => void (t += ms),
    newId: () => `m${++id}`,
    pollMs: 1e9,
    tickMs: 1e9,
  };
  const svc: MeetingsService = createMeetingsService(ctx, ports);
  const advance = (ms: number) => void (t += ms);
  return { svc, config, fs, recorder, probe, pushes, revealed, opened, registered, activity, advance, win };
}

const settled = async (h: ReturnType<typeof harness>, id: string) => {
  const core = await h.svc.core;
  for (let i = 0; i < 300; i++) {
    const d = await core.get(id);
    if (d && (d.status === "done" || d.status === "failed") && d.notes.state !== "writing") return d;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("meeting did not settle");
};

describe("calls and the offer", () => {
  it("offers to record a call and keeps the offer across polls until it is answered", async () => {
    const h = harness();
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "offer", app: "Zoom" });
    for (let i = 0; i < 5; i++) {
      h.advance(30_000);
      await h.svc.pollNow();
    }
    expect(h.svc.capsuleView()).toMatchObject({ kind: "offer", app: "Zoom" });
    expect(h.win.shown).toBe(true);
  });

  it("takes the offer away when the call ends and offers again for the next call", async () => {
    const h = harness();
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    h.probe.current = quiet;
    h.advance(10_000);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toBeNull();
    h.probe.current = zoomCall;
    h.advance(10_000);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "offer" });
  });

  it("snoozes this call only", async () => {
    const h = harness();
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    const offer = h.svc.capsuleView() as Extract<CapsuleView, { kind: "offer" }>;
    await h.svc.act({ type: "dismiss", sessionId: offer.sessionId, how: "this-call" });
    expect(h.svc.capsuleView()).toBeNull();
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toBeNull();
    h.probe.current = quiet;
    h.advance(10_000);
    await h.svc.pollNow();
    h.probe.current = zoomCall;
    h.advance(10_000);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "offer" });
  });

  it("never offers for an app set to Never offer, and records at once for Always record", async () => {
    const h = harness();
    h.config.meetings.policies = { zoom: "never", slack: "always" };
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toBeNull();
    h.probe.current = slackCall;
    await h.svc.pollNow();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.recorder.starts).toHaveLength(1);
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording", app: "Slack huddles" });
  });

  it("does nothing while the feature is off", async () => {
    const h = harness();
    h.config.meetings.enabled = false;
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toBeNull();
  });

  it("does not offer a second call while one is being recorded", async () => {
    const h = harness();
    h.config.meetings.policies = { zoom: "always" };
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    await new Promise((r) => setTimeout(r, 10));
    h.probe.current = { micUsers: [...zoomCall.micUsers, ...slackCall.micUsers], windows: [...zoomCall.windows, ...slackCall.windows] };
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording" });
    expect(h.recorder.starts).toHaveLength(1);
  });
});

describe("recording a call", () => {
  async function record(h: ReturnType<typeof harness>) {
    h.probe.current = zoomCall;
    await h.svc.pollNow();
    const offer = h.svc.capsuleView() as Extract<CapsuleView, { kind: "offer" }>;
    await h.svc.act({ type: "record", sessionId: offer.sessionId });
    const core = await h.svc.core;
    const id = core.list()[0]!.id;
    h.recorder.chunk("you", tone(3), 0);
    h.recorder.chunk("them", tone(3), 0);
    h.advance(3000);
    return { core, id };
  }

  it("records both tracks from the offer, then transcribes as You and Them and tells the capsule", async () => {
    const h = harness();
    const { id } = await record(h);
    expect(h.recorder.starts).toEqual([{ micDevice: "", system: true }]);
    expect(h.svc.phase()).toBe("recording");
    await h.svc.stop();
    expect(h.recorder.stops).toBe(1);
    const d = await settled(h, id);
    expect(d.lines.map((l) => [l.who, l.text])).toEqual([
      ["You", "we ship on friday"],
      ["Them", "sounds good to me"],
    ]);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "saved", id });
    await h.svc.act({ type: "show-folder", id });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.revealed.length).toBe(1);
  });

  it("counts down when the call ends, then stops by itself", async () => {
    const h = harness();
    const { id } = await record(h);
    h.probe.current = quiet;
    h.advance(10_000);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toEqual({ kind: "ending", sessionId: expect.any(String), app: "Zoom", secondsLeft: 15 });
    for (let i = 0; i < 14; i++) await h.svc.tickNow();
    await new Promise((r) => setTimeout(r, 5));
    expect(h.recorder.stops).toBe(0);
    await h.svc.tickNow();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.recorder.stops).toBe(1);
    expect((await settled(h, id)).status).toBe("done");
  });

  it("keeps recording when the person says the meeting goes on", async () => {
    const h = harness();
    await record(h);
    h.probe.current = quiet;
    h.advance(10_000);
    await h.svc.pollNow();
    await h.svc.act({ type: "keep" });
    for (let i = 0; i < 20; i++) await h.svc.tickNow();
    expect(h.recorder.stops).toBe(0);
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording" });
  });

  it("asks instead of counting down when stop-on-end is off", async () => {
    const h = harness();
    h.config.meetings.stopWhenEnds = false;
    await record(h);
    h.probe.current = quiet;
    h.advance(10_000);
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "ending", secondsLeft: null });
    for (let i = 0; i < 40; i++) await h.svc.tickNow();
    expect(h.recorder.stops).toBe(0);
    await h.svc.act({ type: "stop" });
    expect(h.recorder.stops).toBe(1);
  });

  it("starts by hand with no call and stops by hand", async () => {
    const h = harness();
    const r = await h.svc.start();
    expect(r).toMatchObject({ ok: true });
    h.recorder.chunk("you", tone(2), 0);
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording", app: "Meeting" });
    await h.svc.stop();
    expect(h.svc.phase()).not.toBe("recording");
  });

  it("leaves no meeting behind when the microphone is refused", async () => {
    const h = harness();
    h.recorder.startResult = { ok: false, code: "mic-denied" };
    const r = (await h.svc.start()) as { ok: boolean; failure?: { message: string } };
    expect(r.ok).toBe(false);
    expect(r.failure?.message).toContain("microphone");
    expect((await h.svc.core).list()).toEqual([]);
    expect(h.svc.phase()).toBe("ready");
  });

  it("says so when the system's sound could not be recorded, and keeps the microphone track", async () => {
    const h = harness();
    h.recorder.startResult = { ok: true, system: "unavailable" };
    await h.svc.start();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording", system: "unavailable", note: expect.stringContaining("only your microphone") });
  });

  it("never reopens the system's sound for a glitch, and at most every 5 s for a stream that ended", async () => {
    const h = harness();
    await h.svc.start();
    h.recorder.ended("them");
    await new Promise((r) => setTimeout(r, 5));
    h.recorder.ended("them");
    await new Promise((r) => setTimeout(r, 5));
    expect(h.recorder.reopens).toBe(1);
    h.advance(6000);
    h.recorder.ended("them");
    await new Promise((r) => setTimeout(r, 5));
    expect(h.recorder.reopens).toBe(2);
  });

  it("ends the recording with a notice when the microphone goes away, keeping what was recorded", async () => {
    const h = harness();
    await h.svc.start();
    h.recorder.chunk("you", tone(2), 0);
    h.recorder.ended("you");
    await new Promise((r) => setTimeout(r, 30));
    expect(h.activity).toContain("Meeting recording stopped");
    expect(h.recorder.stops).toBe(1);
    expect((await h.svc.core).list()[0]!.audioBytes).toBeGreaterThan(0);
  });

  it("stops and says so when the disk is full", async () => {
    const h = harness();
    await h.svc.start();
    h.fs.full = true;
    h.recorder.chunk("you", tone(2), 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.recorder.stops).toBe(1);
    expect(h.pushes.some((p) => p.notice?.includes("disk is full"))).toBe(true);
  });

  it("warns once about a microphone that gives nothing while the other side speaks", async () => {
    const h = harness();
    await h.svc.start();
    h.recorder.level("them", 0.2);
    for (let i = 0; i < 25; i++) {
      h.advance(1000);
      await h.svc.tickNow();
    }
    await new Promise((r) => setTimeout(r, 5));
    expect(h.svc.capsuleView()).toMatchObject({ kind: "recording", micSilent: true });
  });

  it("registers the optional shortcut and nothing when it is not set", async () => {
    const h = harness();
    await h.svc.core;
    await new Promise((r) => setTimeout(r, 5));
    expect(h.registered).toEqual([]);
    await h.svc.handlers.patchSettings({ shortcut: "Ctrl+Alt+M" });
    expect(h.registered).toEqual(["Ctrl+Alt+M"]);
    await h.svc.handlers.patchSettings({ shortcut: "nonsense" });
    expect(h.config.meetings.shortcut).toBe("Ctrl+Alt+M");
  });
});

describe("settings", () => {
  it("lists every call app with its policy and says what this system can do", async () => {
    const h = harness();
    const v = await h.svc.handlers.settings();
    expect(v.providers.map((p) => [p.id, p.policy])).toEqual([
      ["teams", "ask"],
      ["zoom", "ask"],
      ["meet", "ask"],
      ["slack", "ask"],
      ["discord", "ask"],
    ]);
    expect(v.providers.find((p) => p.id === "meet")!.hint).toBe("In Chrome, Edge and other browsers");
    expect(v.capabilities).toMatchObject({ platform: "win32", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" });
    expect(v.folder.replaceAll("\\", "/")).toBe("/docs/Speak Kit/Meetings");
    expect(v.keySaved).toBe(false);
  });

  it("changes a policy and saves it", async () => {
    const h = harness();
    const v = await h.svc.handlers.setPolicy("zoom", "always");
    expect(v.providers.find((p) => p.id === "zoom")!.policy).toBe("always");
    expect(h.config.meetings.policies).toEqual({ zoom: "always" });
  });

  it("adds an app by its full link, refuses a short link, and removes it with its policy", async () => {
    const h = harness();
    const bad = await h.svc.handlers.addApp({ name: "Whereby", link: "https://whereby.com/a" });
    expect(bad).toMatchObject({ ok: false, field: "link" });
    expect(h.config.meetings.apps).toEqual([]);
    const ok = await h.svc.handlers.addApp({ name: "Whereby", link: "https://whereby.com/my-room-name" });
    expect(ok.ok && ok.view.providers.map((p) => p.id)).toContain("user-whereby");
    await h.svc.handlers.setPolicy("user-whereby", "never");
    const gone = await h.svc.handlers.removeApp("user-whereby");
    expect(gone.providers.map((p) => p.id)).not.toContain("user-whereby");
    expect(h.config.meetings.policies).toEqual({});
  });

  it("detects an app the person added by its program name", async () => {
    const h = harness();
    await h.svc.handlers.addApp({ name: "Whereby", exe: "Whereby.exe" });
    h.probe.current = { micUsers: [{ pid: 30, exe: "whereby" }], windows: [] };
    await h.svc.pollNow();
    expect(h.svc.capsuleView()).toMatchObject({ kind: "offer", app: "Whereby" });
  });

  it("patches the retention and applies it", async () => {
    const h = harness({ texts: ["a b c", "d e f"] });
    await h.svc.start();
    h.recorder.chunk("you", tone(3), 0);
    h.recorder.chunk("them", tone(3), 0);
    h.advance(3000);
    const r = (await h.svc.stop()) as { ok: true; id: string };
    await settled(h, r.id);
    h.advance(2 * 3_600_000);
    await h.svc.handlers.patchSettings({ audioHours: 1 });
    await new Promise((r2) => setTimeout(r2, 20));
    expect((await h.svc.handlers.list())[0]).toMatchObject({ audio: "Audio removed", audioBytes: 0 });
  });

  it("copies the new lines once and reveals the files", async () => {
    const h = harness({ texts: ["first words here", "second words there"] });
    await h.svc.start();
    h.recorder.chunk("you", tone(3), 0);
    h.recorder.chunk("them", tone(3), 0);
    h.advance(3000);
    const r = (await h.svc.stop()) as { ok: true; id: string };
    await settled(h, r.id);
    expect(await h.svc.handlers.copyNew(r.id)).toBe(true);
    expect(await h.svc.handlers.copyNew(r.id)).toBe(false);
    expect(await h.svc.handlers.reveal(r.id)).toBe(false);
    expect((await h.svc.handlers.writeFiles(r.id)).ok).toBe(true);
    expect(await h.svc.handlers.reveal(r.id)).toBe(true);
    expect(h.revealed).toHaveLength(1);
  });

  it("answers a recorder start while one runs with a failure, and a stop with none as a failure", async () => {
    const h = harness();
    expect((await h.svc.handlers.stop()).ok).toBe(false);
    await h.svc.handlers.start();
    expect((await h.svc.handlers.start()).ok).toBe(false);
  });
});
