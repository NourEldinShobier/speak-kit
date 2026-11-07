import type { Ctx } from "./context";
import type { Api } from "../shared/ipc";
import { ServerError } from "./server-api";

type EngineHandlers = Pick<Api, "engines" | "selectEngine" | "installEngine" | "cancelInstall" | "removeEngine" | "warmEngine">;

/** A server that predates the engine routes answers 404; say so instead of a bare HTTP code. */
const explain = async <T>(p: Promise<T>): Promise<T> =>
  p.catch((e) => {
    throw e instanceof ServerError && e.status === 404 ? new Error("This version of the voice server has no engine list.") : e;
  });

/** Engines page: the server's engine list, selection, install and removal (GET /v1/engines and friends). */
export function engineHandlers(ctx: Ctx): EngineHandlers {
  const s = ctx.server;
  const after = async <T>(p: Promise<T>) => {
    const out = await explain(p);
    ctx.publish(); // the health pill follows the active engine
    return out;
  };
  return {
    engines: () => explain(s.engines()),
    selectEngine: (id) => after(s.selectEngine(id)),
    installEngine: (id) => after(s.installEngine(id)),
    cancelInstall: (id) => after(s.cancelInstall(id)),
    removeEngine: (id) => after(s.removeEngine(id)),
    warmEngine: () => s.warm(),
  };
}
