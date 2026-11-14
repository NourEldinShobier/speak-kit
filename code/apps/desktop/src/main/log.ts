import log from "electron-log/main";
import { chmod, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { ignore } from "../shared/ignore";
import path from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;

interface LogMessage {
  date: Date;
  level: string;
  data: unknown[];
}

/** OpenAI secret keys (sk-...) and Realtime client secrets (ek_...). Nothing that looks like one is written to a log, wherever it sits in the text. */
const SECRET = /(?:sk-[A-Za-z0-9_-]{8,}|ek_[A-Za-z0-9]{8,})/g;
export const redact = (s: string): string => s.replace(SECRET, "[redacted]");

/** A logged value with secrets blanked out: strings, Errors and anything that serializes to JSON. */
export function redactValue(x: unknown): unknown {
  if (typeof x === "string") return redact(x);
  if (x instanceof Error) {
    const e = new Error(redact(x.message));
    e.name = x.name;
    if (x.stack) e.stack = redact(x.stack);
    return e;
  }
  try {
    const json = JSON.stringify(x);
    return json && redact(json) !== json ? JSON.parse(redact(json)) : x;
  } catch {
    return x;
  }
}

const plain = (_key: string, v: unknown) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v);

/** One JSON object per line: time, level, process id and the logged values. */
export const jsonLine = ({ date, level, data }: LogMessage): string => redact(JSON.stringify({ t: date.toISOString(), level, pid: process.pid, data }, plain));

const DAY_MS = 24 * 60 * 60 * 1000;
/** Log files older than this are removed at start. */
export const LOG_MAX_AGE_MS = 14 * DAY_MS;
/** The same line within this time of its last appearance is counted, not written again. */
export const REPEAT_WINDOW_MS = 60_000;

const keyOf = ({ level, data }: LogMessage): string => `${level}:${JSON.stringify(data, plain)}`;

/**
 * One line per repeated fault: a line identical to the one just before it (same level, same values) inside the window is dropped and counted. The next
 * line that is written, different or the same after the window, ends with a note saying how many were left out. Keeps a fault that fires every few
 * milliseconds from filling the file.
 */
export function createRepeatFilter(now: () => number = Date.now, windowMs = REPEAT_WINDOW_MS) {
  let last: { key: string; at: number; skipped: number } | undefined;
  return <T extends LogMessage>(message: T): T | undefined => {
    const key = keyOf(message);
    const at = now();
    if (last && last.key === key && at - last.at < windowMs) {
      last.skipped++;
      return undefined;
    }
    const skipped = last?.skipped ?? 0;
    last = { key, at, skipped: 0 };
    return skipped > 0 ? { ...message, data: [...message.data, `${skipped} identical lines before this one were left out`] } : message;
  };
}

/** Log files in the folder that are older than `maxAgeMs`. */
export function staleLogs(files: readonly { name: string; modified: number }[], now: number, maxAgeMs = LOG_MAX_AGE_MS): string[] {
  return files.filter((f) => f.name.endsWith(".log") && now - f.modified > maxAgeMs).map((f) => f.name);
}

/** Makes the log folder and its files readable by the owner only (on Windows the folder inherits the user's own profile permissions) and removes old files. Never throws. */
export async function tidyLogs(dir: string, now = Date.now()): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    await chmod(dir, 0o700).catch(ignore);
    const files = await Promise.all((await readdir(dir)).map(async (name) => ({ name, modified: (await stat(path.join(dir, name))).mtimeMs })));
    for (const name of staleLogs(files, now)) await unlink(path.join(dir, name)).catch(ignore);
    for (const f of files) if (f.name.endsWith(".log")) await chmod(path.join(dir, f.name), 0o600).catch(ignore);
  } catch {
    // a log folder that cannot be tidied must not stop the app
  }
}

/** Main-process log file `<userData>/logs/main.log` as JSON lines; electron-log rotates it to main.old.log past 1 MB. Uncaught errors are written too. */
export function initLog(dataDir: string) {
  log.transports.file.resolvePathFn = () => path.join(dataDir, "logs", "main.log");
  log.transports.file.format = ({ message }) => [jsonLine(message)];
  log.transports.file.maxSize = MAX_LOG_BYTES;
  log.transports.console.level = process.env.SPEAKKIT_USER_DATA ? "warn" : "info";
  log.hooks.push((message) => ({ ...message, data: message.data.map(redactValue) })); // before every transport, the console included
  // The file only: the console shows every line, the file counts a fault that repeats.
  const repeats = createRepeatFilter();
  log.hooks.push((message, transport) => (transport === log.transports.file ? (repeats(message) ?? false) : message));
  void tidyLogs(path.join(dataDir, "logs"));
  log.errorHandler.startCatching({ showDialog: false });
  return log;
}
