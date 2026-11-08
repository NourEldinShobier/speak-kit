import type { Ctx } from "./context";
import type { Api } from "../shared/ipc";
import { ServerError } from "./server-api";

type EngineHandlers = Pick<Api, "engines" | "warmEngine">;

/** A server that predates the engine routes answers 404; say so instead of a bare HTTP code. */
const explain = async <T>(p: Promise<T>): Promise<T> =>
  p.catch((e) => {
    throw e instanceof ServerError && e.status === 404 ? new Error("This version of the voice server has no engine list.") : e;
  });

/** Engines page: the server's engine list (GET /v1/engines) and loading the model now. */
export function engineHandlers(ctx: Ctx): EngineHandlers {
  const s = ctx.server;
  return {
    engines: () => explain(s.engines()),
    warmEngine: () => s.warm(),
  };
}
