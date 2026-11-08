import { parseHold } from "../config";
import { json, noContent, readBody, validated } from "../http";
import type { Route } from "../router";

/** Engine list and the idle-hold hint. */
export const engineRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/engine/hold",
    handle: async ({ req, res }, { engines }) => {
      const raw = await readBody(req);
      const { ms } = validated(() => parseHold(raw));
      engines.active.hold?.(ms);
      noContent(res);
    },
  },
  { method: "GET", path: "/v1/engines", handle: ({ res }, { engines }) => json(res, 200, engines.list()) },
];
