import { FrameDecoder, type ReadDoc, type SpeakRequest } from "@speakkit/protocol";
import { StreamError, mapHttpError } from "./errors";
import type { PlayerConfig } from "./types";

const MAX_SENTENCE_CHARS = 2000;

interface ChunkRequest {
  fetch: typeof fetch;
  cfg: PlayerConfig;
  doc: ReadDoc;
  /** Indexes of the document's sentences to synthesize, in order. */
  idxs: number[];
  signal: AbortSignal;
  /** The earlier stream (seek, speed or voice change) was cut: tell the app to drop it instead of finishing work nobody hears. */
  replace: boolean;
  /** False once this stream was superseded (seek, stop): stop reading. */
  current(): boolean;
  /** Resolves when there is room for another sentence in the lookahead. */
  room(): Promise<void>;
  /** One synthesized sentence: its index in the document and its PCM. */
  onAudio(index: number, pcm: Int16Array, sampleRate: number, durationMs: number): void;
}

/** POST /v1/speak for one chunk of sentences and feeds its frames to `onAudio`, pausing the read whenever `room` says the lookahead is full. */
export async function readChunk(r: ChunkRequest): Promise<void> {
  const body: SpeakRequest = {
    sentences: r.idxs.map((i) => r.doc.sentences[i]!.text.slice(0, MAX_SENTENCE_CHARS)),
    voice: r.cfg.voice,
    speed: r.cfg.speed,
  };
  if (!r.cfg.token) throw new StreamError("token-rejected", "No pairing token is set. Pair Speak Kit in the extension options.");
  const res = await r.fetch(`http://127.0.0.1:${r.cfg.port}/v1/speak`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${r.cfg.token}`,
      "Content-Type": "application/json",
      ...(r.replace ? { "X-SpeakKit-Replace": `tab-${r.doc.tabId}` } : null),
    },
    body: JSON.stringify(body),
    signal: r.signal,
  });
  if (!r.current()) return;
  if (!res.ok || !res.body) {
    const e = mapHttpError(res.status, await errorBody(res));
    throw new StreamError(e.code, e.message);
  }
  const reader = res.body.getReader();
  const decoder = new FrameDecoder();
  try {
    for (;;) {
      await r.room();
      if (!r.current()) return;
      const { done, value } = await reader.read();
      if (!r.current()) return;
      if (done) throw new StreamError("synthesis-failed", "The stream ended before the server finished it.");
      // One read can carry many frames; wait for room before each so the lookahead limit holds.
      for (const f of decoder.push(value)) {
        await r.room();
        if (!r.current()) return;
        const h = f.header;
        if (h.type === "done") return;
        if (h.type === "error") throw new StreamError(h.code, h.message);
        const index = r.idxs[h.index];
        if (index !== undefined && f.pcm) r.onAudio(index, f.pcm, h.sampleRate, h.durationMs);
      }
    }
  } finally {
    void reader.cancel().catch(() => {}); // the stream is already closed or errored
  }
}

/** The parsed JSON error body of a failed response, or undefined when it is not JSON. */
async function errorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
