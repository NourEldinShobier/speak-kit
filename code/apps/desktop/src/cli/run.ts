import path from "node:path";
import { CONTROL_VERSION, EXIT, exitFor, fail, LIMITS, ok, type ControlRequest, type Exit, type Reply } from "../shared/control/contract";
import "../shared/settings/builtin-experiments";
import { experiments } from "../shared/settings/experiments";
import type { Discovery } from "../main/control/discovery";
import { render } from "./render";
import { followExport, speakSource } from "./speak";
import { parseOffset, runRead, type ReadOutcome, type ReadRequest, type Sources } from "./reads";

export { render };

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
}

const STATUS: ControlRequest = { command: "status", args: {} };

const USAGE = `Usage: speakkit [--json] <command>

  start                       open Speak Kit
  status                      dictation and reading state
  speak <text | file | ->     read text or a file aloud (- reads stdin)
        [--queue]             wait behind what is playing instead of replacing it
        [--print]             print the sentences the reader would speak; nothing is spoken
        [--out file.mp3|.wav] save the audio instead of playing it
  read <text | ->             read text aloud now (- reads stdin)
  pause | resume              control the reading
  stop [--keep-queue]         stop the reading and empty the waiting list (or start the next one)
  queue                       the reading in progress and what waits
  voice [id] | voices         show or set the voice; list the voices
  dictate [--print] [--raw]   start a dictation; --print writes the text to stdout, --raw skips clean-up
  dictate stop [--print]      end a running dictation
  dictate cancel              cancel it
  settings [get <key> | set <key>=<json> ...]
  history [--search words] [--limit n]
  meetings list [--limit n] | search <words> [--limit n]
  meetings show <id|latest> [--from t] [--to t] [--chapter n]
  meetings chapters <id|latest>
  capture list [--limit n] | show <id|title|latest>
  labs [list] | labs on <id> | labs off <id>
  capabilities                what this version can do
  skill                       the agent skill that teaches this tool

Times take seconds, m:ss or h:mm:ss. Reads of history, meetings and captures never start the app and change no file.
Exit codes: 0 done, 1 refused or failed, 2 usage, 3 not running, 4 no speech.`;

interface Parsed {
  json: boolean;
  request: ControlRequest | null;
  /** A read answered from the files in the data folder. */
  read?: ReadRequest;
  labsList?: boolean;
  start: boolean;
  help: boolean;
  print: boolean;
  usage?: string;
}

const flag = (args: string[], name: string): boolean => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const value = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, v === undefined ? 1 : 2);
  return v;
};

function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function settingsArgs(rest: string[]): ControlRequest["args"] | string {
  if (rest[0] === "get") return rest[1] ? { get: rest[1] } : "settings get needs a key.";
  if (rest[0] !== "set") return {};
  const pairs = rest.slice(1);
  if (pairs.length === 0) return "settings set needs key=value.";
  const set: Record<string, unknown> = {};
  for (const p of pairs) {
    const eq = p.indexOf("=");
    if (eq <= 0) return `"${p}" is not key=value.`;
    set[p.slice(0, eq)] = parseValue(p.slice(eq + 1));
  }
  return { set };
}

interface Rest {
  args: string[];
  print: boolean;
  raw: boolean;
  queue: boolean;
  keepQueue: boolean;
  search: string | undefined;
  limit: string | undefined;
  out: string | undefined;
  from: string | undefined;
  to: string | undefined;
  chapter: string | undefined;
}
type Built = ControlRequest | string;

const dictateRequest = ({ args, print, raw }: Rest): Built => {
  const action = args[0] === "stop" || args[0] === "cancel" ? args[0] : "start";
  if (args.length > (action === "start" ? 0 : 1)) return `Unexpected "${args.join(" ")}".`;
  return { command: "dictate", args: { action, ...(print && { print: true }), ...(raw && { raw: true }) } };
};

const count = (text: string | undefined, flagName: string): number | undefined | string => {
  if (text === undefined) return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : `${flagName} takes a whole number above 0.`;
};

const historyRequest = ({ search, limit }: Rest): Built => {
  const n = count(limit, "--limit");
  if (typeof n === "string") return n;
  return { command: "history", args: { ...(search && { search }), ...(n && { limit: n }) } };
};

const settingsRequest = ({ args }: Rest): Built => {
  const a = settingsArgs(args);
  return typeof a === "string" ? a : { command: "settings", args: a };
};

const speakRequest = (r: Rest): Built =>
  r.args.length
    ? { command: "speak", args: { source: r.args.join(" "), ...(r.queue && { queue: true }), ...(r.print && { print: true }), ...(r.out !== undefined && { out: r.out }) } }
    : "speak needs some text, a file or - for stdin.";

const stopRequest = (r: Rest): Built => (r.args.length ? `Unexpected "${r.args.join(" ")}".` : { command: "stop", args: r.keepQueue ? { keepQueue: true } : {} });

/** How each command that goes to the app turns its words into a request, or into the sentence that says what is wrong. */
const BUILDERS: Record<string, (r: Rest) => Built> = {
  read: (r) => (r.args.length ? { command: "read", args: { text: r.args.join(" ") } } : "read needs some text."),
  speak: speakRequest,
  stop: stopRequest,
  voice: (r) => ({ command: "voice", args: r.args[0] ? { set: r.args[0] } : {} }),
  dictate: dictateRequest,
  history: historyRequest,
  settings: settingsRequest,
};
const PLAIN = new Set(["status", "capabilities", "pause", "resume", "skill", "queue", "voices"]);

const offset = (text: string | undefined, name: string): number | undefined | string => (text === undefined ? undefined : (parseOffset(text) ?? `${name} takes seconds, m:ss or h:mm:ss.`));
const num = (x: number | undefined | string): number | undefined => (typeof x === "number" ? x : undefined);

/** What a read names: the words to search for, or the one meeting or capture to open. */
function targetOf(action: string, words: string[]): { query: string } | { ref: string } | object {
  if (action === "search") return { query: words.join(" ") };
  return words.length ? { ref: words.join(" ") } : {};
}

/** `meetings` and `capture`: the action and what it needs, as a read of the files. */
function readRequest(command: "meetings" | "capture", r: Rest): ReadRequest | string {
  const [action = "list", ...words] = r.args;
  const [limit, chapter, from, to] = [count(r.limit, "--limit"), count(r.chapter, "--chapter"), offset(r.from, "--from"), offset(r.to, "--to")];
  const problem = [limit, chapter, from, to].find((x) => typeof x === "string");
  if (typeof problem === "string") return problem;
  if (chapter !== undefined && (from !== undefined || to !== undefined)) return "Use --chapter or --from and --to, not both.";
  const numbers = { from: num(from), to: num(to), chapter: num(chapter), limit: num(limit) };
  const given = Object.fromEntries(Object.entries(numbers).filter(([, v]) => v !== undefined));
  return { command, action, ...targetOf(action, words), ...given };
}

function labsRequest(r: Rest): Pick<Parsed, "request" | "labsList" | "usage"> {
  const [action = "list", id, ...extra] = r.args;
  if (action === "list" && !id) return { request: null, labsList: true };
  if ((action === "on" || action === "off") && id && !extra.length) return { request: { command: "labs", args: { id, on: action === "on" } } };
  return { request: null, usage: "Use: labs list, labs on <id> or labs off <id>." };
}

/** The words after `speakkit` as one request. Pure: nothing is read or sent here. */
export function parseArgs(argv: readonly string[]): Parsed {
  const args = [...argv];
  const json = flag(args, "--json");
  const help = flag(args, "--help") || flag(args, "-h");
  const rest: Rest = {
    args: [],
    print: flag(args, "--print"),
    raw: flag(args, "--raw"),
    queue: flag(args, "--queue"),
    keepQueue: flag(args, "--keep-queue"),
    search: value(args, "--search"),
    limit: value(args, "--limit"),
    out: value(args, "--out"),
    from: value(args, "--from"),
    to: value(args, "--to"),
    chapter: value(args, "--chapter"),
  };
  const [command, ...words] = args;
  rest.args = words;
  const base = { json, help: help || command === undefined, print: rest.print, start: command === "start", request: null };
  if (base.help || base.start) return base;
  if (command === "meetings" || command === "capture") {
    const read = readRequest(command, rest);
    return typeof read === "string" ? { ...base, usage: read } : { ...base, read };
  }
  if (command === "labs") return { ...base, ...labsRequest(rest) };
  if (PLAIN.has(command!)) return { ...base, request: { command: command as ControlRequest["command"], args: {} } };
  const build = BUILDERS[command!];
  if (!build) return { ...base, usage: `Unknown command "${command}".` };
  const built = build(rest);
  return typeof built === "string" ? { ...base, usage: built } : { ...base, request: built };
}

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

const wait = (req: ControlRequest): number => (req.command === "dictate" ? LIMITS.printWaitMs * 5 + 5000 : LIMITS.timeoutMs);

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

/** Sends the request and, for a speak into a file, follows the export to its end. */
async function sendToApp(io: Io, d: Discovery, request: ControlRequest): Promise<Reply> {
  try {
    const reply = await io.post(d, request, wait(request));
    return request.command === "speak" && request.args?.out !== undefined ? await followExport(io, d, reply) : reply;
  } catch {
    return fail("not-running", "Speak Kit did not answer. It may have quit.");
  }
}

/** Runs one command and returns the exit code. Every call reads the discovery file again, because the app may have restarted since the last one. */
export async function runCli(argv: readonly string[], io: Io): Promise<Exit> {
  const p = parseArgs(argv);
  if (p.help)
    return (
      io.out(`${USAGE}
`),
      EXIT.ok
    );
  if (p.start) return startApp(io, p);
  if (p.read) return emitText(io, p, await runRead(p.read, io.reads));
  if (p.labsList) return emitText(io, p, await labsList(io));
  const request = p.request;
  if (!request) {
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
  if (request.command === "read" && request.args?.text === "-") request.args = { text: await io.stdin() };
  if (request.command === "speak") {
    const failed = await prepareSpeak(io, request, p);
    if (failed !== null) return failed;
  }
  const d = await io.discovery();
  return d ? emit(io, await sendToApp(io, d, request), p) : whenNotRunning(io, p, request);
}
