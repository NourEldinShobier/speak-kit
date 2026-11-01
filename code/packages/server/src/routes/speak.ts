import type { ServerResponse } from "node:http";
import { FRAMES_CONTENT_TYPE, encodeFrame, type FrameHeader } from "@speakkit/protocol";
import { EngineNotReadyError } from "@speakkit/engine";
import { parseReplace, parseSpeak, speakSchema } from "../config";
import { HttpError, readBody, validated } from "../http";
import { render } from "../render";
import type { Route, Services } from "../router";
import type { Stream } from "../stream-queue";
import { voiceIds } from "./voices";

/** POST /v1/speak: synthesizes the sentences in order and streams one frame each (see protocol/frames.ts). */
export const speakRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/speak",
    handle: async ({ req, res }, s) => {
      const replace = validated(() => parseReplace(req.headers["x-speakkit-replace"]));
      const raw = await readBody(req);
      const body = validated(() => parseSpeak(speakSchema(voiceIds(s.engines)), raw));
      await speak(res, s, body, replace);
    },
  },
];

async function speak(res: ServerResponse, { engines, queue }: Services, body: ReturnType<typeof parseSpeak>, replace: ReturnType<typeof parseReplace>): Promise<void> {
  if (replace) queue.replace(replace);
  else if (queue.full) {
    res.setHeader("Retry-After", "1");
    throw new HttpError(429, "busy", `at most ${queue.maxStreams} streams and ${queue.maxQueue} queued`);
  }
  const stream: Stream = { ac: new AbortController(), group: replace && "group" in replace ? replace.group : undefined };
  const ac = stream.ac;
  queue.streams.add(stream);
  res.on("close", () => {
    queue.streams.delete(stream);
    if (!res.writableFinished) ac.abort();
    stream.dequeue?.();
  });
  const head = () => {
    res.writeHead(200, { "Content-Type": FRAMES_CONTENT_TYPE, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.flushHeaders();
  };
  const engine = engines.active;
  engine.warm?.(); // start loading while we may still be queued

  try {
    await queue.acquire(stream);
  } catch {
    // Replaced or disconnected while queued: end the stream without frames.
    if (!res.destroyed && !res.headersSent) head();
    return void res.end();
  }
  const endStream = engine.beginStream?.();
  head();

  const send = async (h: FrameHeader, pcm?: Int16Array) => {
    if (res.destroyed) return;
    // One write per frame; node flushes it to the socket immediately (TCP_NODELAY is set).
    if (!res.write(encodeFrame(h, pcm)))
      await new Promise<void>((r) => {
        const done = () => (res.off("drain", done), res.off("close", done), r());
        res.on("drain", done);
        res.on("close", done);
      });
  };
  try {
    const speed = Math.min(body.speed, 2);
    for (let i = 0; i < body.sentences.length; i++) {
      const { pcm, sampleRate } = await render(engine, body.sentences[i]!, { voice: body.voice, speed, signal: ac.signal });
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
    queue.release();
    if (!res.writableEnded) res.end(); // replaced streams end here, without a done frame
  }
}
