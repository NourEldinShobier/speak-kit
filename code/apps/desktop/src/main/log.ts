import log from "electron-log/main";
import path from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;

interface LogMessage {
  date: Date;
  level: string;
  data: unknown[];
}

const plain = (_key: string, v: unknown) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v);

/** One JSON object per line: time, level, process id and the logged values. */
export const jsonLine = ({ date, level, data }: LogMessage): string => JSON.stringify({ t: date.toISOString(), level, pid: process.pid, data }, plain);

/** Main-process log file `<userData>/logs/main.log` as JSON lines; electron-log rotates it to main.old.log past 1 MB. Uncaught errors are written too. */
export function initLog(dataDir: string) {
  log.transports.file.resolvePathFn = () => path.join(dataDir, "logs", "main.log");
  log.transports.file.format = ({ message }) => [jsonLine(message)];
  log.transports.file.maxSize = MAX_LOG_BYTES;
  log.transports.console.level = process.env.SPEAKKIT_USER_DATA ? "warn" : "info";
  log.errorHandler.startCatching({ showDialog: false });
  return log;
}
