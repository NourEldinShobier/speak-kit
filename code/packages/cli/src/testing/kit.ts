import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeEngine } from "@speakkit/engine";
import { createServer, AutomationFault, type AutomationHost } from "@speakkit/server";
import type { AutomationExport, AutomationSpeakRequest, AutomationStatus } from "@speakkit/protocol";
import type { CliIo } from "../commands";

export const IDLE: AutomationStatus = { status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 };

export interface Scripted {
  status: AutomationStatus;
  spoken: AutomationSpeakRequest[];
  stops: boolean[];
  exports: { text: string; out: string }[];
  /** Stages the next export reports, one per poll. */
  exportStages: AutomationExport["stage"][];
  fault: AutomationFault | undefined;
  listeners: Set<(s: AutomationStatus) => void>;
  push(s: Partial<AutomationStatus>): void;
  api: AutomationHost;
}

const apiFor = (h: Scripted): AutomationHost => ({
  status: () => h.status,
  queue: () => ({
    current: h.status.status === "idle" ? null : { title: h.status.title, status: h.status.status, index: 0, total: 1 },
    items: [{ id: "q1", title: "next one", chars: 8, addedAtMs: 1 }],
  }),
  speak: async (req) => {
    if (h.fault) throw h.fault;
    h.spoken.push(req);
    if (!req.dryRun) h.push({ status: "playing", title: req.text.slice(0, 20), total: 1 });
    return {
      id: req.dryRun ? "" : "r1",
      position: req.mode === "queue" && h.spoken.length > 1 ? 1 : 0,
      sentences: 2,
      estimatedMs: 3000,
      ...(req.dryRun && { parts: ["First part.", "Second part."] }),
    };
  },
  stop: (clear) => (h.stops.push(clear), h.push({ status: "idle" }), h.status),
  startExport: async (req) => {
    if (h.fault) throw h.fault;
    h.exports.push(req);
    return { id: "e1", stage: "rendering", progress: 0 };
  },
  exportStatus: () => {
    const stage = h.exportStages.shift() ?? "done";
    return {
      id: "e1",
      stage,
      progress: stage === "done" ? 1 : 0.5,
      ...(stage === "done" && h.exports.length > 0 && { path: h.exports.at(-1)!.out }),
      ...(stage === "error" && { error: "disk-full" }),
    };
  },
  subscribe: (l) => (h.listeners.add(l), () => h.listeners.delete(l)),
});

/** A scripted app: records what it was asked and lets a test change its status, which the event stream reports. */
export function scriptedHost(): Scripted {
  const h: Scripted = {
    status: { ...IDLE },
    spoken: [],
    stops: [],
    exports: [],
    exportStages: [],
    fault: undefined,
    listeners: new Set(),
    push(s) {
      h.status = { ...h.status, ...s };
      for (const l of h.listeners) l(h.status);
    },
    api: undefined as never,
  };
  h.api = apiFor(h);
  return h;
}

/** A real server on a free port with the scripted host behind it. */
export async function startApp(over: { noHost?: boolean } = {}) {
  const host = scriptedHost();
  const server = createServer({ engine: new FakeEngine({}), dataDir: await mkdtemp(join(tmpdir(), "speakkit-cli-")), port: 0, version: "9.9.9", ...(!over.noHost && { automation: host.api }) });
  await server.listen();
  return { host, server, env: { SPEAKKIT_PORT: String(server.port), SPEAKKIT_TOKEN: server.token } };
}

/** A command-line environment that captures output and keeps files in memory. */
export function fakeIo(over: Omit<Partial<CliIo>, "files"> & { files?: Record<string, string>; sizes?: Record<string, number>; stdinText?: string; lines?: string[] } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const { files = {} as Record<string, string>, sizes = {} as Record<string, number>, stdinText = "", lines = [], ...rest } = over;
  const io: CliIo = {
    out: (l) => void out.push(l),
    err: (l) => void err.push(l),
    env: {},
    platform: "win32",
    home: "C:\\Users\\me",
    cwd: process.cwd(),
    version: "9.9.9",
    fetch,
    files: {
      stat: async (f) => (f in files ? { size: sizes[f] ?? files[f]!.length, file: true } : null),
      read: async (f) => {
        if (!(f in files)) throw new Error("ENOENT");
        return files[f]!;
      },
      write: async (f, t) => void (files[f] = t),
    },
    stdin: async () => stdinText,
    stdinLines: async function* () {
      yield* lines;
    },
    sleep: async () => {},
    ...rest,
  };
  return { io, out, err, files };
}
