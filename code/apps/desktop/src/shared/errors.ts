/**
 * Errors that cross from main to the renderer: a closed code plus its arguments, never English text. The renderer owns the
 * wording (renderer/error-text.ts has one entry per code). Not for the HTTP wire: those errors use ERROR_CODES in
 * packages/protocol. Area: desktop shell.
 */

/** Arguments per code; `undefined` means the code takes none. */
export interface ErrorArgs {
  /** Anything nobody planned for; `detail` is the diagnostic of the underlying error. */
  unexpected: { detail: string };
  "server-error": { status: number; detail: string | null };
  "no-audio": undefined;
  "no-free-port": { from: number; to: number };
  "file-too-large": { name: string; mb: number };
  /** The file dropped on the library, which main never sees: the name is shown by the caller. */
  "dropped-file-too-large": { mb: number };
  "page-too-large": undefined;
  "not-a-web-address": undefined;
  "only-http": undefined;
  "too-many-redirects": { host: string };
  "local-address": { host: string };
  "no-answer": { host: string; seconds: number };
  unreachable: { host: string };
  "http-status": { host: string; status: number };
  "not-a-web-page": { host: string; type: string };
  "page-has-no-text": { host: string };
  "unsupported-type": { ext: string; supported: string };
  unreadable: { name: string; detail: string };
  "file-has-no-text": { name: string };
  "nothing-to-add": undefined;
  "bad-archive": { name: string };
  "archive-too-many-parts": { name: string; count: number };
  "archive-part-outside": { name: string };
  "archive-too-big": { name: string };
  "parse-timeout": undefined;
  "parser-exited": { exitCode: number };
  "could-not-read": undefined;
  "too-many-requests": undefined;
  "nothing-to-export": undefined;
  "file-exists": undefined;
  "mp3-failed": undefined;
  "render-failed": { detail: string | null };
  "not-exported": undefined;
  "no-selection": undefined;
  "nothing-to-read": undefined;
  "selection-unsupported": undefined;
  "shortcut-invalid": undefined;
  "shortcut-needs-modifier": undefined;
  "shortcut-needs-two": undefined;
  "shortcut-reserved": undefined;
  "shortcut-bad-key": undefined;
  "shortcut-meta-key": { platform: string };
  "shortcut-duplicate": undefined;
  "shortcut-taken": undefined;
  "update-offline": undefined;
  "update-not-found": undefined;
  "update-checksum": undefined;
  "update-interrupted": undefined;
  "update-failed": { detail: string };
}

export type DesktopErrorCode = keyof ErrorArgs;

export type DesktopError = {
  [C in DesktopErrorCode]: ErrorArgs[C] extends undefined ? { code: C } : { code: C; args: ErrorArgs[C] };
}[DesktopErrorCode];

const PREFIX = "speakkit-error:";
/** What Electron puts before the message of a handler that threw. */
const IPC_PREFIX = /^Error invoking remote method '[^']+': (Error: )?/;

/**
 * Throwable form of a DesktopError. ipcRenderer.invoke keeps only the message of a rejection, so the message is the prefix plus
 * the JSON of the error; `toDesktopError` reads it back on the renderer side.
 */
export class DesktopFault extends Error {
  readonly error: DesktopError;
  constructor(error: DesktopError) {
    super(`${PREFIX}${JSON.stringify(error)}`);
    this.name = "DesktopFault";
    this.error = error;
  }
}

/** Whatever was thrown, as a DesktopError: a DesktopFault (also after an IPC hop) keeps its code, anything else becomes `unexpected`. */
export function toDesktopError(e: unknown): DesktopError {
  if (e instanceof DesktopFault) return e.error;
  const message = e instanceof Error ? e.message : String(e);
  const at = message.indexOf(PREFIX);
  if (at >= 0) {
    try {
      return JSON.parse(message.slice(at + PREFIX.length)) as DesktopError;
    } catch {
      // not our JSON after all: report the text as it is
    }
  }
  return { code: "unexpected", args: { detail: message.replace(IPC_PREFIX, "") } };
}
