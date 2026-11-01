import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite-plus";
import { contentAssets, listSources } from "../../build/lumen-subset";

/** Real-Chromium harness: bundles the content script like production (IIFE, __TEST__ on) and runs it in a plain page with a fake `chrome` API. */
const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "../..");
const e2eRequire = createRequire(resolve(extRoot, "../../e2e/package.json"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pw = any;
const pw: Pw = e2eRequire("@playwright/test");

const buildOne = async (entry: string, format: "iife" | "es", name: string) => {
  const outDir = mkdtempSync(join(tmpdir(), "speakkit-content-"));
  await build({
    configFile: false,
    root: extRoot,
    publicDir: false,
    logLevel: "silent",
    plugins: [contentAssets(() => listSources(resolve(extRoot, "src")))],
    define: { __TEST__: "true" },
    build: { outDir, emptyOutDir: true, minify: false, target: "chrome116", lib: { entry, formats: [format], name: "SKBundle", fileName: () => name } },
  });
  return readFileSync(join(outDir, name), "utf8");
};

let bundle: Promise<{ content: string; ui: string }> | null = null;
/** JS source of the content script (plus `window.SK = { extract, hl }` for direct API tests) and of the lazily loaded UI module. */
const contentBundle = () =>
  (bundle ??= (async () => {
    const [content, ui] = await Promise.all([buildOne(resolve(here, "entry.ts"), "iife", "bundle.js"), buildOne(resolve(extRoot, "src/app/content/ui-entry.ts"), "es", "ui.js")]);
    return { content, ui };
  })());

/** Installed before the bundle: records messages sent to the service worker and lets tests deliver messages to the page. */
const CHROME_STUB = `
(() => {
  const store = {};
  window.__sent = [];
  window.__listeners = [];
  window.__voices = undefined;
  window.__health = undefined;
  window.chrome = {
    runtime: {
      getURL: (p) => "http://sk.test/__" + p,
      sendMessage: (m) => { window.__sent.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(m.t === "get-voices" ? { voices: window.__voices } : m.t === "get-health" ? window.__health : undefined); },
      onMessage: { addListener: (f) => window.__listeners.push(f) },
    },
    storage: {
      sync: { get: async (k) => (typeof k === "string" ? { [k]: store[k] } : { ...store }), set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); } },
      onChanged: { addListener: () => {} },
    },
  };
  window.__store = store;
  window.__deliver = (msg) => new Promise((res) => {
    for (const f of window.__listeners) { const r = f(msg, {}, (x) => res(x)); if (r === true) return; }
    res(undefined);
  });
})();
`;

export interface Session {
  browser: Pw;
  close(): Promise<void>;
  page(html: string, opts?: { settings?: unknown; viewport?: { width: number; height: number }; colorScheme?: "dark" | "light"; bundle?: boolean; health?: unknown }): Promise<Pw>;
}

export async function launch(): Promise<Session> {
  const { content: js, ui: uiJs } = await contentBundle();
  const browser = await pw.chromium.launch({ headless: true });
  return {
    browser,
    close: () => browser.close(),
    async page(html, opts = {}) {
      const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 720 }, colorScheme: opts.colorScheme ?? "light", deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("pageerror", (e: Error) => {
        throw e;
      });
      await page.addInitScript(CHROME_STUB);
      if (opts.health !== undefined) await page.addInitScript(`window.__health = ${JSON.stringify(opts.health)};`);
      if (opts.settings !== undefined)
        await page.addInitScript(`window.__initialSettings = ${JSON.stringify(opts.settings)}; (() => { const k = "speakkit.settings"; window.__store[k] = window.__initialSettings; })();`);
      await page.route("http://sk.test/**", (r: { request(): { url(): string }; fulfill(o: unknown): Promise<void> }) =>
        r.request().url().endsWith("/__content-ui.js") ? r.fulfill({ contentType: "text/javascript; charset=utf-8", body: uiJs }) : r.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
      );
      await page.goto("http://sk.test/page");
      if (opts.bundle !== false) await page.addScriptTag({ content: js });
      return page;
    },
  };
}
