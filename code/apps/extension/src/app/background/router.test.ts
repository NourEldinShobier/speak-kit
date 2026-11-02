import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

function stubChrome() {
  const mem = (data: Record<string, unknown>) => ({
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (o: Record<string, unknown>) => void Object.assign(data, o),
  });
  const session: Record<string, unknown> = {};
  const sent: unknown[] = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { sync: mem({}), local: mem({}), session: mem(session) },
    runtime: { getContexts: async () => [], sendMessage: async (m: unknown) => void sent.push(m) },
    tabs: { sendMessage: async () => {} },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  return { session, sent };
}

/** A fresh copy of the worker modules, as after the service worker was suspended and woken up. */
async function wake() {
  vi.resetModules();
  return import("./router");
}
const sender = {} as chrome.runtime.MessageSender;

describe("service worker router", () => {
  let env: ReturnType<typeof stubChrome>;
  beforeEach(() => {
    env = stubChrome();
  });

  it("answers exactly the message types the inbound schema defines", async () => {
    const { KNOWN_TYPES } = await wake();
    expect([...KNOWN_TYPES].sort()).toEqual(
      [
        "auth-check",
        "get-health",
        "get-queue",
        "get-state",
        "get-voices",
        "launch-app",
        "open-app",
        "open-options",
        "open-sidepanel",
        "player",
        "preview",
        "preview-voice",
        "read",
        "read-tab",
        "reader",
        "set-auto-play",
        "warm",
      ].sort(),
    );
  });

  it("reports an idle player with the saved speed and voice before anything played", async () => {
    const { route } = await wake();
    expect(await route({ t: "get-state" }, sender)).toMatchObject({ status: "idle", speed: 1.2, voice: "af_heart", queueLength: 0 });
  });

  it("keeps the auto-play choice across a service worker restart", async () => {
    const first = await wake();
    expect(await first.route({ t: "set-auto-play", on: false }, sender)).toEqual({ ok: true });
    const second = await wake();
    expect(await second.route({ t: "get-queue" }, sender)).toEqual({ items: [], outline: [], autoPlay: false });
  });

  it("shows the queue the player last reported after a restart", async () => {
    const item = { docId: "d1", title: "Article", url: "https://a.example/", sentenceCount: 4 };
    env.session["speakkit.queue"] = [item];
    const { route } = await wake();
    expect(await route({ t: "get-queue" }, sender)).toMatchObject({ items: [item], autoPlay: true });
  });

  it("stops a command for a player that is not running without creating one", async () => {
    const { route } = await wake();
    expect(await route({ t: "player", command: { cmd: "pause" } }, sender)).toEqual({ ok: true });
    expect(env.sent).toEqual([]);
  });

  it("a state published while the first get-state still reads storage is not overwritten by the stale stored one", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const area = (globalThis as unknown as { chrome: { storage: { session: { get(k: string): Promise<unknown> } } } }).chrome.storage.session;
    const read = area.get.bind(area);
    area.get = async (k) => {
      const stale = await read(k); // storage as it was when the read began
      await gate;
      return stale;
    };
    const { route } = await wake();
    const { publishState } = await import("./state");
    const first = route({ t: "get-state" }, sender);
    publishState({ status: "preparing", sentenceIndex: 0, sentenceCount: 3, elapsedMs: 0, totalMs: 0, speed: 1.2, voice: "af_heart", queueLength: 0 });
    release();
    await first;
    expect(await route({ t: "get-state" }, sender)).toMatchObject({ status: "preparing" });
  });

  it("a queue set while the first get-queue still reads storage is not overwritten either", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const area = (globalThis as unknown as { chrome: { storage: { session: { get(k: string): Promise<unknown> } } } }).chrome.storage.session;
    const read = area.get.bind(area);
    area.get = async (k) => {
      const stale = await read(k); // storage as it was when the read began
      await gate;
      return stale;
    };
    await wake();
    const { getQueue, setQueue } = await import("./state");
    const item = { docId: "d1", tabId: 2, title: "Article", url: "https://a.example/", sentenceCount: 4, estMs: 1000 };
    const first = getQueue();
    setQueue([item]);
    release();
    await first;
    expect(await getQueue()).toEqual([item]);
  });

  it("answers a route that throws with a fixed code, not the exception text, and logs the exception", async () => {
    const { routeSafely } = await wake();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await routeSafely({ t: "open-sidepanel" }, sender); // no windowId and no chrome.windows: the handler throws
    expect(answer).toEqual({ ok: false, error: "route-failed" });
    expect(log).toHaveBeenCalledWith("[speakkit] route failed", "open-sidepanel", expect.any(TypeError));
    log.mockRestore();
  });
});
