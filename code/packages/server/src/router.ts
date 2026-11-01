import type { IncomingMessage, ServerResponse } from "node:http";
import type { EngineRegistry } from "./engines";
import type { ExportManager } from "./export";
import { HttpError } from "./http";
import type { StreamQueue } from "./stream-queue";

/** What every route handler can reach. */
export interface Services {
  engines: EngineRegistry;
  exporter: ExportManager;
  queue: StreamQueue;
  version: string;
}

export interface Exchange {
  req: IncomingMessage;
  res: ServerResponse;
  /** Capture groups of the route's path pattern. */
  params: string[];
}

export interface Route {
  method: "GET" | "POST" | "DELETE";
  path: string | RegExp;
  /** Everything but /v1/health needs the bearer token. Default true. */
  auth?: boolean;
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
  if (allowed.length) throw new HttpError(405, "method-not-allowed", `use ${allowed.join(" or ")}`, undefined, { Allow: allowed.join(", ") });
  throw new HttpError(404, "not-found", "no such endpoint");
}
