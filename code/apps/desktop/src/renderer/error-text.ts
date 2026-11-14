/** The one place where a DesktopError (code and arguments from main) becomes the sentence the user reads. */
import type { DesktopError, DesktopErrorCode, ErrorArgs } from "../shared/errors";
import { at } from "../shared/i18n";
import "../shared/i18n/packs/main";

type Table = { [C in DesktopErrorCode]: (args: ErrorArgs[C]) => string };

const MAC = "darwin";

export const ERROR_TEXT: Table = {
  unexpected: (a) => a.detail,
  "server-error": (a) => a.detail ?? at("err.serverHttp", { status: a.status }),
  "no-audio": () => at("err.noAudio"),
  "no-free-port": (a) => at("err.noFreePort", { from: String(a.from), to: String(a.to) }),
  "file-too-large": (a) => at("err.fileTooLarge", { name: a.name, mb: a.mb }),
  "dropped-file-too-large": (a) => at("err.droppedTooLarge", { mb: a.mb }),
  "page-too-large": () => at("err.pageTooLarge"),
  "not-a-web-address": () => at("err.notWebAddress"),
  "only-http": () => at("err.onlyHttp"),
  "too-many-redirects": (a) => at("err.redirects", a),
  "local-address": (a) => at("err.localAddress", a),
  "no-answer": (a) => at("err.noAnswer", a),
  unreachable: (a) => at("err.unreachable", a),
  "http-status": (a) => at("err.httpStatus", { host: a.host, status: String(a.status) }),
  "not-a-web-page": (a) => at("err.notWebPage", { host: a.host, type: a.type || at("err.unknownType") }),
  "page-has-no-text": (a) => at("err.pageNoText", a),
  "unsupported-type": (a) => at("err.unsupported", { ext: a.ext || at("err.thisFile"), supported: a.supported }),
  unreadable: (a) => at("err.unreadable", a),
  "file-has-no-text": (a) => at("err.fileNoText", a),
  "nothing-to-add": () => at("err.nothingToAdd"),
  "bad-archive": (a) => at("err.badArchive", a),
  "archive-too-many-parts": (a) => at("err.archiveParts", { name: a.name, count: String(a.count) }),
  "archive-part-outside": (a) => at("err.archiveOutside", a),
  "archive-too-big": (a) => at("err.archiveBig", a),
  "parse-timeout": () => at("err.parseTimeout"),
  "parser-exited": (a) => at("err.parserExited", { exitCode: String(a.exitCode) }),
  "could-not-read": () => at("err.couldNotRead"),
  "too-many-requests": () => at("err.tooManyRequests"),
  "nothing-to-export": () => at("err.nothingToExport"),
  "file-exists": () => at("err.fileExists"),
  "mp3-failed": () => at("err.mp3"),
  "render-failed": (a) => a.detail ?? at("err.render"),
  "not-exported": () => at("err.notExported"),
  "no-selection": () => at("err.noSelection"),
  "nothing-to-read": () => at("err.nothingToRead"),
  "selection-unsupported": () => at("err.selectionUnsupported"),
  "shortcut-invalid": () => at("err.shortcutInvalid"),
  "shortcut-needs-modifier": () => at("err.shortcutModifier"),
  "shortcut-needs-two": () => at("err.shortcutTwo"),
  "shortcut-reserved": () => at("err.shortcutReserved"),
  "shortcut-bad-key": () => at("err.shortcutBadKey"),
  "shortcut-meta-key": (a) => at(a.platform === MAC ? "err.shortcutCommand" : "err.shortcutWindows"),
  "shortcut-duplicate": () => at("err.shortcutDuplicate"),
  "shortcut-taken": () => at("err.shortcutTaken"),
  "update-offline": () => at("err.updateOffline"),
  "update-not-found": () => at("err.updateNotFound"),
  "update-checksum": () => at("err.updateChecksum"),
  "update-interrupted": () => at("err.updateInterrupted"),
  "update-failed": (a) => a.detail,
};

/** The sentence for an error. A code from a newer main process that this table lacks falls back to its name. */
export function errorText(e: DesktopError): string {
  const text = ERROR_TEXT[e.code] as ((args: unknown) => string) | undefined;
  return text ? text("args" in e ? e.args : undefined) : e.code;
}

/** Title and body of a failed update; the title follows the phase. */
export function updateErrorText(error: DesktopError, phase: "check" | "download"): { title: string; body: string } {
  return { title: at(phase === "download" ? "err.updateDownloadTitle" : "err.updateCheckTitle"), body: errorText(error) };
}
