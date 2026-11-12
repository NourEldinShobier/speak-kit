import path from "node:path";
import { CAPABILITIES, CONTROL_VERSION, EXIT, exitFor, fail, LIMITS, ok, type ControlRequest, type Exit, type Reply } from "../shared/control/contract";
import "../shared/settings/builtin-experiments";
import { experiments } from "../shared/settings/experiments";
import type { Discovery } from "../main/control/discovery";
import { parseArgs, USAGE, type Parsed } from "./parse";
import { render } from "./render";
import { followExport, followReading, followTranscription, speakSource } from "./speak";
import { skillAction } from "./skill";
import { runRead, type ReadOutcome, type Sources } from "./reads";

export { parseArgs, render };

/** What a path names: nothing, a file that is too big to read, or the text of a file. */
export type FileRead = { kind: "none" } | { kind: "too-large" } | { kind: "text"; text: string };

/** Everything the command line touches outside itself, so a test can run it with none of it. */
export interface Io {
  out(text: string): void;
  err(text: string): void;
  /** The running app, read from the discovery file on every call. */
  discovery(): Promise<Discovery | null>;
  /** Starts the app. Only `start` calls it. */
  launch(): Promise<boolean>;
  /** The history file read directly, for a read that must not start the app. */
  offlineHistory(q: { search?: string; limit: number }): Promise<unknown[] | null>;
  /** The meetings and captures on disk: read, never changed. */
  reads: Sources;
  /** The settings file as stored, or undefined when there is none. */
  readConfig(): Promise<unknown>;
  /** A path that may be a text file: refused above the file limit before anything is read. */
  file(path: string): Promise<FileRead>;
  post(d: Discovery, req: ControlRequest, timeoutMs: number): Promise<Reply>;
  stdin(): Promise<string>;
  sleep(ms: number): Promise<void>;
  /** The agent skill file as installed for Claude Code, or undefined when there is none. */
  readSkill(): Promise<string | undefined>;
  /** Writes the skill file; returns where. */
  writeSkill(text: string): Promise<string>;
}

const STATUS: ControlRequest = { command: "status", args: {} };

function emit(io: Io, r: Reply, p: Parsed): Exit {
  if (p.json) io.out(`${JSON.stringify(r)}\n`);
  else (r.ok ? io.out : io.err)(`${render(r, p.request!, p.print)}\n`);
  return exitFor(r);
}

/** A read or a labs list: the same JSON envelope as every command, or just the text for a person. */
function emitText(io: Io, p: Parsed, o: ReadOutcome): Exit {
  const reply: Reply = o.ok ? ok(o.data) : fail(o.code, o.message);
  if (p.json) io.out(`${JSON.stringify(reply)}\n`);
  else (o.ok ? io.out : io.err)(`${o.ok ? o.text : o.message}\n`);
  return exitFor(reply);
}

const wait = (req: ControlRequest): number => {
  if (req.command === "dictate") return LIMITS.printWaitMs * 5 + 5000;
  return req.command === "transcribe" ? LIMITS.printWaitMs : LIMITS.timeoutMs;
};

/** `start`: the only command that launches the app, and only when it is not running. */
async function startApp(io: Io, p: Parsed): Promise<Exit> {
  const started = (await io.discovery()) !== null || (await io.launch());
  return emit(io, started ? { ok: true, version: CONTROL_VERSION, data: { running: true } } : fail("failed", "Speak Kit could not be started."), { ...p, request: STATUS });
}

/** What a command says when the app is not running: a history read is answered from the file, everything else says so and starts nothing. */
async function whenNotRunning(io: Io, p: Parsed, request: ControlRequest): Promise<Exit> {
  if (request.command === "history") {
    const search = request.args?.search;
    const rows = await io.offlineHistory({ ...(typeof search === "string" && { search }), limit: Number(request.args?.limit ?? 20) });
    if (rows) return emit(io, { ok: true, version: CONTROL_VERSION, data: { entries: rows } }, p);
  }
  if (request.command === "capabilities") return emit(io, ok({ app: null, ...CAPABILITIES }), p);
  return emit(io, fail("not-running", "Speak Kit is not running. Start it with: speakkit start"), p);
}

/** The experiments the list shows: the ones everyone sees, with what the settings file says about each. */
async function labsList(io: Io): Promise<ReadOutcome> {
  const flags = ((await io.readConfig()) as { experiments?: Record<string, unknown> } | undefined)?.experiments ?? {};
  const rows = experiments()
    .filter((e) => e.audience === "everyone")
    .map((e) => ({ id: e.id, title: e.title, group: e.group, on: flags[e.id] === true }));
  return { ok: true, data: { labs: rows }, text: rows.length ? rows.map((r) => `${r.on ? "on " : "off"}  ${r.id}  ${r.title}`).join("\n") : "No experiments." };
}

/** A `speak` request with its words, file or stdin turned into text and its --out into an absolute path; an Exit when that already failed. */
async function prepareSpeak(io: Io, request: ControlRequest, p: Parsed): Promise<Exit | null> {
  const { source, out, ...keep } = request.args as Record<string, unknown>;
  const text = await speakSource(io, String(source));
  if ("ok" in text) return emit(io, text, p);
  request.args = { ...keep, text: text.text, ...(typeof out === "string" && { out: path.resolve(out) }) };
  return null;
}

/** Sends the request and, for a speak into a file or with --wait, follows it to its end. */
async function sendToApp(io: Io, d: Discovery, call: { request: ControlRequest; wait: boolean }): Promise<Reply> {
  const { request } = call;
  try {
    const reply = await io.post(d, request, wait(request));
    if (request.command === "transcribe") return reply.ok ? await followTranscription(io, d, reply) : reply;
    if (request.command !== "speak" || !reply.ok) return reply;
    if (request.args?.out !== undefined) return await followExport(io, d, reply);
    return call.wait && request.args?.print !== true ? await followReading(io, d, reply) : reply;
  } catch {
    return fail("not-running", "Speak Kit did not answer. It may have quit.");
  }
}

/** The commands that never reach the app: help, start, reads from files, the labs list, a usage error. Null for the rest. */
async function local(io: Io, p: Parsed): Promise<Exit | null> {
  if (p.help)
    return (
      io.out(`${USAGE}
`),
      EXIT.ok
    );
  if (p.start) return startApp(io, p);
  if (p.read) return emitText(io, p, await runRead(p.read, io.reads));
  if (p.labsList) return emitText(io, p, await labsList(io));
  if (p.request) return null;
  const r = fail("usage", p.usage ?? USAGE);
  io.err(
    p.json
      ? `${JSON.stringify(r)}
`
      : `${r.error.message}
`,
  );
  return EXIT.usage;
}

/** Runs one command and returns the exit code. Every call reads the discovery file again, because the app may have restarted since the last one. */
export async function runCli(argv: readonly string[], io: Io): Promise<Exit> {
  const p = parseArgs(argv);
  const handled = await local(io, p);
  if (handled !== null) return handled;
  const request = p.request!;
  if (request.command === "read" && request.args?.text === "-") request.args = { text: await io.stdin() };
  if (request.command === "transcribe") request.args = { ...request.args, path: path.resolve(String(request.args?.path)) };
  if (request.command === "speak") {
    const failed = await prepareSpeak(io, request, p);
    if (failed !== null) return failed;
  }
  const d = await io.discovery();
  if (!d) return p.skill === "status" ? skillAction(io, p, fail("not-running", "Speak Kit is not running.")) : whenNotRunning(io, p, request);
  const reply = await sendToApp(io, d, { request, wait: p.wait === true });
  if (p.skill && p.skill !== "print") return skillAction(io, p, reply);
  return emit(io, reply, p);
}
