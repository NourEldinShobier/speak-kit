import path from "node:path";
import { parseArgs } from "node:util";
import { AUTOMATION_LIMITS, EXIT_CODES, capabilities, type AutomationStatus, type Capabilities } from "@speakkit/protocol";
import { AppClient } from "./client";
import { discover } from "./discover";
import { CliError } from "./errors";
import type { CliInstall, Launcher } from "./launcher";
import { serveMcp } from "./mcp";
import { orNull } from "./or-null";
import { installSkill, skillState, skillText, type SkillState } from "./skill";

/** Everything the commands touch outside this process, so tests can fake it. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  home: string;
  cwd: string;
  /** Version of the app this tool belongs to. */
  version: string;
  fetch: typeof fetch;
  files: {
    stat(file: string): Promise<{ size: number; file: boolean } | null>;
    read(file: string): Promise<string>;
    write(file: string, text: string): Promise<void>;
  };
  stdin(): Promise<string>;
  /** Lines of stdin as they arrive (the MCP server reads these). */
  stdinLines(): AsyncIterable<string>;
  sleep(ms: number): Promise<void>;
  /** The PATH installer of this OS; absent where the tool was not started by the app. */
  launcher?: Launcher;
}

const USAGE = `usage: speakkit <command> [options]

  speak <text | file | ->     read aloud. A file name is read from the file, - reads standard input.
        --queue               wait behind what is playing instead of replacing it
        --print               do not speak: print the sentences that would be read, one per line
        --wait                return when everything has been read
        --out <file.mp3|.wav> save the audio to a file instead of playing it
  stop [--keep-queue]         stop reading and empty the waiting list (--keep-queue: go on with the next waiting reading)
  status                      what is playing now
  queue                       the reading in progress and the ones waiting
  voices                      the installed voices
  capabilities                what this version can do, with the error codes
  mcp                         run as an MCP server over standard input and output
  skill [print|install|status]  the agent skill that teaches these commands
  path [status|install|remove]  put speakkit on the PATH of new terminals
  labs list | on <lab> | off <lab>

options: --json (machine output), --port <n>, --token <token>, --version, --help
exit codes: ${EXIT_CODES.ok} done, ${EXIT_CODES.failed} failed (the error code is printed), ${EXIT_CODES.usage} wrong usage, ${EXIT_CODES.unreachable} Speak Kit is not running or the token was rejected`;

const OPTIONS = {
  json: { type: "boolean" },
  queue: { type: "boolean" },
  print: { type: "boolean" },
  wait: { type: "boolean" },
  out: { type: "string" },
  "keep-queue": { type: "boolean" },
  port: { type: "string" },
  token: { type: "string" },
  dir: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

/** What one command gets: its words and options, the environment, a client that finds the app when first used, and the output in words or JSON. */
interface Ctx {
  command: string;
  rest: string[];
  v: Values;
  io: CliIo;
  client(): Promise<AppClient>;
  show(value: unknown, human: () => string | string[]): void;
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;

/** One line for a status: "playing 2 of 5: First words (1 waiting)". */
export function describeStatus(s: AutomationStatus): string {
  if (s.status === "idle") return s.queued ? `idle (${s.queued} waiting)` : "idle";
  const place = s.total ? ` ${Math.min(s.index + 1, s.total)} of ${s.total}` : "";
  return `${s.status}${place}${s.title ? `: ${s.title}` : ""}${s.queued ? ` (${s.queued} waiting)` : ""}`;
}

/** Runs one command line (without the program name) and returns the exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return EXIT_CODES.usage;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.version) return (void io.out(io.version), 0);
  if (values.help) return (void io.out(USAGE), 0);
  if (!command) return (io.err(USAGE), EXIT_CODES.usage);
  try {
    await dispatch(contextOf({ command, rest, v: values, io }));
    return EXIT_CODES.ok;
  } catch (e) {
    const err = e instanceof CliError ? e : new CliError("failed", e instanceof Error ? e.message : String(e));
    if (values.json) io.out(JSON.stringify({ error: { code: err.code, message: err.message } }));
    else io.err(`${err.code}: ${err.message}`);
    return err.exitCode;
  }
}

function contextOf({ command, rest, v, io }: Pick<Ctx, "command" | "rest" | "v" | "io">): Ctx {
  const discoverIo = { env: io.env, platform: io.platform, home: io.home, readText: (f: string) => orNull(io.files.read(f)) };
  return {
    command,
    rest,
    v,
    io,
    client: async () => new AppClient(await discover(discoverIo, { port: v.port, token: v.token }), io.fetch),
    show: (value, human) => {
      if (v.json) return io.out(JSON.stringify(value));
      for (const line of [human()].flat()) io.out(line);
    },
  };
}

const noExtra = ({ command, rest }: Ctx) => {
  if (rest.length) throw new CliError("invalid_input", `"${command}" takes no arguments (got "${rest.join(" ")}").`);
};

const HANDLERS: Record<string, (x: Ctx) => Promise<void>> = {
  speak,
  skill,
  path: pathCommand,
  stop: async (x) => {
    noExtra(x);
    const s = await (await x.client()).stop(!x.v["keep-queue"]);
    x.show(s, () => (s.status === "idle" ? "stopped" : `now ${describeStatus(s)}`));
  },
  status: async (x) => {
    noExtra(x);
    const s = await (await x.client()).status();
    x.show(s, () => describeStatus(s));
  },
  queue: async (x) => {
    noExtra(x);
    const q = await (await x.client()).queue();
    x.show(q, () => [q.current ? `now: ${q.current.status} ${q.current.title}` : "now: nothing", ...q.items.map((i, n) => `${n + 1}. ${i.title} (${i.chars} characters)`)]);
  },
  voices: async (x) => {
    noExtra(x);
    const list = await (await x.client()).voices();
    x.show(list, () => list.voices.map((voice) => `${voice.id}${voice.id === list.default ? " *" : ""}\t${voice.name}\t${voice.lang}\t${voice.gender}`));
  },
  capabilities: async (x) => {
    noExtra(x);
    const c = await capabilitiesOf(x.client, x.io.version);
    x.show(c, () => [...Object.entries(c.commands).map(([name, state]) => `${name}\t${state}`), "", ...c.errors.map((e) => `${e.code}\t${e.message}`)]);
  },
  mcp: async (x) => {
    noExtra(x);
    await serveMcp({ lines: x.io.stdinLines(), write: x.io.out, client: x.client, version: x.io.version });
  },
  labs: async () => {
    throw new CliError("unsupported", "labs is available through the installed speakkit command, which runs it against the settings file.");
  },
};

async function dispatch(x: Ctx): Promise<void> {
  const handler = Object.hasOwn(HANDLERS, x.command) ? HANDLERS[x.command] : undefined;
  if (!handler) throw new CliError("invalid_input", `unknown command "${x.command}". Run speakkit --help.`);
  await handler(x);
}

/** The running app's own answer; when it is not running, this build's list, marked with its source. */
async function capabilitiesOf(client: () => Promise<AppClient>, version: string): Promise<Capabilities> {
  try {
    return await (await client()).capabilities();
  } catch (e) {
    if (e instanceof CliError && e.code === "not_running") return capabilities(version);
    throw e;
  }
}

async function textToRead(args: string[], io: CliIo): Promise<string> {
  if (!args.length) throw new CliError("invalid_input", "speak needs some text, a file name, or - for standard input.");
  if (args.length === 1 && args[0] === "-") return io.stdin();
  if (args.length === 1) {
    const file = path.resolve(io.cwd, args[0]!);
    const st = await io.files.stat(file);
    if (st?.file) {
      if (st.size > AUTOMATION_LIMITS.maxFileBytes)
        throw new CliError("too_large", `${args[0]} is ${(st.size / 1024 / 1024).toFixed(0)} MiB. The limit is ${AUTOMATION_LIMITS.maxFileBytes / 1024 / 1024} MiB.`);
      return io.files.read(file);
    }
  }
  return args.join(" ");
}

/** The options of speak that exclude each other, refused before anything is read or sent. */
function checkSpeakOptions(v: Values): void {
  const bad = (message: string) => new CliError("invalid_input", message);
  if (v.out !== undefined && (v.print || v.queue || v.wait)) throw bad("--out cannot be combined with --print, --queue or --wait.");
  if (v.print && (v.queue || v.wait)) throw bad("--print speaks nothing, so --queue and --wait do not apply.");
  const ext = v.out === undefined ? "" : path.extname(v.out).toLowerCase();
  if (v.out !== undefined && ext !== ".mp3" && ext !== ".wav") throw bad("--out must end in .mp3 or .wav.");
}

async function speak(x: Ctx): Promise<void> {
  const { v, io } = x;
  checkSpeakOptions(v);
  const text = await textToRead(x.rest, io);
  const c = await x.client();
  if (v.out !== undefined) return exportFile(x, c, { text, out: path.resolve(io.cwd, v.out) });
  const r = await c.speak({ text, ...(v.queue && { mode: "queue" as const }), ...(v.print && { dryRun: true }) });
  if (v.print) return x.show(r, () => r.parts ?? []);
  x.show(r, () => (r.position ? `queued, number ${r.position} in line` : `reading ${r.sentences} ${r.sentences === 1 ? "sentence" : "sentences"}, about ${seconds(r.estimatedMs)}`));
  if (v.wait) await waitUntilQuiet(c);
}

/** Returns when nothing is playing or waiting any more; a reading that ends in an error is a failure. */
async function waitUntilQuiet(c: AppClient): Promise<void> {
  const ac = new AbortController();
  for await (const s of c.events(ac.signal)) {
    if (s.queued > 0 || (s.status !== "finished" && s.status !== "idle" && s.status !== "error")) continue;
    ac.abort();
    if (s.status === "error") throw new CliError("failed", "the reading stopped with an error.");
    return;
  }
}

async function exportFile(x: Ctx, c: AppClient, o: { text: string; out: string }): Promise<void> {
  let job = await c.startExport(o.text, o.out);
  while (job.stage !== "done" && job.stage !== "error" && job.stage !== "cancelled") {
    await x.io.sleep(400);
    job = await c.exportStatus(job.id);
  }
  if (job.stage === "cancelled") throw new CliError("failed", "the export was cancelled in Speak Kit.");
  if (job.stage === "error") throw new CliError("failed", `the export failed${job.error ? ` (${job.error})` : ""}.`);
  x.show(job, () => `saved ${job.path ?? o.out}`);
}

function skillLine(s: SkillState, version: string): string {
  if (s.state === "none") return "not installed";
  if (s.state === "current") return `up to date (${version})`;
  return `out of date: the skill is for ${s.installedFor}, this app is ${version}`;
}

async function skill(x: Ctx): Promise<void> {
  const { io } = x;
  const [verb = "print", ...extra] = x.rest;
  if (extra.length) throw new CliError("invalid_input", "skill takes one word: print, install or status.");
  const dir = x.v.dir ? path.resolve(io.cwd, x.v.dir) : path.join(io.home, ".claude", "skills");
  const fs = { read: (f: string) => orNull(io.files.read(f)), write: io.files.write };
  if (verb === "print") return io.out(skillText(io.version));
  if (verb === "install") {
    const file = await installSkill(fs, dir, io.version);
    return x.show({ installed: file, version: io.version }, () => `installed ${file}`);
  }
  if (verb !== "status") throw new CliError("invalid_input", `unknown skill command "${verb}".`);
  const s = await skillState(fs, dir, io.version);
  x.show(s, () => skillLine(s, io.version));
}

const PATH_VERBS: Record<string, (l: Launcher) => Promise<CliInstall>> = { status: (l) => l.inspect(), install: (l) => l.install(), remove: (l) => l.remove() };

async function pathCommand(x: Ctx): Promise<void> {
  const [verb = "status", ...extra] = x.rest;
  const run = Object.hasOwn(PATH_VERBS, verb) ? PATH_VERBS[verb] : undefined;
  if (extra.length || !run) throw new CliError("invalid_input", "path takes one word: status, install or remove.");
  if (!x.io.launcher) throw new CliError("unsupported", "putting speakkit on the PATH works only from the installed Speak Kit.");
  const r = await run(x.io.launcher);
  x.show(r, () => [
    `${r.state}${r.problem ? `: ${r.problem}` : ""}`,
    ...(r.state === "installed" && !r.onPath ? [`${r.dir} is not on your PATH yet; add it to use speakkit by name.`] : []),
    ...(r.needsNewTerminal ? ["Open a new terminal for the change to take effect."] : []),
  ]);
}
