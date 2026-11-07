import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// Loopback, private, link-local and other non-public ranges: a typed or redirected address must not reach services on this machine or LAN.
const NON_PUBLIC = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
] as const)
  NON_PUBLIC.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  NON_PUBLIC.addSubnet(net, bits, "ipv6");

export type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

/** An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is checked against the IPv4 ranges. */
const unmap = (ip: string) => /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip;
const isNonPublic = (ip: string) => NON_PUBLIC.check(unmap(ip), isIP(unmap(ip)) === 6 ? "ipv6" : "ipv4");

class NonPublicAddressError extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`${host} is not a public address`);
    this.host = host;
  }
}

/** Did a request fail because it was refused for pointing at a non-public address? fetch wraps the cause one or two levels down. */
export function isNonPublicError(e: unknown): e is NonPublicAddressError {
  for (let cur = e, depth = 0; cur instanceof Error && depth < 4; cur = cur.cause, depth++) if (cur instanceof NonPublicAddressError) return true;
  return false;
}

/**
 * `lookup` option of net.connect: resolves the name and refuses it when any answer is non-public. The socket connects to the
 * address returned here, so the name is resolved once and what was checked is what is connected to (no DNS rebinding window).
 */
export function publicLookup(resolve: Resolve = resolveHost): LookupFunction {
  return (host, options, callback) => {
    resolve(host).then(
      (ips) => {
        if (!ips.length || ips.some(isNonPublic)) return callback(new NonPublicAddressError(host) as NodeJS.ErrnoException, "", 0);
        const found = ips.map((address) => ({ address, family: isIP(address) }));
        if (options.all) callback(null, found);
        else callback(null, found[0]!.address, found[0]!.family);
      },
      (e: NodeJS.ErrnoException) => callback(e, "", 0),
    );
  };
}

/** A fetch that only connects to public addresses: IP literals are checked here, names at connect time by publicLookup. Redirects are the caller's to follow. */
export function publicFetch(resolve?: Resolve): typeof fetch {
  const dispatcher = new Agent({ connect: { lookup: publicLookup(resolve) } });
  return (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && isNonPublic(literal)) throw new NonPublicAddressError(url.host);
    return undiciFetch(url, { ...init, dispatcher } as never);
  }) as unknown as typeof fetch;
}
