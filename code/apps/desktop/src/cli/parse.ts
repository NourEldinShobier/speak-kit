import type { ControlRequest } from "../shared/control/contract";
import { parseOffset, type ReadRequest } from "./reads";

export const USAGE = `Usage: speakkit [--json] <command>

  start                       open Speak Kit
  status                      dictation and reading state
  speak <text | file | ->     read text or a file aloud (- reads stdin)
        [--queue]             wait behind what is playing instead of replacing it
        [--wait]              return when the reading is over
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
  skill [print | install | status]   the agent skill that teaches this tool, and its install for Claude Code

Times take seconds, m:ss or h:mm:ss. Reads of history, meetings and captures never start the app and change no file.
Exit codes: 0 done, 1 refused or failed, 2 usage, 3 not running, 4 no speech.`;

export interface Parsed {
  json: boolean;
  request: ControlRequest | null;
  /** A read answered from the files in the data folder. */
  read?: ReadRequest;
  labsList?: boolean;
  /** Return when the reading is over, not when it starts. */
  wait?: boolean;
  /** What to do with the skill text once the app has given it. */
  skill?: "print" | "install" | "status";
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
  wait: boolean;
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
const PLAIN = new Set(["status", "capabilities", "pause", "resume", "queue", "voices"]);
const SKILL_ACTIONS = ["print", "install", "status"] as const;

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
    wait: flag(args, "--wait"),
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
  const base = { json, help: help || command === undefined, print: rest.print, wait: rest.wait, start: command === "start", request: null };
  if (base.help || base.start) return base;
  if (command === "meetings" || command === "capture") {
    const read = readRequest(command, rest);
    return typeof read === "string" ? { ...base, usage: read } : { ...base, read };
  }
  if (command === "labs") return { ...base, ...labsRequest(rest) };
  if (command === "skill") {
    const action = SKILL_ACTIONS.find((a) => a === (words[0] ?? "print"));
    if (!action || words.length > 1) return { ...base, usage: "Use: skill, skill print, skill install or skill status." };
    return { ...base, request: { command: "skill", args: {} }, skill: action };
  }
  if (PLAIN.has(command!)) return { ...base, request: { command: command as ControlRequest["command"], args: {} } };
  const build = BUILDERS[command!];
  if (!build) return { ...base, usage: `Unknown command "${command}".` };
  const built = build(rest);
  return typeof built === "string" ? { ...base, usage: built } : { ...base, request: built };
}
