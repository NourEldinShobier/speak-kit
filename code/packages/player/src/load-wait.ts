import type { PlayerDeps } from "./deps";
import { StreamError } from "./errors";

/** While the model loads a play request waits (1 s polls, at most this many) instead of failing. */
const LOAD_WAIT_TRIES = 90;

/** Runs `attempt`, retrying once a second while the engine is loading or unloaded; frames already played are never repeated (`frames` must not have moved). */
export async function withLoadWait(attempt: () => Promise<void>, o: { frames: () => number; current: () => boolean; deps: Pick<PlayerDeps, "engineState" | "sleep"> }): Promise<void> {
  const sleep = o.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let tries = 0; ; tries++) {
    const before = o.frames();
    try {
      return await attempt();
    } catch (e) {
      const waits = e instanceof StreamError && e.code === "engine-not-ready" && o.frames() === before && tries < LOAD_WAIT_TRIES && o.current();
      if (!waits) throw e;
      const st = await o.deps.engineState?.().catch(() => undefined); // unknown state: keep waiting
      if (st !== "loading" && st !== "unloaded") throw e;
      await sleep(1000);
      if (!o.current()) return;
    }
  }
}
