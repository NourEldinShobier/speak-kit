import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { htmlToParsed } from "./parse/html";
import { ImportError } from "./parse";
import { textToBlocks, type Parsed } from "../../shared/library/text";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

// Loopback, private, link-local and other non-public ranges: a typed or redirected address must not reach services on this machine or LAN.
const NON_PUBLIC = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4]] as const) NON_PUBLIC.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) NON_PUBLIC.addSubnet(net, bits, "ipv6");

export type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** Maps an IPv4-mapped IPv6 address (::ffff:a.b.c.d) to the IPv4 form so it is checked against the IPv4 ranges. */
const unmap = (ip: string) => /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip;

async function assertPublic(url: URL, resolve: Resolve): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = await resolve(host).catch(() => []);
  const blocked = ips.some((ip) => NON_PUBLIC.check(unmap(ip), isIP(unmap(ip)) === 6 ? "ipv6" : "ipv4"));
  if (blocked) throw new ImportError("network", `${url.host} is on this computer or your local network. Only public web addresses can be read.`);
}

/** Reads the body up to MAX_BYTES; a longer one is cut off instead of being held in memory. */
async function readCapped(res: Response): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new ImportError("too-large", "That page is larger than 8 MB.");
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
      throw new ImportError("too-large", "That page is larger than 8 MB.");
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
    throw new ImportError("network", "That is not a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("network", "Only http and https addresses can be read.");
  return url;
}

/** Fetch a page and extract the article (Readability). Failures say what happened in plain words. */
export async function fetchPage(raw: string, doFetch: typeof fetch = fetch, resolve: Resolve = resolveHost): Promise<Parsed & { host: string }> {
  let url = parseWebAddress(raw);
  let res: Response;
  try {
    // Redirects are followed by hand so that every hop is checked against the non-public ranges.
    for (let hops = 0; ; hops++) {
      await assertPublic(url, resolve);
      res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual", headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": "SpeakKit" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      if (hops === MAX_REDIRECTS) throw new ImportError("network", `${url.host} redirected too many times.`);
      url = parseWebAddress(new URL(next, url).href);
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new ImportError("network", timeout ? `${url.host} did not answer in ${TIMEOUT_MS / 1000} seconds.` : `Could not reach ${url.host}. Check the address and your connection.`);
  }
  if (!res.ok) throw new ImportError("network", `${url.host} answered with HTTP ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|text\/plain/i.test(type)) throw new ImportError("unsupported", `${url.host} is not a web page (${type || "unknown type"}). Download the file and add it instead.`);
  const text = new TextDecoder().decode(await readCapped(res));
  const parsed = /html/i.test(type) ? htmlToParsed(text, { readable: true, url: url.href }) : { title: "", blocks: textToBlocks(text) };
  if (!parsed.blocks.length) throw new ImportError("empty", `No readable text was found on ${url.host}.`);
  return { ...parsed, host: url.host.replace(/^www\./, "") };
}
