import { PROXY_PATHS, type LibraryBridge, type ProxyRequest } from "../../../shared/library/contract";

type Bridge = Pick<LibraryBridge, "proxyOpen" | "proxyCancel" | "onProxyChunk">;
type Path = (typeof PROXY_PATHS)[number];

interface Pending {
  head(status: number): void;
  data(bytes: Uint8Array): void;
  end(): void;
  fail(message: string): void;
}

const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * A `fetch` for the local server that goes through main (see main/library/speak-proxy.ts): the page's file:// origin
 * would be rejected by the server. Supports what the player uses: POST/GET to three paths, streamed bodies, abort.
 */
export function createProxyFetch(bridge: Bridge): typeof fetch {
  const pending = new Map<number, Pending>();
  let next = 1;
  let listening = false;
  const listen = () => {
    if (listening) return;
    listening = true;
    bridge.onProxyChunk((c) => {
      const p = pending.get(c.id);
      if (!p) return;
      if (c.type === "head") p.head(c.status);
      else if (c.type === "data") p.data(c.data);
      else if (c.type === "end") p.end();
      else p.fail(c.message);
    });
  };

  return (input, init) => {
    listen();
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const req: ProxyRequest = {
      id: next++,
      path: url.pathname as Path,
      method: init?.method === "POST" ? "POST" : "GET",
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
      ...(headers.get("X-SpeakKit-Replace") ? { replace: headers.get("X-SpeakKit-Replace")! } : {}),
    };
    const signal = init?.signal;
    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      let settled = false;
      const done = () => {
        pending.delete(req.id);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        bridge.proxyCancel(req.id);
        done();
        const reason = new DOMException("The operation was aborted.", "AbortError");
        if (settled) controller?.error(reason);
        else reject(reason);
      };
      if (signal?.aborted) return reject(new DOMException("The operation was aborted.", "AbortError"));
      signal?.addEventListener("abort", onAbort);
      pending.set(req.id, {
        head(status) {
          settled = true;
          const body = NO_BODY.has(status)
            ? null
            : new ReadableStream<Uint8Array>({
                start: (c) => void (controller = c),
                cancel: () => {
                  bridge.proxyCancel(req.id);
                  done();
                },
              });
          resolve(new Response(body, { status }));
          if (!body) done();
        },
        data: (b) => controller?.enqueue(b),
        end() {
          controller?.close();
          done();
        },
        fail(message) {
          done();
          if (settled) controller?.error(new TypeError(message));
          else reject(new TypeError(message)); // the player reads a TypeError as "app not running"
        },
      });
      bridge.proxyOpen(req).catch((e) => pending.get(req.id)?.fail(e instanceof Error ? e.message : String(e)));
    });
  };
}
