import * as v from "valibot";

/**
 * Live transcription for other apps on this computer: audio goes in, finished segments come out. All routes need the bearer token.
 *
 *   POST   /v1/streams                 body StreamCreate               -> 201 StreamCreated
 *   POST   /v1/streams/<id>/audio      raw 16 kHz mono 16-bit little-endian, header X-Stream-Owner  -> 202 { bytes }
 *   POST   /v1/streams/<id>/heartbeat  header X-Stream-Owner           -> 200 { leaseMs }
 *   GET    /v1/streams/<id>/events     text/event-stream, header X-Stream-Owner: `segment` per finished segment, `done`, or `failed`
 *   POST   /v1/streams/<id>/finish     header X-Stream-Owner           -> 200 StreamResult (waits for every segment)
 *   DELETE /v1/streams/<id>            header X-Stream-Owner           -> 200 { cancelled: true }
 *
 * Only finished segments are sent; no text is shown while a segment is still being spoken.
 */
export const STREAM_LIMITS = {
  /** Open streams at once. */
  maxStreams: 2,
  /** Largest audio request body. */
  maxChunkBytes: 1024 * 1024,
  /** Audio one stream may carry: 30 minutes. */
  maxStreamBytes: 30 * 60 * 16_000 * 2,
  /** A stream that is neither fed nor kept alive for this long is dropped. */
  leaseMs: 30_000,
  /** The engine takes a segment this long or shorter: a longer stretch of speech is cut here. */
  maxSegmentMs: 15_000,
  /** Shorter than this is not cut at a pause. */
  minSegmentMs: 1_000,
  /** A pause this long ends a segment. */
  pauseMs: 700,
  sampleRate: 16_000,
} as const;

export const streamCreateSchema = v.strictObject({
  /** A language the speech model knows, or auto. */
  language: v.exactOptional(v.pipe(v.string(), v.maxLength(12))),
  /** The result also carries the text after the person's dictation rules and words (replacements, filler removal), without pasting or saving anything. */
  process: v.exactOptional(v.boolean()),
  /** Segments carry their start and end in milliseconds. */
  timestamps: v.exactOptional(v.boolean()),
});
export type StreamCreate = v.InferOutput<typeof streamCreateSchema>;

export interface StreamCreated {
  id: string;
  /** Secret that every later call must send as X-Stream-Owner. */
  owner: string;
  leaseMs: number;
}

export interface StreamSegment {
  n: number;
  text: string;
  startMs?: number;
  endMs?: number;
}

export interface StreamResult {
  text: string;
  /** Only when the stream was created with process. */
  processed?: string;
  segments: StreamSegment[];
}

export const streamResultSchema: v.GenericSchema<unknown, StreamResult> = v.object({
  text: v.string(),
  processed: v.exactOptional(v.string()),
  segments: v.array(v.object({ n: v.number(), text: v.string(), startMs: v.exactOptional(v.number()), endMs: v.exactOptional(v.number()) })),
});
