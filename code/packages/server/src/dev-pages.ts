import { PAGE_CONTEXT_LIMITS, type PageContextPost, type PageEvent } from "@speakkit/protocol";

const LOOPBACK = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

/** An address as origin and path only; undefined when it is not http(s) on this computer. Credentials, the query and the fragment never survive. */
export function loopbackPage(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !LOOPBACK(u.hostname)) return undefined;
    return `${u.origin}${u.pathname}`.slice(0, PAGE_CONTEXT_LIMITS.path);
  } catch {
    return undefined;
  }
}

/** The path of any address (also a relative one), without query or fragment. */
const pathOf = (raw: string): string => {
  try {
    return new URL(raw, "http://x").pathname.slice(0, PAGE_CONTEXT_LIMITS.path);
  } catch {
    return "/";
  }
};

/** An error message with every address cut back to its path, so a token or an id in a query string is not kept. */
const scrub = (m: string): string => m.replace(/\bhttps?:\/\/[^\s"')]+/gi, (u) => pathOf(u)).slice(0, PAGE_CONTEXT_LIMITS.message);

/** The elements that hold what a person typed: their name is never kept. */
const TYPED = new Set(["input", "textarea", "select"]);
const TYPED_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

function clean(e: PageContextPost["events"][number], page: string): PageEvent {
  if (e.type === "click") {
    const { tag, role, label, component, path } = e.element;
    return {
      type: "click",
      at: e.at,
      page,
      element: { tag, ...(role && { role }), ...(label && !TYPED.has(tag) && !(role && TYPED_ROLES.has(role)) && { label }), ...(component && { component }), ...(path && { path }) },
    };
  }
  if (e.type === "console-error") return { type: "console-error", at: e.at, page, message: scrub(e.message) };
  return { type: "failed-request", at: e.at, page, method: e.method, path: pathOf(e.url), status: e.status };
}

/** What the loopback pages of a development build reported lately, for a capture to read. Memory only: nothing is written to disk. */
export class DevPages {
  readonly #now: () => number;
  #events: PageEvent[] = [];

  constructor(now: () => number) {
    this.#now = now;
  }

  /** Stores the events of one post; false when the page is not on this computer (nothing is stored). */
  add(post: PageContextPost): boolean {
    const page = loopbackPage(post.page.url);
    if (!page) return false;
    this.#events.push(...post.events.map((e) => clean(e, page)));
    const oldest = this.#now() - PAGE_CONTEXT_LIMITS.keepMs;
    this.#events = this.#events.filter((e) => e.at >= oldest).slice(-PAGE_CONTEXT_LIMITS.maxStored);
    return true;
  }

  between(from: number, to: number): PageEvent[] {
    return this.#events.filter((e) => e.at >= from && e.at <= to);
  }
}
