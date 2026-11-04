import { createServer as createHttp, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SETTINGS_KEY, TOKEN_KEY, defaultSettings, type PlayerState, type Settings } from "@speakkit/protocol";
import { FakeEngine, type FakeEngineOptions } from "../../packages/engine/src/index";
import { createServer, type SpeakKitServer } from "../../packages/server/src/index";

const req = createRequire(import.meta.url);
// Playwright is loaded through require: importing @playwright/test inside vitest registers a second test runner.
export const pw = req("@playwright/test") as typeof import("@playwright/test");
export type { BrowserContext, Page, Worker } from "@playwright/test";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CODE = resolve(HERE, "../..");
export const DESIGNS = resolve(CODE, "../designs/next/screens");
export const OUT = resolve(HERE, "out");
export const EXT_DIR = process.env.SK_EXT_DIR ?? resolve(CODE, "apps/extension/dist-visual");

export const TOKEN = "sk_local_9d4f27a1c42e";
/** SK_PORT pins the port; otherwise a random free one is picked per process, so parallel runs do not collide. */
export const SERVER_PORT = Number(process.env.SK_PORT ?? 20000 + Math.floor(Math.random() * 30000));

export const ARTICLE = {
  kicker: "ESSAY · 8 MIN READ",
  title: "The quiet return of local-first software",
  by: "Maya Okafor · October 28, 2026",
  paras: [
    "For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server, rented back to us by the month. Lately that answer has started to wobble. Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.",
    "The appeal is simple. When the work happens on your own machine, it keeps working on a plane, in a tunnel, and long after a startup has changed its pricing. Nothing leaves the device, so there is nothing to leak. Speed stops depending on a data centre three time zones away.",
    "None of this is nostalgia. It is a bet that the best software is the kind that disappears into the task, and that it can only do so when it is fast, private and yours to keep.",
  ],
};

/** The article of designs B1-B21: 720 px column, Inter 18/30, 56 px top padding; wide=true uses the side panel layout (column at x=181). */
export const articleHtml = (o: { left?: number } = {}) => {
  const [bg, text, text3, accent, border] = ["#fff", "#202020", "#606060", "#0069CC", "#E2E2E5"];
  const pad = o.left !== undefined ? `margin:0 0 0 ${o.left}px` : "margin:0 auto";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${ARTICLE.title}</title>
<meta name="color-scheme" content="light">
<style>
html,body{margin:0;background:${bg};color:${text}}
body{font:400 18px/30px Inter,system-ui,sans-serif}
article{width:720px;${pad};padding:56px 0 400px}
.k{font:600 12px/15px Inter;letter-spacing:1px;color:${accent}}
h1{font:700 40px/46px Inter;margin:18px 0}
.by{font-size:14px;line-height:17px;color:${text3}}
hr{border:0;border-top:1px solid ${border};margin:18px 0}
p{margin:0 0 18px}
</style></head><body><article>
<div class="k">${ARTICLE.kicker}</div><h1>${ARTICLE.title}</h1><div class="by">${ARTICLE.by}</div><hr>
${ARTICLE.paras.map((p) => `<p>${p}</p>`).join("\n")}
</article></body></html>`;
};

export interface Env {
  server: SpeakKitServer;
  engine: FakeEngine;
  http: Server;
  pageUrl: string;
  close(): Promise<void>;
}

/** Real SpeakKit server (FakeEngine, fixed token and port) plus a tiny web server for the article fixture. */
export async function startEnv(engineOpts: FakeEngineOptions = { secondsPerChar: 0.03 }): Promise<Env> {
  const engine = new FakeEngine(engineOpts);
  const server = createServer({ engine, dataDir: mkdtempSync(join(tmpdir(), "sk-visual-")), port: SERVER_PORT, token: TOKEN });
  await server.listen();
  const http = createHttp((rq, rs) => {
    const u = new URL(rq.url ?? "/", "http://x");
    rs.setHeader("content-type", "text/html; charset=utf-8");
    rs.end(articleHtml({ left: u.searchParams.has("panel") ? 181 : undefined }));
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const port = (http.address() as { port: number }).port;
  return {
    server,
    engine,
    http,
    pageUrl: `http://127.0.0.1:${port}/essays/local-first`,
    close: async () => {
      await server.close();
      await new Promise((r) => http.close(r));
    },
  };
}

export interface Ext {
  ctx: import("@playwright/test").BrowserContext;
  sw: import("@playwright/test").Worker;
  id: string;
  close(): Promise<void>;
}

/** Chromium with the built extension loaded (new headless mode supports extensions). */
export async function launchExt(): Promise<Ext> {
  const ctx = await pw.chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "sk-visual-profile-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--hide-scrollbars", "--font-render-hinting=none"],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  return { ctx, sw, id, close: () => ctx.close() };
}

/** Writes settings (sync) and token (local) the way the extension reads them. */
export async function seed(ext: Ext, patch: (s: Settings) => Settings = (s) => s, token: string | null = TOKEN) {
  const s = patch({ ...defaultSettings(), port: SERVER_PORT });
  await ext.sw.evaluate(
    async ([sk, tk, settings, tok]) => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      await chrome.storage.sync.set({ [sk as string]: settings });
      if (tok) await chrome.storage.local.set({ [tk as string]: tok });
    },
    [SETTINGS_KEY, TOKEN_KEY, s, token] as const,
  );
}

export const tabIdOf = (ext: Ext, urlPrefix: string): Promise<number> =>
  ext.sw.evaluate(async (u) => {
    const t = (await chrome.tabs.query({})).find((x) => x.url?.startsWith(u));
    return t?.id ?? -1;
  }, urlPrefix);

/** Forge a background broadcast to the content script of a tab (the real content script reacts to it). */
export const send = (ext: Ext, tabId: number, msg: unknown) => ext.sw.evaluate(([id, m]) => chrome.tabs.sendMessage(id as number, m).catch(() => {}), [tabId, msg] as const);

export const playerState = (p: Partial<PlayerState> = {}): PlayerState => ({
  status: "idle",
  sentenceIndex: 0,
  sentenceCount: 12,
  elapsedMs: 0,
  totalMs: 408_000,
  speed: 1.2,
  voice: "af_heart",
  queueLength: 0,
  ...p,
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TrayHook = { trayItems(): { label: string }[]; clickTray(label: string): void };

/** Clicks the tray menu's Quit item through the app's test hook. */
export const clickTrayQuit = (app: import("@playwright/test").ElectronApplication) =>
  app.evaluate(() => {
    const t = (globalThis as unknown as { __speakkit: TrayHook }).__speakkit;
    t.clickTray(t.trayItems().find((i) => i.label.startsWith("Quit"))?.label ?? "");
  });
