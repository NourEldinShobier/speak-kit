import { htmlToParsed } from "./parse/html";
import { ImportError } from "./parse";
import { textToBlocks, type Parsed } from "./parse/text";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export function parseWebAddress(raw: string): URL {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ImportError("network", "That is not a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("network", "Only http and https addresses can be read.");
  return url;
}

/** Fetch a page and extract the article (Readability). Failures say what happened in plain words. */
export async function fetchPage(raw: string, doFetch: typeof fetch = fetch): Promise<Parsed & { host: string }> {
  const url = parseWebAddress(raw);
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow", headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": "SpeakKit" } });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new ImportError("network", timeout ? `${url.host} did not answer in ${TIMEOUT_MS / 1000} seconds.` : `Could not reach ${url.host}. Check the address and your connection.`);
  }
  if (!res.ok) throw new ImportError("network", `${url.host} answered with HTTP ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|text\/plain/i.test(type)) throw new ImportError("unsupported", `${url.host} is not a web page (${type || "unknown type"}). Download the file and add it instead.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new ImportError("too-large", "That page is larger than 8 MB.");
  const text = new TextDecoder().decode(buf);
  const parsed = /html/i.test(type) ? htmlToParsed(text, { readable: true, url: url.href }) : { title: "", blocks: textToBlocks(text) };
  if (!parsed.blocks.length) throw new ImportError("empty", `No readable text was found on ${url.host}.`);
  return { ...parsed, host: url.host.replace(/^www\./, "") };
}
