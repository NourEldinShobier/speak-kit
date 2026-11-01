import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LibraryBridge } from "../../apps/desktop/src/shared/library/contract";
import { launch, type Launched } from "../../apps/desktop/tests/harness";

declare global {
  interface Window {
    speakkitLibrary: LibraryBridge;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "../../apps/desktop/src/main/library/fixtures");
export const fixturePath = (name: string) => path.join(FIXTURES, name);
export const fixtureBytes = (name: string) => [...readFileSync(fixturePath(name))];

/** Desktop app with setup done, fake engine and an empty library, opened on the Library page. */
export async function openLibrary(opts: { userData?: string; env?: Record<string, string> } = {}): Promise<Launched> {
  const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_TEST: "1", ...opts.env }, ...(opts.userData ? { userData: opts.userData } : {}) });
  await d.page.getByRole("link", { name: "Library" }).click();
  await d.page.getByRole("heading", { name: "Library" }).waitFor();
  return d;
}

/** Adds readings through the preload bridge, as the renderer would after a drop. */
export const importBytes = (d: Launched, name: string, bytes: number[]) =>
  d.page.evaluate(([n, b]) => window.speakkitLibrary.importBytes(n as string, new Uint8Array(b as number[])), [name, bytes] as const);

export const importText = (d: Launched, text: string, title?: string) =>
  d.page.evaluate(([t, ti]) => window.speakkitLibrary.importText(t as string, (ti as string | undefined) ?? undefined), [text, title] as const);

/** A tiny web server that serves the article fixture. */
export async function serveArticle(): Promise<{ url: string; close(): void }> {
  const srv: Server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync(fixturePath("article.html")));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/article`, close: () => srv.close() };
}

export const PARAGRAPHS = [
  "The first paragraph has two sentences. Here is the second one.",
  "A second paragraph follows. It also has two sentences.",
  "The third and last paragraph closes the reading.",
].join("\n\n");
