import log from "electron-log/main";
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

/** Main-process log file `<userData>/logs/main.log` as JSON lines; electron-log rotates it to main.old.log past 1 MB. Uncaught errors are written too. */
export function initLog(dataDir: string) {
  log.transports.file.resolvePathFn = () => path.join(dataDir, "logs", "main.log");
  log.transports.file.format = ({ message }) => [jsonLine(message)];
  log.transports.file.maxSize = MAX_LOG_BYTES;
  log.transports.console.level = process.env.SPEAKKIT_USER_DATA ? "warn" : "info";
  log.hooks.push((message) => ({ ...message, data: message.data.map(redactValue) })); // before every transport, the console included
  log.errorHandler.startCatching({ showDialog: false });
  return log;
}
