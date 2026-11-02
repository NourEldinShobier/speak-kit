import { ImportError } from "./parse";
import { runParseJob, type ParseFn } from "./parse/job";
import { isNonPublicError, publicFetch } from "./public-fetch";
import { textToBlocks, type Parsed } from "../../shared/library/text";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

let shared: typeof fetch | undefined;
const defaultFetch: typeof fetch = (...a) => (shared ??= publicFetch())(...a);

/** Reads the body up to MAX_BYTES; a longer one is cut off instead of being held in memory. */
async function readCapped(res: Response): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new ImportError("too-large", { code: "page-too-large" });
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      void reader.cancel();
      throw new ImportError("too-large", { code: "page-too-large" });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function parseWebAddress(raw: string): URL {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ImportError("network", { code: "not-a-web-address" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("network", { code: "only-http" });
  return url;
}

/** Follows redirects by hand so that every hop goes through doFetch, whose default refuses non-public addresses. */
async function fetchFollowing(start: URL, doFetch: typeof fetch): Promise<{ url: URL; res: Response }> {
  let url = start;
  try {
    for (let hops = 0; ; hops++) {
      const res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual", headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": "SpeakKit" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) return { url, res };
      if (hops === MAX_REDIRECTS) throw new ImportError("network", { code: "too-many-redirects", args: { host: url.host } });
      url = parseWebAddress(new URL(next, url).href);
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (isNonPublicError(e)) throw new ImportError("network", { code: "local-address", args: { host: url.host } });
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new ImportError("network", timeout ? { code: "no-answer", args: { host: url.host, seconds: TIMEOUT_MS / 1000 } } : { code: "unreachable", args: { host: url.host } });
  }
}

/** Fetch a page and extract the article (Readability). Failures say what happened in plain words. */
export async function fetchPage(raw: string, doFetch: typeof fetch = defaultFetch, parse: ParseFn = runParseJob): Promise<Parsed & { host: string }> {
  const { url, res } = await fetchFollowing(parseWebAddress(raw), doFetch);
  if (!res.ok) throw new ImportError("network", { code: "http-status", args: { host: url.host, status: res.status } });
  const type = res.headers.get("content-type") ?? "";
  if (!/html|text\/plain/i.test(type)) throw new ImportError("unsupported", { code: "not-a-web-page", args: { host: url.host, type } });
  const text = new TextDecoder().decode(await readCapped(res));
  const parsed = /html/i.test(type) ? (await parse({ type: "page", html: text, url: url.href })).parsed : { title: "", blocks: textToBlocks(text) };
  if (!parsed.blocks.length) throw new ImportError("empty", { code: "page-has-no-text", args: { host: url.host } });
  return { ...parsed, host: url.host.replace(/^www\./, "") };
}
