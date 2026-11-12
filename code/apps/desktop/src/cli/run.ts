import { CONTROL_VERSION, EXIT, exitFor, fail, LIMITS, type ControlRequest, type Exit, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";

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
  post(d: Discovery, req: ControlRequest, timeoutMs: number): Promise<Reply>;
  stdin(): Promise<string>;
}

const STATUS: ControlRequest = { command: "status", args: {} };

const USAGE = `Usage: speakkit [--json] <command>

  start                       open Speak Kit
  status                      dictation and reading state
  read <text | ->             read text aloud (- reads stdin)
  pause | resume | stop       control the reading
  voice [id]                  show or set the voice
  dictate [--print] [--raw]   start a dictation; --print writes the text to stdout, --raw skips clean-up
  dictate stop [--print]      end a running dictation
  dictate cancel              cancel it
  settings [get <key> | set <key>=<json> ...]
  history [--search words] [--limit n]
  capabilities                what this version can do
  skill                       the agent skill that teaches this tool

Exit codes: 0 done, 1 refused or failed, 2 usage, 3 not running, 4 no speech.`;

interface Parsed {
  json: boolean;
  request: ControlRequest | null;
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

type Rest = { args: string[]; print: boolean; raw: boolean; search: string | undefined; limit: string | undefined };
type Built = ControlRequest | string;

const dictateRequest = ({ args, print, raw }: Rest): Built => {
  const action = args[0] === "stop" || args[0] === "cancel" ? args[0] : "start";
  if (args.length > (action === "start" ? 0 : 1)) return `Unexpected "${args.join(" ")}".`;
  return { command: "dictate", args: { action, ...(print && { print: true }), ...(raw && { raw: true }) } };
};

const historyRequest = ({ search, limit }: Rest): Built => {
  const n = limit === undefined ? undefined : Number(limit);
  if (n !== undefined && !(Number.isInteger(n) && n > 0)) return "--limit takes a whole number above 0.";
  return { command: "history", args: { ...(search && { search }), ...(n && { limit: n }) } };
};

const settingsRequest = ({ args }: Rest): Built => {
  const a = settingsArgs(args);
  return typeof a === "string" ? a : { command: "settings", args: a };
};

/** How each command turns its words into a request, or into the sentence that says what is wrong. */
const BUILDERS: Record<string, (r: Rest) => Built> = {
  read: (r) => (r.args.length ? { command: "read", args: { text: r.args.join(" ") } } : "read needs some text."),
  voice: (r) => ({ command: "voice", args: r.args[0] ? { set: r.args[0] } : {} }),
  dictate: dictateRequest,
  history: historyRequest,
  settings: settingsRequest,
  speak: () => "speak is not available in this version.",
};
const PLAIN = new Set(["status", "capabilities", "pause", "resume", "stop", "skill", "meetings"]);

/** The words after `speakkit` as one request. Pure: nothing is read or sent here. */
export function parseArgs(argv: readonly string[]): Parsed {
  const args = [...argv];
  const json = flag(args, "--json");
  const help = flag(args, "--help") || flag(args, "-h");
  const rest: Rest = { args: [], print: flag(args, "--print"), raw: flag(args, "--raw"), search: value(args, "--search"), limit: value(args, "--limit") };
  const [command, ...words] = args;
  rest.args = words;
  const base = { json, help: help || command === undefined, print: rest.print, start: command === "start", request: null };
  if (base.help || base.start) return base;
  if (PLAIN.has(command!)) return { ...base, request: { command: command as ControlRequest["command"], args: {} } };
  const build = BUILDERS[command!];
  if (!build) return { ...base, usage: `Unknown command "${command}".` };
  const built = build(rest);
  return typeof built === "string" ? { ...base, usage: built } : { ...base, request: built };
}

/** A reply as the lines a person reads; `dictate --print` and `skill` print only their text. */
export function render(r: Reply, req: ControlRequest, print: boolean): string {
  if (!r.ok) return r.error.message;
  const d = r.data as Record<string, unknown>;
  if (typeof d.text === "string" && (print || req.command === "skill")) return d.text.replace(/\s+$/, "");
  if (req.command === "history") {
    const rows = (d.entries as { at: number; text: string }[]) ?? [];
    return rows.length ? rows.map((e) => `${new Date(e.at).toISOString()}  ${e.text.trim()}`).join("\n") : "Nothing dictated yet.";
  }
  if (req.command === "status") return JSON.stringify(d, null, 2);
  if (req.command === "settings") return JSON.stringify(d.settings ?? d, null, 2);
  return Object.keys(d).length ? JSON.stringify(d) : "Done.";
}

function emit(io: Io, r: Reply, p: Parsed): Exit {
  if (p.json) io.out(`${JSON.stringify(r)}\n`);
  else (r.ok ? io.out : io.err)(`${render(r, p.request!, p.print)}\n`);
  return exitFor(r);
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
  const d = await io.discovery();
  if (!d) return whenNotRunning(io, p, request);
  let reply: Reply;
  try {
    reply = await io.post(d, request, wait(request));
  } catch {
    reply = fail("not-running", "Speak Kit did not answer. It may have quit.");
  }
  return emit(io, reply, p);
}
