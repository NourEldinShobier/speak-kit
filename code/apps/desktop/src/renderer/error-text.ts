/** The one place where a DesktopError (code and arguments from main) becomes the sentence the user reads. */
import type { DesktopError, DesktopErrorCode, ErrorArgs } from "../shared/errors";

type Table = { [C in DesktopErrorCode]: (args: ErrorArgs[C]) => string };

const MAC = "darwin";

export const ERROR_TEXT: Table = {
  unexpected: (a) => a.detail,
  "server-error": (a) => a.detail ?? `The server answered HTTP ${a.status}.`,
  "no-audio": () => "The server sent no audio.",
  "no-free-port": (a) => `No free port from ${a.from} to ${a.to}`,
  "file-too-large": (a) => `${a.name} is larger than ${a.mb} MB.`,
  "dropped-file-too-large": (a) => `The file is larger than ${a.mb} MB.`,
  "page-too-large": () => "That page is larger than 8 MB.",
  "not-a-web-address": () => "That is not a web address.",
  "only-http": () => "Only http and https addresses can be read.",
  "too-many-redirects": (a) => `${a.host} redirected too many times.`,
  "local-address": (a) => `${a.host} is on this computer or your local network. Only public web addresses can be read.`,
  "no-answer": (a) => `${a.host} did not answer in ${a.seconds} seconds.`,
  unreachable: (a) => `Could not reach ${a.host}. Check the address and your connection.`,
  "http-status": (a) => `${a.host} answered with HTTP ${a.status}.`,
  "not-a-web-page": (a) => `${a.host} is not a web page (${a.type || "unknown type"}). Download the file and add it instead.`,
  "page-has-no-text": (a) => `No readable text was found on ${a.host}.`,
  "unsupported-type": (a) => `${a.ext || "This file"} is not a supported type. Supported: ${a.supported}.`,
  unreadable: (a) => `${a.name} could not be read: ${a.detail}`,
  "file-has-no-text": (a) => `${a.name} has no text to read.`,
  "nothing-to-add": () => "There is no text to add.",
  "bad-archive": (a) => `${a.name} is not a valid archive.`,
  "archive-too-many-parts": (a) => `${a.name} has too many parts (${a.count}).`,
  "archive-part-outside": (a) => `${a.name} contains a part outside its own folder.`,
  "archive-too-big": (a) => `${a.name} unpacks to far more than its size, so it was not opened.`,
  "parse-timeout": () => "Reading this took too long, so it was stopped.",
  "parser-exited": (a) => `The reader stopped unexpectedly (${a.exitCode}).`,
  "could-not-read": () => "This could not be read.",
  "too-many-requests": () => "Too many requests at once.",
  "nothing-to-export": () => "There is no text to export.",
  "file-exists": () => "A file with that name already exists.",
  "mp3-failed": () => "MP3 encoding failed.",
  "render-failed": (a) => a.detail ?? "The server could not render the audio.",
  "not-exported": () => "That file was not exported by this session.",
  "no-selection": () => "No text is selected. Select some text, then try again.",
  "nothing-to-read": () => "There is no text to read.",
  "selection-unsupported": () => "Reading the selection is only available on Windows and macOS.",
  "shortcut-invalid": () => "That is not a valid key combination.",
  "shortcut-needs-modifier": () => "Use Ctrl or Alt together with another key.",
  "shortcut-needs-two": () => "Use at least two modifier keys, such as Ctrl+Alt, so normal typing is not blocked.",
  "shortcut-reserved": () => "Windows uses that combination.",
  "shortcut-bad-key": () => "That key cannot be used.",
  "shortcut-meta-key": (a) => (a.platform === MAC ? "The Command key is reserved for macOS." : "The Windows key is reserved for Windows."),
  "shortcut-duplicate": () => "Another Speak Kit action already uses it.",
  "shortcut-taken": () => "Another app is using it.",
  "update-offline": () => "Speak Kit cannot reach the update server. Check your internet connection and try again.",
  "update-not-found": () => "No update information is published at the update address yet. Try again later.",
  "update-checksum": () => "The downloaded file did not match its checksum, so it was discarded. Try again; nothing was installed.",
  "update-interrupted": () => "The connection dropped during the download. Try again to fetch the update again; nothing was installed.",
  "update-failed": (a) => a.detail,
  "clip-rejected": (a) => a.message,
};

/** The sentence for an error. A code from a newer main process that this table lacks falls back to its name. */
export function errorText(e: DesktopError): string {
  const text = ERROR_TEXT[e.code] as ((args: unknown) => string) | undefined;
  return text ? text("args" in e ? e.args : undefined) : e.code;
}

/** Title and body of a failed update; the title follows the phase. */
export function updateErrorText(error: DesktopError, phase: "check" | "download"): { title: string; body: string } {
  return { title: phase === "download" ? "Could not download the update" : "Could not check for updates", body: errorText(error) };
}
