import { PROXY_PATHS, type LibraryBridge, type ProxyRequest } from "../../../shared/library/contract";
import { toDesktopError } from "../../../shared/errors";
import { errorText } from "../../error-text";

type Bridge = Pick<LibraryBridge, "proxyOpen" | "proxyCancel" | "onProxyChunk">;
type Path = (typeof PROXY_PATHS)[number];

interface Pending {
  head(status: number): void;
  data(bytes: Uint8Array): void;
  end(): void;
  fail(message: string): void;
}

const NO_BODY = new Set([101, 204, 205, 304]);

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  return new URL(input instanceof URL ? input.href : input.url);
}

function requestOf(id: number, input: RequestInfo | URL, init?: RequestInit): ProxyRequest {
  const url = urlOf(input);
  const replace = new Headers(init?.headers).get("X-SpeakKit-Replace");
  return {
    id,
    path: url.pathname as Path,
    method: init?.method === "POST" ? "POST" : "GET",
    ...(typeof init?.body === "string" ? { body: init.body } : {}),
    ...(replace ? { replace } : {}),
  };
}

interface Call {
  bridge: Bridge;
  pending: Map<number, Pending>;
  req: ProxyRequest;
  signal: AbortSignal | null | undefined;
  resolve(r: Response): void;
  reject(e: unknown): void;
}

/** Registers one request: the head resolves the promise, data chunks feed the body stream, an abort cancels in main. */
function track({ bridge, pending, req, signal, resolve, reject }: Call): void {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let settled = false;
  const done = () => {
    pending.delete(req.id);
    signal?.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    bridge.proxyCancel(req.id);
    done();
    if (settled) controller?.error(abortError());
    else reject(abortError());
  };
  if (signal?.aborted) return reject(abortError());
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
  bridge.proxyOpen(req).catch((e) => pending.get(req.id)?.fail(errorText(toDesktopError(e))));
}

/**
 * A `fetch` for the local server that goes through main: the page's file:// origin
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
      else p.fail(errorText(c.error));
    });
  };

  return (input, init) => {
    listen();
    const req = requestOf(next++, input, init);
    return new Promise<Response>((resolve, reject) => track({ bridge, pending, req, signal: init?.signal, resolve, reject }));
  };
}
