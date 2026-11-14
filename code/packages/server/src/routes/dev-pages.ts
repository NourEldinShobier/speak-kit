import * as v from "valibot";
import { pageContextPostSchema } from "@speakkit/protocol";
import { HttpError, json, readBody } from "../http";
import { PAGE_SDK_SOURCE } from "../page-sdk";
import type { Route } from "../router";

/** The development-page endpoint a capture reads context from. */
export const devPageRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/capture/page-context",
    handle: async ({ req, res }, s) => {
      const post = v.safeParse(pageContextPostSchema, await readBody(req, 64 * 1024));
      if (!post.success) throw new HttpError(400, "invalid-request", "the body is not page context: only names are accepted");
      if (!s.devPages.add(post.output)) throw new HttpError(400, "invalid-request", "only pages on this computer may report");
      json(res, 202, { accepted: post.output.events.length });
    },
  },
  {
    method: "GET",
    path: "/v1/capture/page-context",
    handle: ({ req, res }, s) => {
      const q = new URL(req.url ?? "/", "http://x").searchParams;
      const [from, to] = [Number(q.get("from") ?? 0), Number(q.get("to") ?? Number.MAX_SAFE_INTEGER)];
      if (!Number.isFinite(from) || !Number.isFinite(to)) throw new HttpError(400, "invalid-request", "from and to are milliseconds");
      json(res, 200, { events: s.devPages.between(from, to) });
    },
  },
  {
    // A script tag cannot send a token; the script holds no secret and the page gives it its own token.
    method: "GET",
    path: "/v1/capture/page-context/sdk.js",
    auth: false,
    handle: ({ res }) => {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(PAGE_SDK_SOURCE);
    },
  },
];
