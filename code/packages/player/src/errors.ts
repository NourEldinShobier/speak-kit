import type { ErrorCode } from "@speakkit/protocol";

export function mapHttpError(status: number): { code: ErrorCode; message: string } {
  if (status === 401 || status === 403) return { code: "token-rejected", message: "The Speak Kit app rejected the pairing token." };
  if (status === 503 || status === 425) return { code: "engine-not-ready", message: "The voice engine is not ready yet." };
  if (status === 429) return { code: "busy", message: "Speak Kit is busy reading something else." };
  if (status === 400) return { code: "invalid-request", message: "The Speak Kit app could not understand the request." };
  return { code: "synthesis-failed", message: `The Speak Kit app answered with HTTP ${status}.` };
}

/** A failure of the stream that maps to a user-facing error code. */
export class StreamError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
