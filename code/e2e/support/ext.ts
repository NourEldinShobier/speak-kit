import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startApp, startFixture, type App, type AppOptions, type Fixture } from "./servers";

const here = dirname(fileURLToPath(import.meta.url));
export const DIST = resolve(here, "../../apps/extension/dist-e2e");

/** Minimal CDP client for the offscreen document, which Playwright does not expose as a Page. */
class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, (r: { result?: unknown; error?: { message: string } }) => void>();
  readonly errors: string[] = [];
  static async open(url: string, errors: string[]): Promise<Cdp> {
    const c = new Cdp();
    c.ws = new WebSocket(url);
    await new Promise<void>((res, rej) => {
      c.ws.onopen = () => res();
      c.ws.onerror = () => rej(new Error("cdp connect failed"));
    });
    c.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { message: string };
      };
      if (m.id !== undefined) c.pending.get(m.id)?.(m);
      else if (m.method === "Runtime.exceptionThrown")
        errors.push(`offscreen exception: ${JSON.stringify((m.params as { exceptionDetails?: { text?: string } }).exceptionDetails?.text)}`);
      else if (m.method === "Runtime.consoleAPICalled" && (m.params as { type?: string }).type === "error")
        errors.push(`offscreen console.error: ${JSON.stringify(((m.params as { args?: { value?: unknown; description?: string }[] }).args ?? []).map((a) => a.value ?? a.description))}`);
    };
    await c.send("Runtime.enable");
    return c;
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T>(expression: string): Promise<T> {
    const r = (await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

export interface Hook {
  state: import("@speakkit/protocol").PlayerState;
  frames: number;
  scheduledMs: number;
  rms: number;
  ctxState: string;
  ctxTime: number;
  rate: number;
}

export class Ext {
  errors: string[] = [];
  /** Console errors matching one of these are expected in the current test. */
  allowed: RegExp[] = [];
  private cdp?: Cdp;
  private helper?: Page;
  constructor(
    readonly ctx: BrowserContext,
    readonly id: string,
    readonly sw: Worker,
    readonly dir: string,
    readonly fx: Fixture,
  ) {}

  url(page: "popup" | "options" | "sidepanel", query = "") {
    return `chrome-extension://${this.id}/${page}.html${query}`;
  }

  /** Open a fixture page and wait until the content script answers. */
  async open(path: string, wait = true): Promise<Page> {
    const page = await this.ctx.newPage();
    await page.goto(this.fx.url(path));
    if (wait) await this.settle(page);
    return page;
  }
  /** The popup as a normal tab, aimed at `page` (test builds read ?tab=). */
  async popup(page: Page): Promise<Page> {
    const p = await this.ctx.newPage();
    await p.goto(this.url("popup", `?tab=${await this.tabId(page)}`));
    return p;
  }
  async sidepanel(page: Page): Promise<Page> {
    const p = await this.ctx.newPage();
    await p.goto(this.url("sidepanel", `?tab=${await this.tabId(page)}`));
    return p;
  }
  async settle(page: Page) {
    await page.waitForLoadState("load");
    await expect.poll(() => this.tabId(page), { timeout: 10_000 }).toBeGreaterThan(0);
  }

  async tabId(page: Page): Promise<number> {
    const url = page.url();
    // Tabs the extension has no access to (chrome://, file://) hide their URL; take the newest of those.
    return this.sw.evaluate(async (u) => {
      const tabs: { id?: number; url?: string }[] = await chrome.tabs.query({});
      const hit = tabs.find((t) => t.url === u) ?? tabs.filter((t) => !t.url).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
      return hit?.id ?? 0;
    }, url);
  }

  /** Pair through the real options page: type the port and the token, as a user would. */
  async pair(app: { port: number; token: string }, expectOk = true): Promise<Page> {
    const opt = await this.ctx.newPage();
    await opt.goto(this.url("options"));
    const port = opt.locator("#port");
    await port.fill(String(app.port));
    await port.press("Enter");
    await expect.poll(async () => (await this.settings()).port, { timeout: 5000 }).toBe(app.port).catch(async () => {
      await port.fill(String(app.port));
      await port.press("Tab");
      await expect.poll(async () => (await this.settings()).port, { timeout: 8000 }).toBe(app.port);
    });
    const tok = opt.locator("#token");
    await tok.click();
    await tok.fill(app.token);
    await tok.press("Enter");
    if (expectOk) await expect(opt.getByRole("status").first()).toContainText("Connected to SpeakKit", { timeout: 10_000 });
    return opt;
  }

  async setSettings(patch: Record<string, unknown>) {
    await this.sw.evaluate(async (p) => {
      const KEY = "speakkit.settings";
      const cur = ((await chrome.storage.sync.get(KEY))[KEY] ?? {}) as Record<string, unknown>;
      const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
        const o = { ...a };
        for (const [k, v] of Object.entries(b))
          o[k] = v && typeof v === "object" && !Array.isArray(v) ? merge((a[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>) : v;
        return o;
      };
      await chrome.storage.sync.set({ [KEY]: merge(cur, p) });
    }, patch);
    await this.sw.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  }

  /** A fresh settings object as the service worker sees it. */
  settings() {
    return this.sw.evaluate(async () => ((await chrome.storage.sync.get("speakkit.settings"))["speakkit.settings"] ?? {}) as Record<string, any>);
  }

  async cmd(name: string, page?: Page) {
    const tabId = page ? await this.tabId(page) : undefined;
    await this.sw.evaluate(([n, t]) => (globalThis as any).__speakkit.command(n, t), [name, tabId] as const);
  }
  async menu(id: string, page: Page, selectionText?: string) {
    const tabId = await this.tabId(page);
    await this.sw.evaluate(([i, t, s]) => (globalThis as any).__speakkit.menu(i, t, s), [id, tabId, selectionText] as const);
  }
  /** Send a message to the service worker from an extension page context (what popup and side panel do). */
  async bg<T = unknown>(msg: unknown): Promise<T> {
    const p = await this.helperPage();
    return p.evaluate((m) => chrome.runtime.sendMessage(m), msg) as Promise<T>;
  }
  private async helperPage(): Promise<Page> {
    if (!this.helper) {
      this.helper = await this.ctx.newPage();
      await this.helper.goto(this.url("options"));
    }
    return this.helper;
  }
  /** Shorten the offscreen document's 60 s idle close (test builds only). Affects documents created afterwards. */
  async fastIdleClose(ms = 2000) {
    await (await this.helperPage()).evaluate((v) => localStorage.setItem("speakkit.idleclose", String(v)), ms);
  }

  menuTitles(): Promise<string[]> {
    return this.sw.evaluate(() => (globalThis as any).__speakkit.menus());
  }

  // ---- offscreen player ----
  private async offscreenCdp(): Promise<Cdp> {
    if (this.cdp) return this.cdp;
    const portFile = join(this.dir, "DevToolsActivePort");
    const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { url: string; webSocketDebuggerUrl: string }[];
      const t = list.find((x) => x.url.endsWith("/offscreen.html"));
      if (t) {
        const c = await Cdp.open(t.webSocketDebuggerUrl, this.errors);
        // The target is listed before main.ts has run.
        if (await c.eval<boolean>("typeof window.__speakkit !== \"undefined\"").catch(() => false)) return (this.cdp = c);
        c.close();
      }
      if (Date.now() > deadline) throw new Error("no offscreen document");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  /** The offscreen document was closed (Chrome does it on its own after a while); forget the connection. */
  resetCdp() {
    this.cdp?.close();
    this.cdp = undefined;
  }
  async off<T>(expr: string): Promise<T> {
    return (await this.offscreenCdp()).eval<T>(expr);
  }
  async hook(): Promise<Hook> {
    return this.off<Hook>(`(()=>{const h=window.__speakkit;return {state:h.state,frames:h.framesReceived,scheduledMs:h.scheduledMs,rms:h.rms(),ctxState:h.ctxState??'',ctxTime:h.ctxTime??0,rate:h.rate??1}})()`);
  }
  /** Player state as the service worker last published it; works when no offscreen document exists. */
  bgState() {
    return this.bg<import("@speakkit/protocol").PlayerState>({ t: "get-state" });
  }
  async state() {
    return (await this.hook()).state;
  }
  async waitState(status: string, timeout = 15_000) {
    await expect.poll(async () => (await this.state()).status, { timeout, intervals: [100] }).toBe(status);
  }
  /** Highest RMS seen over `ms` of polling: the analyser reads the signal being played right now. */
  async peakRms(ms = 800): Promise<number> {
    const end = Date.now() + ms;
    let max = 0;
    while (Date.now() < end) {
      max = Math.max(max, await this.off<number>(`window.__speakkit.rms()`));
      await new Promise((r) => setTimeout(r, 40));
    }
    return max;
  }
}

type Fx = { app: App; ext: Ext; appOptions: AppOptions };
type Wx = { fx: Fixture };

export const test = base.extend<Fx, Wx>({
  fx: [
    async ({}, use) => {
      const f = await startFixture();
      await use(f);
      await f.close();
    },
    { scope: "worker" },
  ],
  appOptions: [{}, { option: true }],
  app: async ({ appOptions }, use) => {
    const a = await startApp(appOptions);
    await use(a);
    await a.stop();
  },
  ext: async ({ fx }, use, info) => {
    if (!existsSync(join(DIST, "manifest.json"))) throw new Error("extension is not built: run the e2e script");
    const dir = mkdtempSync(join(tmpdir(), "speakkit-prof-"));
    const headed = process.env.E2E_HEADED === "1";
    const ctx = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: !headed,
      viewport: { width: 1100, height: 800 },
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        "--autoplay-policy=no-user-gesture-required",
        "--remote-debugging-port=0",
        "--no-first-run",
      ],
    });
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    const id = new URL(sw.url()).host;
    const ext = new Ext(ctx, id, sw, dir, fx);
    const rec = (where: string, text: string) => ext.errors.push(`${where}: ${text}`);
    const watch = (p: Page) => {
      p.on("console", (m) => m.type() === "error" && rec(`console(${p.url().slice(0, 60)})`, m.text()));
      p.on("pageerror", (e) => rec(`pageerror(${p.url().slice(0, 60)})`, e.message));
    };
    ctx.pages().forEach(watch);
    ctx.on("page", watch);
    const watchSw = (w: Worker) => w.on("console", (m) => m.type() === "error" && rec("service-worker", m.text()));
    ctx.serviceWorkers().forEach(watchSw);
    ctx.on("serviceworker", watchSw);

    await use(ext);

    if (info.status === "passed") {
      const bad = ext.errors.filter((e) => !ext.allowed.some((r) => r.test(e)));
      expect(bad, "console errors in extension contexts or pages").toEqual([]);
    }
    ext.resetCdp();
    await ctx.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  },
});

export { expect };

/** Text currently highlighted on a page by the CSS Custom Highlight API. */
export const highlights = (page: Page) =>
  page.evaluate(() => {
    const text = (n: string) => [...(CSS.highlights.get(n) ?? [])].map((r) => String(r)).join("|");
    return { sentence: text("speakkit-sentence"), word: text("speakkit-word"), size: CSS.highlights.size };
  });

/** Pair, open a fixture page and its popup: the common start of most tests. */
export async function begin(ext: Ext, app: { port: number; token: string }, path = "/article") {
  await ext.pair(app);
  const page = await ext.open(path);
  const popup = await ext.popup(page);
  return { page, popup };
}
