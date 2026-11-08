import type { ServerResponse } from "node:http";
import { FRAMES_CONTENT_TYPE, encodeFrame, type FrameHeader } from "@speakkit/protocol";
import { EngineNotReadyError, type TtsEngine } from "@speakkit/engine";
import { parseReplace, parseSpeak, speakSchema } from "../config";
import { HttpError, readBody, validated } from "../http";
import { render } from "../render";
import type { Route, Services } from "../router";
import type { Stream, StreamQueue } from "../stream-queue";
import { voiceIds } from "./voice-ids";

type Body = ReturnType<typeof parseSpeak>;
type Replace = ReturnType<typeof parseReplace>;

/** POST /v1/speak: synthesizes the sentences in order and streams one frame each (see protocol/frames.ts). */
export const speakRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/speak",
    stream: true,
    handle: async ({ req, res }, s) => {
      const replace = validated(() => parseReplace(req.headers["x-speakkit-replace"]));
      const raw = await readBody(req);
      const body = validated(() => parseSpeak(speakSchema(voiceIds(s.engines)), raw));
      await speak(res, s, { body, replace });
    },
  },
];

/** Registers the stream with the queue (replacing earlier ones, or refusing with 429) and ties it to the connection. */
function open(res: ServerResponse, queue: StreamQueue, replace: Replace): Stream {
  if (replace) queue.replace(replace);
  else if (queue.full) {
    res.setHeader("Retry-After", "1");
    throw new HttpError(429, "busy", `at most ${queue.maxStreams} streams and ${queue.maxQueue} queued`);
  }
  const stream: Stream = { ac: new AbortController(), ...(replace && "group" in replace && { group: replace.group }) };
  queue.streams.add(stream);
  res.on("close", () => {
    queue.streams.delete(stream);
    if (!res.writableFinished) stream.ac.abort();
    stream.dequeue?.();
  });
  return stream;
}

function writeHead(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": FRAMES_CONTENT_TYPE, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.flushHeaders();
}

/** One write per frame; node flushes it to the socket immediately (TCP_NODELAY is set). Waits for drain when the client reads slowly. */
function frameSender(res: ServerResponse): (h: FrameHeader, pcm?: Int16Array) => Promise<void> {
  return async (h, pcm) => {
    if (res.destroyed || res.write(encodeFrame(h, pcm))) return;
    await new Promise<void>((r) => {
      const done = () => (res.off("drain", done), res.off("close", done), r());
      res.on("drain", done);
      res.on("close", done);
    });
  };
}

/** Renders one sentence; gives up when no audio arrives within `idleMs`. A model that is still loading or downloading does not count as stalled. */
async function renderWithin(engine: TtsEngine, sentence: string, o: { voice: string; speed: number; signal: AbortSignal; idleMs: number }) {
  const { idleMs, ...synth } = o;
  const stall = new AbortController();
  const stalled = new Promise<never>((_, reject) => stall.signal.addEventListener("abort", () => reject(stall.signal.reason), { once: true }));
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      const { state } = engine.status();
      if (state === "loading" || state === "downloading") arm();
      else stall.abort(new Error(`no audio for ${idleMs / 1000} s`));
    }, idleMs);
  };
  arm();
  try {
    return await Promise.race([render(engine, sentence, { ...synth, signal: AbortSignal.any([synth.signal, stall.signal]) }), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

async function speak(res: ServerResponse, { engines, queue, deadlines }: Services, { body, replace }: { body: Body; replace: Replace }): Promise<void> {
  const stream = open(res, queue, replace);
  const ac = stream.ac;
  const engine = engines.active;
  engine.warm?.(); // start loading while we may still be queued

  let release: () => void;
  try {
    release = await queue.acquire(stream);
  } catch {
    // Replaced or disconnected while queued: end the stream without frames.
    if (!res.destroyed && !res.headersSent) writeHead(res);
    return void res.end();
  }
  const endStream = engine.beginStream?.();
  writeHead(res);
  const send = frameSender(res);
  try {
    const speed = Math.min(body.speed, 2);
    for (const [i, sentence] of body.sentences.entries()) {
      if (ac.signal.aborted) return; // the client left or the stream was replaced while the last frame was being sent
      const { pcm, sampleRate } = await renderWithin(engine, sentence, { voice: body.voice, speed, signal: ac.signal, idleMs: deadlines.streamIdleMs });
      if (ac.signal.aborted) return;
      await send({ type: "audio", index: i, sampleRate, samples: pcm.length, durationMs: Math.round((pcm.length / sampleRate) * 1000) }, pcm);
    }
    await send({ type: "done", count: body.sentences.length });
  } catch (e) {
    if (ac.signal.aborted) return;
    const notReady = e instanceof EngineNotReadyError;
    await send({ type: "error", code: notReady ? "engine-not-ready" : "synthesis-failed", message: e instanceof Error ? e.message : String(e) });
  } finally {
    endStream?.();
    release();
    if (!res.writableEnded) res.end(); // replaced streams end here, without a done frame
  }
}
