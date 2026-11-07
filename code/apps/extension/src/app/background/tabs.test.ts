import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PlayerState } from "@speakkit/protocol";

const playing = (tabId: number, url = "https://a.example/post"): PlayerState => ({
  status: "playing",
  docId: `d${tabId}`,
  tabId,
  title: `Title ${tabId}`,
  url,
  sentenceIndex: 2,
  sentenceCount: 9,
  elapsedMs: 4000,
  totalMs: 20000,
  speed: 1.2,
  voice: "af_heart",
  queueLength: 0,
});

type TabMsg = { t: string; state?: PlayerState; on?: boolean };

function stubChrome() {
  const data: Record<string, unknown> = {};
  const area = (store: Record<string, unknown>) => ({
    get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).filter((x) => x in store).map((x) => [x, store[x]])),
    set: async (o: Record<string, unknown>) => void Object.assign(store, o),
    remove: async (k: string) => void delete store[k],
  });
  const toTab: { tabId: number; msg: TabMsg }[] = [];
  const toOffscreen: unknown[] = [];
  const chromeStub = {
    storage: { sync: area({}), local: area({}), session: area(data) },
    runtime: {
      getURL: (path: string) => `chrome-extension://abc/${path}`,
      getContexts: async (): Promise<unknown[]> => [{}],
      sendMessage: async (m: unknown): Promise<unknown> => void ((m as { to?: string }).to === "offscreen" && toOffscreen.push(m)),
    },
    tabs: { sendMessage: async (tabId: number, msg: TabMsg) => void toTab.push({ tabId, msg }) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeStub;
  return { data, toTab, toOffscreen, chrome: chromeStub };
}

const sender = (tabId: number) => ({ tab: { id: tabId } }) as chrome.runtime.MessageSender;
const stateTo = (env: ReturnType<typeof stubChrome>, tabId: number) => env.toTab.filter((m) => m.tabId === tabId && m.msg.t === "state").map((m) => m.msg.state!);
const stopped = (env: ReturnType<typeof stubChrome>) => env.toOffscreen.some((m) => JSON.stringify((m as { command?: unknown }).command) === '{"cmd":"stop"}');

describe("pure per-tab helpers", () => {
  it("treats URLs that differ only in the fragment as the same page", async () => {
    stubChrome();
    const { samePage } = await import("./tabs");
    expect(samePage("https://a.example/post#top", "https://a.example/post")).toBe(true);
    expect(samePage("https://a.example/post?p=2", "https://a.example/post?p=3")).toBe(false);
    expect(samePage(undefined, "https://a.example/post")).toBe(false);
  });

  it("gives another tab an idle state without the title, url or doc of the tab being read", async () => {
    stubChrome();
    const { viewFor } = await import("./tabs");
    expect(viewFor(playing(1), 1)).toEqual(playing(1));
    expect(viewFor(playing(1), 2)).toEqual({ status: "idle", tabId: 2, sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: 1.2, voice: "af_heart", queueLength: 0 });
  });
});

describe("worker per-tab state", () => {
  let env: ReturnType<typeof stubChrome>;
  beforeEach(() => {
    vi.resetModules();
    env = stubChrome();
  });

  it("starting in tab 2 sends tab 1 an idle state that carries nothing of tab 2", async () => {
    const { publishState } = await import("./state");
    publishState(playing(1));
    publishState(playing(2));
    await vi.waitFor(() => expect(stateTo(env, 1).at(-1)?.status).toBe("idle"));
    const toOne = stateTo(env, 1).at(-1)!;
    expect(toOne).toMatchObject({ status: "idle", tabId: 1 });
    expect(toOne.title).toBeUndefined();
    expect(stateTo(env, 2).map((s) => s.status)).toEqual(["playing"]);
  });

  it("a stop (an idle state that names no tab) reaches the tab that was reading", async () => {
    const { publishState, idle } = await import("./state");
    publishState(playing(1));
    publishState(await idle());
    await vi.waitFor(() => expect(stateTo(env, 1).at(-1)?.status).toBe("idle"));
  });

  it("after a worker restart the tab that was reading is still told when another tab takes over", async () => {
    const first = await import("./state");
    first.publishState(playing(1));
    vi.resetModules();
    const { publishState } = await import("./state");
    publishState(playing(2));
    await vi.waitFor(() => expect(stateTo(env, 1).at(-1)?.status).toBe("idle"));
  });

  it("an error in a tab that is not being read goes to that tab only and leaves the reader alone", async () => {
    const { publishState, reportError, getState } = await import("./state");
    publishState(playing(1));
    await reportError("page-unreadable", 2);
    expect(stateTo(env, 2).at(-1)).toMatchObject({ status: "error", tabId: 2, error: { code: "page-unreadable" } });
    expect(stateTo(env, 1).map((s) => s.status)).toEqual(["playing"]);
    expect((await getState()).status).toBe("playing");
  });

  it("get-state from a page is idle unless that page's tab is the reader; without a tab it is the global state", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1));
    expect(await route({ t: "get-state" }, sender(1))).toMatchObject({ status: "playing", docId: "d1" });
    expect(await route({ t: "get-state" }, sender(2))).toMatchObject({ status: "idle", tabId: 2 });
    expect(await route({ t: "get-state" }, {} as chrome.runtime.MessageSender)).toMatchObject({ status: "playing" });
  });

  it("an extension page open in a tab (options) still sees the global state", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1));
    const options = { tab: { id: 9 }, url: "chrome-extension://abc/options.html" } as chrome.runtime.MessageSender;
    expect(await route({ t: "get-state" }, options)).toMatchObject({ status: "playing", tabId: 1 });
  });

  it("hello replays the state to the reader tab on the same URL and starts every other page idle", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1, "https://a.example/post"));
    expect(await route({ t: "hello", url: "https://a.example/post#x" }, sender(1))).toMatchObject({ state: { status: "playing" }, dismissed: false });
    expect(await route({ t: "hello", url: "https://a.example/post" }, sender(2))).toEqual({ state: null, dismissed: false });
  });

  it("hello from the reader tab on another URL stops the orphaned audio", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1, "https://a.example/post"));
    expect(await route({ t: "hello", url: "https://a.example/other" }, sender(1))).toEqual({ state: null, dismissed: false });
    expect(stopped(env)).toBe(true);
  });

  it("dismissing in tab 1 stops its reading, is remembered for tab 1 only, and a new hello reports it", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1));
    expect(await route({ t: "dismiss", on: true }, sender(1))).toEqual({ ok: true });
    expect(stopped(env)).toBe(true);
    expect(await route({ t: "hello", url: "https://a.example/post" }, sender(1))).toMatchObject({ dismissed: true });
    expect(await route({ t: "hello", url: "https://a.example/post" }, sender(2))).toMatchObject({ dismissed: false });
  });

  it("dismissing a tab that is not the reader leaves the reader playing", async () => {
    const { route } = await import("./router");
    const { publishState } = await import("./state");
    publishState(playing(1));
    await route({ t: "dismiss", on: true }, sender(2));
    expect(stopped(env)).toBe(false);
  });
});

describe("tab events", () => {
  let env: ReturnType<typeof stubChrome>;
  beforeEach(() => {
    vi.resetModules();
    env = stubChrome();
  });

  it("a reload (status loading) stops the reader tab, clears its dismissed flag and bumps its epoch", async () => {
    const { publishState } = await import("./state");
    const { patchTab, getTab } = await import("./tabs");
    const { onTabUpdated } = await import("./tab-events");
    publishState(playing(1));
    await patchTab(1, { dismissed: true, frames: [5] });
    await onTabUpdated(1, { status: "loading" });
    expect(stopped(env)).toBe(true);
    expect(await getTab(1)).toEqual({ dismissed: false, alive: false, frames: [], epoch: 1 });
  });

  it("a reload of another tab does not stop the reader", async () => {
    const { publishState } = await import("./state");
    const { onTabUpdated } = await import("./tab-events");
    publishState(playing(1));
    await onTabUpdated(2, { status: "loading" });
    expect(env.toOffscreen).toEqual([]);
  });

  it("a pushState navigation to another page stops; a fragment change does not", async () => {
    const { publishState } = await import("./state");
    const { onTabUpdated } = await import("./tab-events");
    publishState(playing(1, "https://a.example/post"));
    await onTabUpdated(1, { url: "https://a.example/post#section-2" });
    expect(env.toOffscreen).toEqual([]);
    await onTabUpdated(1, { url: "https://a.example/next" });
    expect(stopped(env)).toBe(true);
  });

  it("a discarded tab stops and closing the reader tab stops and forgets its flags", async () => {
    const { publishState } = await import("./state");
    const { patchTab } = await import("./tabs");
    const { onTabUpdated, onTabRemoved } = await import("./tab-events");
    publishState(playing(1));
    await onTabUpdated(1, { discarded: true });
    expect(env.toOffscreen).toHaveLength(1);
    await patchTab(1, { dismissed: true });
    await onTabRemoved(1);
    expect(env.toOffscreen).toHaveLength(2);
    expect(Object.keys(env.data).filter((k) => k.startsWith("speakkit.tab."))).toEqual([]);
  });
});

describe("worker restart", () => {
  it("reconcilePlayer publishes the offscreen player's real state", async () => {
    vi.resetModules();
    const env = stubChrome();
    env.data["speakkit.lastState"] = playing(1);
    env.chrome.runtime.sendMessage = async (m) => ((m as { query?: string }).query === "state" ? { ...playing(1), status: "paused" } : undefined);
    const { reconcilePlayer } = await import("./player");
    const { getState } = await import("./state");
    await reconcilePlayer();
    expect((await getState()).status).toBe("paused");
  });

  it("reconcilePlayer publishes idle when the player document is gone", async () => {
    vi.resetModules();
    const env = stubChrome();
    env.data["speakkit.lastState"] = playing(1);
    env.chrome.runtime.getContexts = async () => [];
    const { reconcilePlayer } = await import("./player");
    const { getState } = await import("./state");
    await reconcilePlayer();
    expect((await getState()).status).toBe("idle");
  });
});
