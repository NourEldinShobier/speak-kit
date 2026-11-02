import { API_VERSION, APP_ID, DEFAULT_VOICE, type Health, type VoiceList } from "@speakkit/protocol";
import { json, noContent } from "../http";
import type { Route } from "../router";

/** Health (no token), the token check, the voice list and the engine lifecycle hints the extension sends. */
export const statusRoutes: Route[] = [
  {
    method: "GET",
    path: "/v1/health",
    auth: false,
    handle: ({ res }, { engines, version }) => {
      const engine = engines.active;
      const s = engine.status();
      const unloadAt = s.state === "ready" ? engine.idleUnloadAtMs?.() : undefined;
      const health: Health = {
        app: APP_ID,
        version,
        apiVersion: API_VERSION,
        engine: {
          id: engines.activeId,
          state: s.state,
          ...(s.progress !== undefined && { progress: s.progress }),
          ...(s.detail && { detail: s.detail }),
          ...(unloadAt !== undefined && { idleUnloadAtMs: unloadAt }),
        },
      };
      json(res, 200, health);
    },
  },
  { method: "GET", path: "/v1/auth/check", handle: ({ res }) => noContent(res) },
  {
    method: "GET",
    path: "/v1/voices",
    handle: ({ res }, { engines }) => {
      const voices = engines.active.voices();
      const list: VoiceList = { voices, default: voices.some((v) => v.id === DEFAULT_VOICE) ? DEFAULT_VOICE : voices[0]!.id };
      json(res, 200, list);
    },
  },
  {
    method: "POST",
    path: "/v1/engine/warm",
    handle: ({ req, res }, { engines }) => {
      req.resume();
      const engine = engines.active;
      if (engine.warm) engine.warm();
      else if (engine.status().state === "unloaded") engine.start().catch(() => {}); // failure shows in the engine status
      json(res, 202, { state: engine.status().state });
    },
  },
];
