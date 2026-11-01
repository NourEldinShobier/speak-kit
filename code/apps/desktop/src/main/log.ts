import log from "electron-log/main";
import path from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;

/** Main-process log file `<userData>/logs/main.log`; electron-log rotates it to main.old.log past 1 MB. Uncaught errors are written too. */
export function initLog(dataDir: string) {
  log.transports.file.resolvePathFn = () => path.join(dataDir, "logs", "main.log");
  log.transports.file.maxSize = MAX_LOG_BYTES;
  log.transports.console.level = process.env.SPEAKKIT_USER_DATA ? "warn" : "info";
  log.errorHandler.startCatching({ showDialog: false });
  return log;
}
