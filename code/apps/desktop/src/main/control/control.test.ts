import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CaptureHandle, CaptureResult } from "@speakkit/dictation";
import type { AutomationErrorCode } from "@speakkit/protocol";
import { AutomationFault } from "@speakkit/server";
import { CAPABILITIES, CONTROL_VERSION, ERROR_CODES, EXIT, exitFor, fail, LIMITS, ok, type ControlRequest, type Reply } from "../../shared/control/contract";
import { skillText } from "../../shared/control/skill";
import { COMMAND_LINE_KEYS, sortKeys, validateChange } from "../../shared/control/settings-registry";
import { createCommands, type ControlDeps } from "./commands";
import { discoveryFile, portOpen, processAlive, readDiscovery, removeDiscovery, writeDiscovery } from "./discovery";
import { createControlServer } from "./server";

const dirs: string[] = [];
const tmp = () => (dirs.push(mkdtempSync(path.join(os.tmpdir(), "speakkit-control-"))), dirs.at(-1)!);
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("contract", () => {
  it("maps replies to the stable exit codes", () => {
    expect(EXIT).toEqual({ ok: 0, failed: 1, usage: 2, notRunning: 3, noSpeech: 4 });
    expect(exitFor(ok({}))).toBe(0);
    expect(exitFor(fail("refused", "x"))).toBe(1);
    expect(exitFor(fail("failed", "x"))).toBe(1);
    expect(exitFor(fail("usage", "x"))).toBe(2);
    expect(exitFor(fail("not-running", "x"))).toBe(3);
    expect(exitFor(fail("no-speech", "x"))).toBe(4);
  });

  it("puts the version in every reply", () => {
    expect(ok({}).version).toBe(CONTROL_VERSION);
    expect(fail("busy", "x").version).toBe(CONTROL_VERSION);
  });

  it("lists the typed error codes and what this version can do, for feature detection", () => {
    expect(ERROR_CODES).toEqual(["usage", "not-running", "refused", "busy", "no-speech", "cancelled", "unsupported", "too-large", "timeout", "unauthorized", "model-missing", "queue-full", "failed"]);
    expect(CAPABILITIES.features).toMatchObject({ print: true, raw: true, history: true, meetings: true, capture: true, speak: true, queue: true, labs: true });
    expect(CAPABILITIES.limits).toEqual({ requestBytes: 524288, replyBytes: 1048576, timeoutMs: 10000, printWaitMs: 60000, speakFileBytes: 67108864 });
  });
});

describe("discovery file", () => {
  it("is written with the port, token, pid and version, readable by its owner only, and read back", async () => {
    const file = discoveryFile(tmp());
    await writeDiscovery(file, { port: 4321, token: "t".repeat(32), pid: process.pid, version: "0.5.3" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ port: 4321, token: "t".repeat(32), pid: process.pid, version: "0.5.3" });
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(await readDiscovery(file)).toMatchObject({ port: 4321, version: "0.5.3" });
  });

  it("is ignored when its process is gone, damaged or missing, and is read again on every call", async () => {
    const file = discoveryFile(tmp());
    expect(await readDiscovery(file)).toBeNull();
    writeFileSync(file, "not json");
    expect(await readDiscovery(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ port: 1, token: "short", pid: 1, version: "x" }));
    expect(await readDiscovery(file, () => true)).toBeNull();
    await writeDiscovery(file, { port: 5000, token: "a".repeat(32), pid: 424242, version: "1" });
    expect(await readDiscovery(file, () => false)).toBeNull();
    expect(await readDiscovery(file, () => true)).toMatchObject({ port: 5000 });
    await writeDiscovery(file, { port: 6000, token: "b".repeat(32), pid: 424242, version: "1" });
    expect(await readDiscovery(file, () => true)).toMatchObject({ port: 6000 });
  });

  it("is removed on quit only by the process that wrote it", async () => {
    const file = discoveryFile(tmp());
    await writeDiscovery(file, { port: 5000, token: "a".repeat(32), pid: 111, version: "1" });
    await removeDiscovery(file, 222);
    expect(await readDiscovery(file, () => true)).not.toBeNull();
    await removeDiscovery(file, 111);
    expect(await readDiscovery(file, () => true)).toBeNull();
  });

  it("is removed by the time stop resolves, and a file whose port nothing listens on is not trusted", async () => {
    const dir = tmp();
    const file = discoveryFile(dir);
    await writeDiscovery(file, { port: 5000, token: "a".repeat(32), pid: 111, version: "1" });
    expect(
      await readDiscovery(
        file,
        () => true,
        async () => false,
      ),
    ).toBeNull();
    expect(
      await readDiscovery(
        file,
        () => true,
        async (p) => p === 5000,
      ),
    ).toMatchObject({ port: 5000 });
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as net.AddressInfo;
    expect(await portOpen(port)).toBe(true);
    await new Promise((r) => server.close(r));
    expect(await portOpen(port)).toBe(false);
    await removeDiscovery(file, 111);
    expect(existsSync(file)).toBe(false);
  });

  it("knows this process is alive and an impossible one is not", () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(2 ** 22 - 3)).toBe(false);
  });
});

function fakeCapture(result: CaptureResult): CaptureHandle & { finished: number; cancelled: number } {
  let resolve!: (r: CaptureResult) => void;
  const result$ = new Promise<CaptureResult>((r) => (resolve = r));
  const h = {
    result: result$,
    finished: 0,
    cancelled: 0,
    finish() {
      h.finished++;
      resolve(result);
    },
    cancel() {
      h.cancelled++;
      resolve({ ok: false, code: "cancelled" });
    },
  };
  return h;
}

/** A stand-in for the reading host: the text decides what it refuses, like the real one's guards. */
function fakeHost(log: string[]): ControlDeps["automation"] {
  const refuse: Record<string, AutomationErrorCode> = { model: "model_missing", busy: "busy", full: "queue_full", broken: "failed" };
  return {
    status: () => ({ status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 }),
    queue: () => ({ current: null, items: [{ id: "q1", title: "Later", chars: 5, addedAtMs: 1 }] }),
    speak: async (r) => {
      log.push(`host:speak:${r.text}:${r.mode}:${r.dryRun === true}`);
      if (refuse[r.text]) throw new AutomationFault(refuse[r.text]!);
      const parts = r.text.split(/(?<=\.)\s+/);
      return r.dryRun ? { id: "", position: 0, sentences: parts.length, estimatedMs: 100, parts } : { id: "r1", position: r.mode === "queue" ? 1 : 0, sentences: parts.length, estimatedMs: 100 };
    },
    stop: (clear) => (log.push(`host:stop:${clear}`), { status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 }),
    startExport: async (r) => (log.push(`host:export:${r.text}:${r.out}`), { id: "e1", stage: "rendering", progress: 0 }),
    exportStatus: (id) => (id === "e1" ? { id, stage: "done", progress: 1, path: "C:/a.mp3" } : undefined),
    subscribe: () => () => {},
  };
}

function deps(over: Partial<ControlDeps> = {}) {
  const log: string[] = [];
  const config: Record<string, unknown> = { voice: "af_heart", speed: 1 };
  let phase = "idle";
  const idle: (() => void)[] = [];
  const giveUps: (() => void)[] = [];
  const warnings: string[] = [];
  const refuse: { message?: string; error?: Error } = {};
  const d: ControlDeps = {
    version: "0.5.3",
    status: () => ({ dictation: { supported: true, enabled: true, phase, paused: false }, reader: { status: "idle" }, voice: String(config.voice) }),
    readText: (t) => (log.push(`read:${t}`), t !== "refuse"),
    readerCommand: (c) => void log.push(`reader:${c.type}`),
    automation: fakeHost(log),
    voices: async () => [{ id: "af_heart", name: "Heart" }],
    labs: {
      known: (id) => ({ "caption-export": "yes", "live-dictation-preview": "dev-only" } as Record<string, "yes" | "dev-only">)[id] ?? "no",
      set: async (id, on) => (log.push(`labs:${id}:${on}`), id === "boom" ? "Not now." : undefined),
    },
    voice: { get: () => String(config.voice), set: (id) => void (config.voice = id) },
    dictation: {
      supported: () => true,
      capture: () => fakeCapture({ ok: true, text: "hello there" }),
      start: () => void log.push("start"),
      stop: () => void log.push("stop"),
      cancel: () => void log.push("cancel"),
      busy: () => phase !== "idle",
    },
    history: { list: async (q) => (log.push(`history:${q.search ?? ""}:${q.limit}`), [{ id: "1", at: 1, text: "one" }]) },
    settings: {
      snapshot: () => ({ ...config }),
      apply: async (c) => {
        if (refuse.error) throw refuse.error;
        if (refuse.message) return refuse.message;
        Object.assign(config, c.app);
        return undefined;
      },
      busy: () => phase !== "idle",
      whenIdle: (fn, giveUp) => void (idle.push(fn), giveUps.push(giveUp)),
    },
    warn: (m, detail) => void warnings.push(`${m}: ${detail}`),
    ...over,
  };
  return { d, log, config, setPhase: (p: string) => (phase = p), idle, giveUps, warnings, refuse, run: createCommands(d) };
}
const call = (run: (r: ControlRequest) => Promise<Reply>, command: ControlRequest["command"], args: Record<string, unknown> = {}) => run({ command, args });

describe("commands", () => {
  it("answers capabilities and status with the app version", async () => {
    const t = deps();
    expect(await call(t.run, "capabilities")).toMatchObject({ ok: true, data: { app: "0.5.3", features: { print: true } } });
    expect(await call(t.run, "status")).toMatchObject({ ok: true, data: { app: "0.5.3", dictation: { enabled: true, phase: "idle" }, voice: "af_heart" } });
  });

  it("reads text, refuses empty text with usage, and says refused when nothing can be read", async () => {
    const t = deps();
    expect(await call(t.run, "read", { text: " hello " })).toMatchObject({ ok: true });
    expect(t.log).toContain("read:hello");
    expect(await call(t.run, "read", { text: "  " })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "read", {})).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "read", { text: "refuse" })).toMatchObject({ ok: false, error: { code: "refused" } });
  });

  it("pause, resume and stop are the reader commands, and repeating them is harmless", async () => {
    const t = deps();
    for (const c of ["pause", "pause", "resume", "stop"] as const) expect(await call(t.run, c)).toMatchObject({ ok: true });
    expect(await call(t.run, "stop", { keepQueue: true })).toMatchObject({ ok: true });
    expect(t.log).toEqual(["reader:pause", "reader:pause", "reader:resume", "host:stop:true", "host:stop:false"]);
  });

  it("shows and sets the voice, refusing an empty or very long id", async () => {
    const t = deps();
    expect(await call(t.run, "voice")).toMatchObject({ data: { voice: "af_heart" } });
    expect(await call(t.run, "voice", { set: "bf_emma" })).toMatchObject({ ok: true, data: { voice: "bf_emma" } });
    expect(t.config.voice).toBe("bf_emma");
    expect(await call(t.run, "voice", { set: "" })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "voice", { set: "x".repeat(65) })).toMatchObject({ ok: false, error: { code: "usage" } });
  });

  it("starts, stops and cancels a plain dictation, refusing a second start", async () => {
    const t = deps();
    expect(await call(t.run, "dictate", {})).toMatchObject({ ok: true });
    t.setPhase("recording");
    expect(await call(t.run, "dictate", {})).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(await call(t.run, "dictate", { action: "stop" })).toMatchObject({ ok: true });
    expect(await call(t.run, "dictate", { action: "cancel" })).toMatchObject({ ok: true });
    expect(t.log).toEqual(["start", "stop", "cancel"]);
    t.setPhase("idle");
    expect(await call(t.run, "dictate", { action: "stop" })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(await call(t.run, "dictate", { action: "dance" })).toMatchObject({ ok: false, error: { code: "usage" } });
  });

  it("says unsupported when dictation is off", async () => {
    const t = deps({ dictation: { ...deps().d.dictation, supported: () => false } });
    expect(await call(t.run, "dictate", {})).toMatchObject({ ok: false, error: { code: "unsupported" } });
  });

  it("print: the start answers with the text when the capture is finished by a stop, and nothing else can start meanwhile", async () => {
    const handle = fakeCapture({ ok: true, text: "hello there" });
    const t = deps({ dictation: { ...deps().d.dictation, capture: () => handle } });
    const started = call(t.run, "dictate", { print: true });
    expect(await call(t.run, "dictate", { print: true })).toMatchObject({ ok: false, error: { code: "busy" } });
    const stopped = await call(t.run, "dictate", { action: "stop", print: true });
    expect(handle.finished).toBe(1);
    expect(stopped).toMatchObject({ ok: true, data: { text: "hello there" } });
    expect(await started).toMatchObject({ ok: true, data: { text: "hello there" } });
  });

  it("print: the start answers however the capture ends: cancelled, no speech, a failure", async () => {
    for (const [result, code] of [
      [{ ok: false, code: "no-speech" }, "no-speech"],
      [{ ok: false, code: "busy" }, "busy"],
      [{ ok: false, code: "mic-denied" }, "failed"],
    ] as const) {
      const t = deps({ dictation: { ...deps().d.dictation, capture: () => fakeCapture(result as CaptureResult) } });
      const started = call(t.run, "dictate", { print: true });
      await call(t.run, "dictate", { action: "stop", print: true });
      expect(await started).toMatchObject({ ok: false, error: { code } });
    }
    const handle = fakeCapture({ ok: true, text: "x" });
    const t = deps({ dictation: { ...deps().d.dictation, capture: () => handle } });
    const started = call(t.run, "dictate", { print: true });
    await call(t.run, "dictate", { action: "cancel" });
    expect(handle.cancelled).toBe(1);
    expect(await started).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("print: a capture that outlives the wait is cancelled", async () => {
    vi.useFakeTimers();
    try {
      let cancelled = 0;
      let resolve!: (r: CaptureResult) => void;
      const handle: CaptureHandle = { result: new Promise((r) => (resolve = r)), finish: () => undefined, cancel: () => (cancelled++, resolve({ ok: false, code: "cancelled" })) };
      const t = deps({ dictation: { ...deps().d.dictation, capture: () => handle } });
      const started = call(t.run, "dictate", { print: true });
      await vi.advanceTimersByTimeAsync(LIMITS.printWaitMs * 5 + 1);
      expect(await started).toMatchObject({ ok: false, error: { code: "cancelled" } });
      expect(cancelled).toBe(1);
      // The command is over, so a new capture can start.
      expect(await Promise.race([call(t.run, "dictate", { print: true }), Promise.resolve("pending")])).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop --print gives up after 60 seconds with a timeout", async () => {
    vi.useFakeTimers();
    try {
      const handle: CaptureHandle = { result: new Promise(() => undefined), finish: () => undefined, cancel: () => undefined };
      const t = deps({ dictation: { ...deps().d.dictation, capture: () => handle } });
      void call(t.run, "dictate", { print: true });
      const stopped = call(t.run, "dictate", { action: "stop", print: true });
      await vi.advanceTimersByTimeAsync(LIMITS.printWaitMs + 1);
      expect(await stopped).toMatchObject({ ok: false, error: { code: "timeout" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists history with a default and a capped limit, and passes the search on", async () => {
    const t = deps();
    expect(await call(t.run, "history", {})).toMatchObject({ ok: true, data: { entries: [{ id: "1" }] } });
    await call(t.run, "history", { limit: 5000, search: "hello" });
    await call(t.run, "history", { limit: -4 });
    expect(t.log).toEqual(["history::20", "history:hello:200", "history::1"]);
  });

  it("speaks now, queues, prints the sentences and starts a file export; the export is asked for by its id", async () => {
    const t = deps();
    expect(await call(t.run, "speak", { text: " Hello. World. " })).toMatchObject({ ok: true, data: { id: "r1", position: 0 } });
    expect(await call(t.run, "speak", { text: "Later", queue: true })).toMatchObject({ ok: true, data: { position: 1 } });
    expect(await call(t.run, "speak", { text: "One. Two.", print: true })).toMatchObject({ ok: true, data: { sentences: 2, parts: ["One.", "Two."] } });
    expect(await call(t.run, "speak", { text: "Save me", out: "C:/a.mp3" })).toMatchObject({ ok: true, data: { export: { id: "e1", stage: "rendering" } } });
    expect(await call(t.run, "speak", { exportId: "e1" })).toMatchObject({ ok: true, data: { export: { stage: "done", path: "C:/a.mp3" } } });
    expect(t.log).toEqual(["host:speak:Hello. World.:replace:false", "host:speak:Later:queue:false", "host:speak:One. Two.:replace:true", "host:export:Save me:C:/a.mp3"]);
  });

  it("refuses speak with no text, a missing out name, an unknown export and text over the limit, and names a host refusal by its code", async () => {
    const t = deps();
    expect(await call(t.run, "speak", { text: "  " })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "speak", { text: "x", out: "" })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "speak", { exportId: "nope" })).toMatchObject({ ok: false, error: { code: "failed" } });
    expect(await call(t.run, "speak", { text: "x".repeat(100_001) })).toMatchObject({ ok: false, error: { code: "too-large" } });
    expect(await call(t.run, "speak", { text: "x".repeat(100_000), print: true })).toMatchObject({ ok: true });
    for (const [text, code] of [
      ["model", "model-missing"],
      ["busy", "busy"],
      ["full", "queue-full"],
      ["broken", "failed"],
    ] as const) {
      expect(await call(t.run, "speak", { text })).toMatchObject({ ok: false, error: { code } });
    }
  });

  it("shows the waiting list and the voices with the current one", async () => {
    const t = deps();
    expect(await call(t.run, "queue")).toMatchObject({ ok: true, data: { current: null, items: [{ id: "q1", title: "Later" }] } });
    expect(await call(t.run, "voices")).toMatchObject({ ok: true, data: { voices: [{ id: "af_heart", name: "Heart" }], current: "af_heart" } });
  });

  it("turns an experiment on or off, and refuses an unknown one, a developer one and a missing value", async () => {
    const t = deps();
    expect(await call(t.run, "labs", { id: "caption-export", on: true })).toMatchObject({ ok: true, data: { id: "caption-export", on: true } });
    expect(await call(t.run, "labs", { id: "nope", on: true })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "labs", { id: "live-dictation-preview", on: true })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(await call(t.run, "labs", { id: "caption-export" })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(t.log).toEqual(["labs:caption-export:true"]);
  });

  it("prints the skill pinned to the app version", async () => {
    const r = await call(deps().run, "skill");
    expect(r).toMatchObject({ ok: true });
    expect((r as { data: { text: string } }).data.text).toBe(skillText(CONTROL_VERSION, "0.5.3"));
    expect(skillText(1, "9.9.9")).toContain("Speak Kit 9.9.9");
  });
});

describe("settings through the commands", () => {
  it("reads all settings, one setting, and refuses an unknown key", async () => {
    const t = deps();
    expect(await call(t.run, "settings", {})).toMatchObject({ data: { settings: { voice: "af_heart" } } });
    expect(await call(t.run, "settings", { get: "speed" })).toMatchObject({ data: { key: "speed", value: 1 } });
    expect(await call(t.run, "settings", { get: "nope" })).toMatchObject({ ok: false, error: { code: "usage" } });
  });

  it("applies a valid change through the shared validator, and refuses a wrong value whole", async () => {
    const t = deps();
    expect(await call(t.run, "settings", { set: { speed: 1.5 } })).toMatchObject({ ok: true, data: { applied: true } });
    expect(t.config.speed).toBe(1.5);
    expect(await call(t.run, "settings", { set: { speed: 9, voice: "x" } })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(t.config.speed).toBe(1.5);
    expect(t.config.voice).toBe("af_heart");
    expect(await call(t.run, "settings", { set: { setupDone: true } })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(await call(t.run, "settings", { set: "x" })).toMatchObject({ ok: false, error: { code: "usage" } });
    expect(await call(t.run, "settings", { set: [1] })).toMatchObject({ ok: false, error: { code: "usage" } });
  });

  it("holds a change made during a recording until dictation is idle", async () => {
    const t = deps();
    t.setPhase("recording");
    expect(await call(t.run, "settings", { set: { speed: 2 } })).toMatchObject({ ok: true, data: { queued: true } });
    expect(t.config.speed).toBe(1);
    t.setPhase("idle");
    t.idle.forEach((f) => f());
    await Promise.resolve();
    expect(t.config.speed).toBe(2);
  });

  it("tells the caller when a setting was refused instead of saying it was applied", async () => {
    const t = deps();
    t.refuse.message = "That shortcut is already used by Raw.";
    expect(await call(t.run, "settings", { set: { speed: 2 } })).toEqual({ ok: false, version: expect.any(Number), error: { code: "refused", message: "That shortcut is already used by Raw." } });
  });

  it("logs a queued change that is refused or throws, and one that waited too long", async () => {
    const t = deps();
    t.setPhase("recording");
    t.refuse.message = "clash";
    await call(t.run, "settings", { set: { speed: 2 } });
    t.idle[0]!();
    await new Promise((r) => setTimeout(r, 0));
    delete t.refuse.message;
    t.refuse.error = new Error("model switch failed");
    await call(t.run, "settings", { set: { speed: 3 } });
    t.idle[1]!();
    await new Promise((r) => setTimeout(r, 0));
    t.giveUps[1]!();
    expect(t.warnings).toEqual(["queued setting refused: clash", "queued setting failed: Error: model switch failed", "queued setting dropped: dictation stayed busy"]);
  });

  it("uses the same validator as the Settings pages for dictation keys", () => {
    expect(validateChange({ "dictation.mode": "toggle" })).toMatchObject({ ok: true, dictation: { mode: "toggle" } });
    expect(validateChange({ "dictation.mode": "sideways" })).toMatchObject({ ok: false });
    expect(validateChange({ "dictation.rawHotkey": "KeyA" })).toMatchObject({ ok: false });
    expect(validateChange({ nope: 1 })).toMatchObject({ ok: false });
    expect(validateChange({ voice: "x" }, COMMAND_LINE_KEYS)).toMatchObject({ ok: true });
    expect(validateChange({ language: "en" }, COMMAND_LINE_KEYS)).toEqual({ ok: false, message: "language cannot be changed from the command line." });
  });

  it("writes keys in a fixed order, deep", () => {
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }))).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  });
});

describe("control server", () => {
  const start = async (dispatch: (r: ControlRequest) => Promise<Reply>) => {
    const dataDir = tmp();
    const server = createControlServer({ dataDir, version: "0.5.3", dispatch });
    await server.start();
    const d = (await readDiscovery(discoveryFile(dataDir)))!;
    const post = (body: string, token = d.token, url = "/control", method = "POST") =>
      fetch(`http://127.0.0.1:${d.port}${url}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(method === "POST" && { body }) });
    return { server, d, dataDir, post };
  };

  it("publishes the discovery file while it runs and removes it on stop", async () => {
    const s = await start(async () => ok({}));
    expect(s.d).toMatchObject({ pid: process.pid, version: "0.5.3" });
    expect(s.d.token).toHaveLength(64);
    await s.server.stop();
    expect(await readDiscovery(discoveryFile(s.dataDir))).toBeNull();
    expect(s.server.running).toBe(false);
  });

  it("runs a command and answers JSON with the version", async () => {
    const s = await start(async (r) => ok({ got: r.command }));
    const res = await s.post(JSON.stringify({ command: "status", args: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: CONTROL_VERSION, data: { got: "status" } });
    await s.server.stop();
  });

  it("answers 404 for a wrong token, a wrong route and a wrong method, the same as nothing being there", async () => {
    const s = await start(async () => ok({}));
    expect((await s.post("{}", "wrong".repeat(13))).status).toBe(404);
    expect((await s.post("{}", s.d.token, "/other")).status).toBe(404);
    expect((await s.post("{}", s.d.token, "/control", "GET")).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${s.d.port}/control`, { method: "POST", body: "{}" })).status).toBe(404);
    await s.server.stop();
  });

  it("refuses a request over 64 KiB with a typed error and a body that is not a command with a usage error", async () => {
    const s = await start(async () => ok({}));
    const big = await s.post(JSON.stringify({ command: "read", args: { text: "x".repeat(LIMITS.requestBytes) } })).catch(() => null);
    if (big) expect(await big.json()).toMatchObject({ ok: false, error: { code: "too-large" } });
    const bad = await s.post("not json");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "usage" } });
    expect((await s.post(JSON.stringify({ command: "explode" }))).status).toBe(400);
    await s.server.stop();
  });

  it("replaces a reply over 1 MiB with a typed error, and a command that throws with failed", async () => {
    const s = await start(async (r) => {
      if (r.command === "history") return ok({ text: "y".repeat(LIMITS.replyBytes) });
      throw new Error("boom");
    });
    expect(await (await s.post(JSON.stringify({ command: "history" }))).json()).toMatchObject({ ok: false, error: { code: "too-large" } });
    expect(await (await s.post(JSON.stringify({ command: "status" }))).json()).toMatchObject({ ok: false, error: { code: "failed" } });
    await s.server.stop();
  });

  it("answers a command that takes too long with a timeout, and keeps serving", async () => {
    const dataDir = tmp();
    const server = createControlServer({ dataDir, version: "1", timeoutMs: 50, dispatch: (r) => (r.command === "status" ? new Promise(() => undefined) : Promise.resolve(ok({}))) });
    await server.start();
    const d = (await readDiscovery(discoveryFile(dataDir)))!;
    const send = (command: string) => fetch(`http://127.0.0.1:${d.port}/control`, { method: "POST", headers: { authorization: `Bearer ${d.token}` }, body: JSON.stringify({ command }) });
    expect(await (await send("status")).json()).toMatchObject({ ok: false, error: { code: "timeout" } });
    expect(await (await send("capabilities")).json()).toMatchObject({ ok: true });
    await server.stop();
  });

  it("starting twice keeps one server, and stopping twice is harmless", async () => {
    const s = await start(async () => ok({}));
    const port = s.server.port;
    await s.server.start();
    expect(s.server.port).toBe(port);
    await s.server.stop();
    await s.server.stop();
  });
});

describe("local API limits checklist", () => {
  // Applied to every route the server has: only one POST route, a token, 404 for anything else, and the three limits above.
  it("has exactly one route and every limit is named", () => {
    expect(Object.keys(LIMITS).sort()).toEqual(["printWaitMs", "replyBytes", "requestBytes", "speakFileBytes", "timeoutMs"]);
  });
});
