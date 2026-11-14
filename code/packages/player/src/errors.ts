import type { ErrorCode, PlayerState } from "@speakkit/protocol";

/** Maps an HTTP status (and parsed error body) of POST /v1/speak to the user-facing error code and message. A 404 is a token rejection only when its body says so. */
export function mapHttpError(status: number, body?: unknown): { code: ErrorCode; message: string } {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (status === 401 || status === 403 || (status === 404 && code === "token-rejected")) return { code: "token-rejected", message: "The Speak Kit app rejected the pairing token." };
  if (status === 503 || status === 425) return { code: "engine-not-ready", message: "The voice engine is not ready yet." };
  if (status === 429) return { code: "busy", message: "Speak Kit is busy reading something else." };
  if (status === 400) return { code: "invalid-request", message: "The Speak Kit app could not understand the request." };
  return { code: "synthesis-failed", message: `The Speak Kit app answered with HTTP ${status}.` };
}

/** A failure of the stream that maps to a user-facing error code. */
export class StreamError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** The error to show for anything a stream threw: a StreamError keeps its code, a TypeError from fetch means the app is unreachable. */
export function toPlayerError(e: unknown): NonNullable<PlayerState["error"]> {
  if (e instanceof StreamError) return { code: e.code, message: e.message };
  if (e instanceof TypeError) return { code: "app-not-running", message: "Speak Kit could not reach the app. Is it running?" };
  return { code: "synthesis-failed", message: e instanceof Error ? e.message : "Speech synthesis failed." };
}
