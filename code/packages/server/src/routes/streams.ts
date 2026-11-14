import type { IncomingMessage, ServerResponse } from "node:http";
import * as v from "valibot";
import { STREAM_LIMITS, streamCreateSchema } from "@speakkit/protocol";
import { AutomationFault } from "../automation";
import { json, readBody, readBytes } from "../http";
import type { Exchange, Route, Services } from "../router";
import type { StreamEvent, StreamSessions } from "../streams/sessions";
import { guarded } from "./automation";

const OWNER = "x-stream-owner";
const owner = (req: IncomingMessage): string | undefined => (typeof req.headers[OWNER] === "string" ? req.headers[OWNER] : undefined);

/** The sessions, or the "unsupported" every automation route gives when the host app lends no speech engine. */
const sessions = (s: Services): StreamSessions => {
  if (!s.streams) throw new AutomationFault("unsupported");
  return s.streams;
};

const ID = "([\\w-]{1,64})";
const at = (suffix: string) => new RegExp(`^/v1/streams/${ID}${suffix}$`);

/** What an event carries to the client. */
function payload(e: StreamEvent): unknown {
  if (e.type === "segment") return e.segment;
  return e.type === "done" ? e.result : { code: e.code, message: e.message };
}

/** The stream of events of one stream: a `segment` event each, then `done` or `failed`, and a comment line as heartbeat. */
function events(x: Exchange, s: Services): Promise<void> {
  const { res } = x;
  const live = sessions(s);
  const queued: StreamEvent[] = [];
  let ready = false;
  const send = (e: StreamEvent) => {
    res.write(`event: ${e.type}
data: ${JSON.stringify(payload(e))}

`);
    if (e.type !== "segment") res.end(); // nothing follows a done or a failed
  };
  // Subscribing first keeps a wrong stream or owner an ordinary error reply; what it replays waits until the headers are out.
  const off = live.subscribe(x.params[0]!, owner(x.req), { event: (e) => (ready ? send(e) : void queued.push(e)), end: () => res.end() });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Content-Type-Options": "nosniff" });
  res.flushHeaders();
  ready = true;
  for (const e of queued) send(e);
  const beat = setInterval(() => void (!res.writableEnded && res.write(": hb\n\n")), s.heartbeatMs);
  return new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(beat);
      off();
      resolve();
    };
    if (res.writableEnded) return stop();
    res.on("close", stop);
  });
}

const created = (res: ServerResponse, body: unknown) => json(res, 201, body);

/** Live transcription for other apps: create a stream, feed it audio, read finished segments, finish. */
export const streamRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/streams",
    handle: (x, s) =>
      guarded(x.res, async () => {
        const body = v.safeParse(streamCreateSchema, await readBody(x.req));
        if (!body.success) throw new AutomationFault("invalid_input");
        created(x.res, sessions(s).create(body.output));
      }),
  },
  {
    method: "POST",
    path: at("/audio"),
    handle: (x, s) =>
      guarded(x.res, async () => {
        const live = sessions(s);
        const buf = await readBytes(x.req, STREAM_LIMITS.maxChunkBytes);
        json(x.res, 202, { bytes: live.audio(x.params[0]!, owner(x.req), buf) });
      }),
  },
  {
    method: "POST",
    path: at("/heartbeat"),
    handle: (x, s) =>
      guarded(x.res, () => {
        sessions(s).heartbeat(x.params[0]!, owner(x.req));
        json(x.res, 200, { leaseMs: STREAM_LIMITS.leaseMs });
      }),
  },
  { method: "GET", path: at("/events"), stream: true, handle: (x, s) => guarded(x.res, () => events(x, s)) },
  {
    method: "POST",
    path: at("/finish"),
    stream: true,
    handle: (x, s) => guarded(x.res, async () => json(x.res, 200, await sessions(s).finish(x.params[0]!, owner(x.req)))),
  },
  {
    method: "DELETE",
    path: at(""),
    handle: (x, s) =>
      guarded(x.res, () => {
        sessions(s).cancel(x.params[0]!, owner(x.req));
        json(x.res, 200, { cancelled: true });
      }),
  },
];
