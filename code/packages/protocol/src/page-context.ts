import * as v from "valibot";

/**
 * Page context from a development build of a web page, so a capture of that tab can name what was clicked and what failed. Loopback pages only; all routes need the bearer token.
 *
 *   POST /v1/capture/page-context   body PageContextPost   -> 202 { accepted }
 *   GET  /v1/capture/page-context?from=<ms>&to=<ms>        -> { events: PageEvent[] }
 *
 * Only names are accepted: no request or response bodies, headers, cookies, query strings or typed text. A body with any other field is refused whole.
 */
export const PAGE_CONTEXT_LIMITS = {
  maxEventsPerPost: 50,
  /** Events kept; the oldest go first. */
  maxStored: 500,
  /** Events older than this are dropped. */
  keepMs: 10 * 60_000,
  label: 80,
  component: 60,
  path: 160,
  message: 200,
} as const;

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));

const element = v.strictObject({
  tag: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,31}$/)),
  role: v.exactOptional(text(32)),
  /** What a person would call it: a button's text or an accessible name. Never an input's value. */
  label: v.exactOptional(text(PAGE_CONTEXT_LIMITS.label)),
  /** The component name a framework gives the element. */
  component: v.exactOptional(text(PAGE_CONTEXT_LIMITS.component)),
  path: v.exactOptional(text(PAGE_CONTEXT_LIMITS.path)),
});

const event = v.variant("type", [
  v.strictObject({ type: v.literal("click"), at: v.pipe(v.number(), v.finite()), element }),
  v.strictObject({ type: v.literal("console-error"), at: v.pipe(v.number(), v.finite()), message: text(PAGE_CONTEXT_LIMITS.message * 2) }),
  v.strictObject({
    type: v.literal("failed-request"),
    at: v.pipe(v.number(), v.finite()),
    method: v.pipe(v.string(), v.regex(/^[A-Z]{3,7}$/)),
    url: text(2048),
    status: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(599)),
  }),
]);

export const pageContextPostSchema = v.strictObject({
  page: v.strictObject({ url: text(2048), title: v.exactOptional(text(PAGE_CONTEXT_LIMITS.label)) }),
  events: v.pipe(v.array(event), v.maxLength(PAGE_CONTEXT_LIMITS.maxEventsPerPost)),
});
export type PageContextPost = v.InferOutput<typeof pageContextPostSchema>;

/** An event as stored and returned: the page it came from is its origin and path only. */
export type PageEvent =
  | { type: "click"; at: number; page: string; element: { tag: string; role?: string; label?: string; component?: string; path?: string } }
  | { type: "console-error"; at: number; page: string; message: string }
  | { type: "failed-request"; at: number; page: string; method: string; path: string; status: number };
