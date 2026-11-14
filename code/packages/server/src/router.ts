import type { IncomingMessage, ServerResponse } from "node:http";
import type { AutomationHost } from "./automation";
import type { EngineRegistry } from "./engines";
import type { ExportManager } from "./export";
import { HttpError } from "./http";
import type { StreamQueue } from "./stream-queue";
import type { PageContextHost } from "./page-context";
import type { DevPages } from "./dev-pages";
import type { StreamSessions } from "./streams/sessions";
import type { MintLimiter, VoiceChatService } from "./voice-chat";

/** What every route handler can reach. */
export interface Services {
  engines: EngineRegistry;
  exporter: ExportManager;
  queue: StreamQueue;
  version: string;
  /** Absent when the host app has no voice chat. */
  voiceChat: VoiceChatService | undefined;
  /** Absent when the host app lends no reader; the automation routes answer "unsupported". */
  automation: AutomationHost | undefined;
  /** Absent when the host app uses no page address; the route accepts the report and drops it. */
  pageContext: PageContextHost | undefined;
  /** Absent when the host app lends no speech engine; the stream routes answer "unsupported". */
  streams: StreamSessions | undefined;
  /** What development pages reported lately (memory only). */
  devPages: DevPages;
  /** Open event streams. */
  events: { open: number };
  heartbeatMs: number;
  mintLimiter: MintLimiter;
  lookLimiter: MintLimiter;
  deadlines: { controlMs: number; streamIdleMs: number };
}

export interface Exchange {
  req: IncomingMessage;
  res: ServerResponse;
  /** Capture groups of the route's path pattern. */
  params: string[];
  /** Aborted when the control deadline passes (the client has been answered 504): check it before creating any state. Never aborted for a stream route. */
  signal: AbortSignal;
}

export interface Route {
  method: "GET" | "POST" | "DELETE";
  path: string | RegExp;
  /** Everything but /v1/health needs the bearer token. Default true. */
  auth?: boolean;
  /** A long-lived response stream: exempt from the control deadline (it has its own idle deadline). */
  stream?: true;
  handle(x: Exchange, s: Services): Promise<void> | void;
}

const matchPath = (r: Route, path: string): string[] | undefined => {
  if (typeof r.path === "string") return r.path === path ? [] : undefined;
  const m = r.path.exec(path);
  return m ? m.slice(1) : undefined;
};

/** Finds the route for a request: 404 when no path matches, 405 (with Allow) when the path exists for other methods. */
export function resolveRoute(routes: readonly Route[], method: string, path: string): { route: Route; params: string[] } {
  const allowed: string[] = [];
  for (const route of routes) {
    const params = matchPath(route, path);
    if (!params) continue;
    if (route.method === method) return { route, params };
    allowed.push(route.method);
  }
  if (allowed.length) throw new HttpError(405, "method-not-allowed", `use ${allowed.join(" or ")}`).with({ headers: { Allow: allowed.join(", ") } });
  throw new HttpError(404, "not-found", "no such endpoint");
}
