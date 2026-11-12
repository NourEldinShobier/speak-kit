import type { ServerResponse } from "node:http";
import * as v from "valibot";
import {
  AUTOMATION_ERROR_STATUS,
  AUTOMATION_ERROR_TEXT,
  AUTOMATION_LIMITS,
  automationExportRequestSchema,
  automationSpeakRequestSchema,
  automationStopRequestSchema,
  capabilities,
  type AutomationErrorCode,
  type AutomationLimits,
} from "@speakkit/protocol";
import { AutomationFault, type AutomationHost } from "../automation";
import { HttpError, json, readBody } from "../http";
import type { Route, Services } from "../router";

function fail(res: ServerResponse, code: AutomationErrorCode, message?: string): void {
  const text = message ?? AUTOMATION_ERROR_TEXT[code];
  if (code === "queue_full") res.setHeader("Retry-After", "1");
  json(res, AUTOMATION_ERROR_STATUS[code], { code, error: { code, message: text } });
}

/** Runs `work`; a refusal of the host becomes the typed error body, anything else is an internal error. */
async function guarded(res: ServerResponse, work: () => Promise<void> | void): Promise<void> {
  try {
    await work();
  } catch (e) {
    if (e instanceof AutomationFault) return fail(res, e.code, e.message === e.code ? undefined : e.message);
    throw e;
  }
}

const host = (s: Services): AutomationHost | null => s.automation ?? null;

/** The body parsed with `schema`, or null after answering invalid_input. Text is checked for size here so a huge body never reaches the host. */
async function body<S extends v.GenericSchema>(x: { req: Parameters<typeof readBody>[0]; res: ServerResponse }, schema: S): Promise<v.InferOutput<S> | null> {
  const r = v.safeParse(schema, await readBody(x.req));
  if (r.success) return r.output;
  fail(x.res, "invalid_input");
  return null;
}

function checkText(res: ServerResponse, text: string): boolean {
  if (!text.trim()) return (void fail(res, "invalid_input", "there is no text to read"), false);
  if (text.length > AUTOMATION_LIMITS.maxTextChars) return (void fail(res, "too_large", `the text is over ${AUTOMATION_LIMITS.maxTextChars} characters`), false);
  return true;
}

export const limitsOf = (s: Services): AutomationLimits => ({
  maxStreams: s.queue.maxStreams,
  maxWaiting: s.queue.maxQueue,
  maxTextChars: AUTOMATION_LIMITS.maxTextChars,
  maxQueued: AUTOMATION_LIMITS.maxQueued,
  maxSubscribers: AUTOMATION_LIMITS.maxSubscribers,
  heartbeatMs: s.heartbeatMs,
  controlDeadlineMs: s.deadlines.controlMs,
  streamIdleMs: s.deadlines.streamIdleMs,
});

/** A server-sent event stream: the status now and after every change, a comment line as heartbeat, at most `maxSubscribers` at once. */
function events(x: Parameters<Route["handle"]>[0], s: Services, h: AutomationHost): Promise<void> {
  const { res } = x;
  if (s.events.open >= AUTOMATION_LIMITS.maxSubscribers) {
    res.setHeader("Retry-After", "5");
    throw new HttpError(429, "busy", `at most ${AUTOMATION_LIMITS.maxSubscribers} event streams`);
  }
  s.events.open++;
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Content-Type-Options": "nosniff" });
  const send = (status: unknown) => void res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
  send(h.status());
  const off = h.subscribe(send);
  const beat = setInterval(() => void res.write(": hb\n\n"), s.heartbeatMs);
  return new Promise<void>((resolve) => {
    res.on("close", () => {
      clearInterval(beat);
      off();
      s.events.open--;
      resolve();
    });
  });
}

/** Everything a script or an AI app does through the command line tool and the MCP server. */
export const automationRoutes: Route[] = [
  { method: "GET", path: "/v1/limits", handle: ({ res }, s) => json(res, 200, limitsOf(s)) },
  { method: "GET", path: "/v1/capabilities", handle: ({ res }, s) => json(res, 200, capabilities(s.version)) },
  {
    method: "GET",
    path: "/v1/automation/status",
    handle: ({ res }, s) => guarded(res, () => (host(s) ? json(res, 200, host(s)!.status()) : fail(res, "unsupported"))),
  },
  {
    method: "GET",
    path: "/v1/automation/queue",
    handle: ({ res }, s) => guarded(res, () => (host(s) ? json(res, 200, host(s)!.queue()) : fail(res, "unsupported"))),
  },
  {
    method: "POST",
    path: "/v1/automation/speak",
    handle: (x, s) =>
      guarded(x.res, async () => {
        const h = host(s);
        const req = await body(x, automationSpeakRequestSchema);
        if (!req) return;
        if (!h) return fail(x.res, "unsupported");
        if (!checkText(x.res, req.text)) return;
        x.signal.throwIfAborted();
        json(x.res, 202, await h.speak(req));
      }),
  },
  {
    method: "POST",
    path: "/v1/automation/stop",
    handle: (x, s) =>
      guarded(x.res, async () => {
        const raw = await readBody(x.req).catch(() => ({}));
        const r = v.safeParse(automationStopRequestSchema, raw ?? {});
        if (!r.success) return fail(x.res, "invalid_input");
        if (!host(s)) return fail(x.res, "unsupported");
        json(x.res, 200, host(s)!.stop(r.output.clear ?? false));
      }),
  },
  {
    method: "POST",
    path: "/v1/automation/export",
    handle: (x, s) =>
      guarded(x.res, async () => {
        const req = await body(x, automationExportRequestSchema);
        if (!req) return;
        if (!host(s)) return fail(x.res, "unsupported");
        if (!checkText(x.res, req.text)) return;
        json(x.res, 202, await host(s)!.startExport(req));
      }),
  },
  {
    method: "GET",
    path: /^\/v1\/automation\/export\/([\w-]{1,64})$/,
    handle: ({ res, params }, s) =>
      guarded(res, () => {
        if (!host(s)) return fail(res, "unsupported");
        const job = host(s)!.exportStatus(params[0]!);
        if (!job) throw new HttpError(404, "not-found", "no such export");
        json(res, 200, job);
      }),
  },
  {
    method: "GET",
    path: "/v1/automation/events",
    stream: true,
    handle: (x, s) => {
      const h = host(s);
      if (!h) return guarded(x.res, () => fail(x.res, "unsupported"));
      return events(x, s, h);
    },
  },
];
