export type DownloadFailureKind = "unreachable" | "tls" | "proxy-auth" | "blocked" | "not-found" | "server" | "checksum" | "incomplete" | "disk" | "other";

/** What the person should do about a failed download, which the page turns into a button. */
export type DownloadAdvice = "try-again" | "download-again" | "open-proxy-settings" | "free-space";

const ADVICE: Record<DownloadFailureKind, DownloadAdvice> = {
  unreachable: "try-again",
  tls: "open-proxy-settings",
  "proxy-auth": "open-proxy-settings",
  blocked: "open-proxy-settings",
  "not-found": "try-again",
  server: "try-again",
  checksum: "download-again",
  incomplete: "try-again",
  disk: "free-space",
  other: "try-again",
};

export class DownloadError extends Error {
  readonly kind: DownloadFailureKind;
  /** The host that was being reached; empty when the failure was local (disk, checksum). */
  readonly host: string;
  /** Bytes of the partial file that stay on disk, so the next try resumes from there. */
  readonly keptBytes: number;
  constructor(kind: DownloadFailureKind, host: string, keptBytes: number, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DownloadError";
    this.kind = kind;
    this.host = host;
    this.keptBytes = keptBytes;
  }
  get advice(): DownloadAdvice {
    return ADVICE[this.kind];
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const codesOf = (e: unknown): string => {
  const parts: string[] = [];
  for (let x = e as { message?: unknown; code?: unknown; cause?: unknown } | undefined, depth = 0; x && depth < 4; x = x.cause as typeof x, depth++) {
    parts.push(String(x.code ?? ""), String(x.message ?? ""));
  }
  return parts.join(" ");
};

const TLS = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_SSL|ssl|tls|certificate/i;
const UNREACHABLE =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_PROXY|ERR_TUNNEL|ERR_NETWORK|fetch failed|terminated|socket hang up/i;
const DISK = /ENOSPC|EDQUOT|EACCES|EPERM|EROFS/;

/** Turns whatever a download threw into one error that names the host and says what to do. */
export function toDownloadError(e: unknown, url: string, keptBytes: number): DownloadError {
  if (e instanceof DownloadError) return e;
  const host = hostOf(url);
  const text = codesOf(e);
  if (DISK.test(text)) return new DownloadError("disk", "", keptBytes, "Speak Kit could not write the model to disk. Free some space or check that the models folder can be written to.", e);
  if (TLS.test(text))
    return new DownloadError(
      "tls",
      host,
      keptBytes,
      `The secure connection to ${host} was refused: its certificate is not trusted. A proxy, antivirus or firewall that inspects secure traffic is the usual cause. Add its certificate to the system trust store, or allow ${host} through it.`,
      e,
    );
  if (UNREACHABLE.test(text))
    return new DownloadError("unreachable", host, keptBytes, `Could not reach the model server ${host}. Check your connection, and that your network or firewall allows ${host}.`, e);
  return new DownloadError("other", host, keptBytes, `The download from ${host} failed: ${e instanceof Error ? e.message : String(e)}`, e);
}

/** A server answered with an error status instead of the file. */
export function httpFailure(status: number, url: string, keptBytes: number): DownloadError {
  const host = hostOf(url);
  if (status === 407)
    return new DownloadError(
      "proxy-auth",
      host,
      keptBytes,
      `The proxy asked for a sign-in before it would let Speak Kit reach ${host} (HTTP 407). Sign in through the system proxy settings, then try again.`,
    );
  if (status === 401 || status === 403 || status === 451)
    return new DownloadError("blocked", host, keptBytes, `${host} refused the request (HTTP ${status}). A network filter may be blocking it: ask whoever runs your network to allow ${host}.`);
  if (status === 404 || status === 410) return new DownloadError("not-found", host, keptBytes, `${host} no longer has this model file (HTTP ${status}). Update Speak Kit to get the current address.`);
  return new DownloadError("server", host, keptBytes, `${host} had a problem and answered HTTP ${status}. Try again in a few minutes.`);
}

export const checksumFailure = (file: string, url: string): DownloadError =>
  new DownloadError("checksum", hostOf(url), 0, `The downloaded file did not match its check value, so it was removed. Download it again. (${file})`);

export const incompleteFailure = (file: string, url: string, got: number, want: number): DownloadError =>
  new DownloadError("incomplete", hostOf(url), Math.max(0, got), `The download of ${file} is incomplete (${got} of ${want} bytes). The part already downloaded is kept.`);

/** Failures where another host with the same file may still work. */
export const worthAnotherHost = (e: DownloadError): boolean => e.kind === "unreachable" || e.kind === "server" || e.kind === "blocked" || e.kind === "tls" || e.kind === "not-found";
