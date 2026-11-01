import type { EngineId } from "@speakkit/protocol";
import { EngineUnavailableError } from "@speakkit/engine";
import { parseEngineId, parseHold } from "../config";
import { HttpError, json, noContent, readBody, validated } from "../http";
import type { Route } from "../router";

/** Engine selection, install and removal, and the idle-hold hint. */
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
  {
    method: "POST",
    path: "/v1/engines/select",
    handle: async ({ req, res }, { engines }) => {
      const raw = await readBody(req);
      await engines.select(validated(() => parseEngineId(raw)));
      json(res, 200, engines.list());
    },
  },
  {
    method: "POST",
    path: /^\/v1\/engines\/(kokoro|chatterbox)\/install$/,
    handle: ({ req, res, params }, { engines }) => {
      req.resume();
      const id = params[0] as EngineId;
      const engine = engines.get(id);
      const st = engine.status();
      if (st.state === "unavailable") throw new EngineUnavailableError(st.detail ?? `${id} cannot run here`, engine.info?.().reason);
      if (engine.install) engine.install().catch(() => {}); // failure shows as state "missing" with a detail
      else if (st.state === "missing") engine.start().catch(() => {});
      json(res, 202, engines.list());
    },
  },
  {
    method: "DELETE",
    path: /^\/v1\/engines\/(kokoro|chatterbox)$/,
    handle: async ({ res, params }, { engines }) => {
      const id = params[0] as EngineId;
      if (!engines.get(id).remove) throw new HttpError(400, "invalid-request", `${id} cannot be removed`);
      await engines.remove(id);
      json(res, 200, engines.list());
    },
  },
];
