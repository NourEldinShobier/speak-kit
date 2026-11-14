import * as v from "valibot";

/**
 * Screen vision of the voice chat: the extension asks the app for one look at the screen, on the model's request.
 *
 *   POST /v1/voice-chat/look  { session, scope }  -> 200 ScreenLook | LookError
 *
 * The app asks the user once per conversation (`session`), takes the picture, reads its text with the system OCR and answers with both.
 * Error HTTP status per code: declined 403, no-window 404, busy 409, rate-limited 429, unsupported 501, capture-failed 502, unavailable 503, no-capture 404.
 */
export const LOOK_SCOPES = ["window", "screen"] as const;
export type LookScope = (typeof LOOK_SCOPES)[number];
/** What a request can ask for: the screen or a window, or the capture the user sent from the capture feature (no picture is taken then). */
export const LOOK_REQUEST_SCOPES = [...LOOK_SCOPES, "capture"] as const;
export type LookRequestScope = (typeof LOOK_REQUEST_SCOPES)[number];

/** Largest JPEG in bytes: as base64 in a data URL it must fit one WebRTC data channel message (262144 bytes) with its event around it. */
export const MAX_LOOK_IMAGE_BYTES = 190_000;
/** Longest side of the JPEG in pixels (width of a landscape screen): about 1.1k image tokens. */
export const LOOK_IMAGE_WIDTH = 1280;

export const LOOK_ERROR_CODES = ["declined", "no-window", "busy", "rate-limited", "unsupported", "capture-failed", "unavailable", "no-capture"] as const;
export type LookErrorCode = (typeof LOOK_ERROR_CODES)[number];

export interface LookRequest {
  /** Id of the conversation, made by the extension: the consent card is shown once per id. */
  session: string;
  scope: LookRequestScope;
}

export interface ScreenLook {
  /** JPEG, base64. Empty when the capture was black (protected content, locked screen). */
  image: string;
  width: number;
  height: number;
  /** The text on the screen in reading order, from the full-resolution capture. */
  text: string;
  /** "unavailable": no recognizer for this computer, "empty": no text found */
  ocr: "ok" | "empty" | "unavailable";
  /** The window title, or "screen" */
  target: string;
  scope: LookRequestScope;
  /** "black": nothing visible (protected video, locked screen); "partly": a large black area, possibly protected video */
  black?: "black" | "partly" | undefined;
}

/** `code` is repeated inside `error` so the generic `{ error: { code, message } }` parser also reads it. */
export interface LookError {
  code: LookErrorCode;
  error: { code: LookErrorCode; message: string };
}

const errorCode = v.picklist(LOOK_ERROR_CODES);

export const lookRequestSchema: v.GenericSchema<unknown, LookRequest> = v.object({
  session: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  scope: v.picklist(LOOK_REQUEST_SCOPES),
});

export const screenLookSchema: v.GenericSchema<unknown, ScreenLook> = v.object({
  image: v.string(),
  width: v.number(),
  height: v.number(),
  text: v.string(),
  ocr: v.picklist(["ok", "empty", "unavailable"]),
  target: v.string(),
  scope: v.picklist(LOOK_REQUEST_SCOPES),
  black: v.optional(v.picklist(["black", "partly"])),
});

const parser =
  <T>(schema: v.GenericSchema<unknown, T>) =>
  (x: unknown): T | undefined => {
    const r = v.safeParse(schema, x);
    return r.success ? r.output : undefined;
  };
/** The parsed body of POST /v1/voice-chat/look, or undefined when it does not match. */
export const parseLookRequest = parser(lookRequestSchema);
/** The parsed 200 answer of POST /v1/voice-chat/look, or undefined when it does not match. */
export const parseScreenLook = parser(screenLookSchema);
/** The code of an error body on any HTTP status, or undefined. */
export const parseLookError = parser(
  v.pipe(
    v.object({ code: errorCode }),
    v.transform((b) => b.code),
  ),
);
