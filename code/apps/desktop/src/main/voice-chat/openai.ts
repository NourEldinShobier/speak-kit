import * as v from "valibot";
import type { VoiceChatErrorCode, VoiceChatVoice } from "@speakkit/protocol";

export const OPENAI_BASE_URL = "https://api.openai.com";
const SECRET_LIFETIME_SECONDS = 600;

export type OpenAiResult<T> = { ok: true; value: T } | { ok: false; code: VoiceChatErrorCode };
export interface OpenAiOptions {
  baseUrl: string;
  fetch: typeof fetch;
  /** Aborts the call (the caller's deadline). */
  signal?: AbortSignal | undefined;
  /** Overrides the default timeout of the call. */
  timeoutMs?: number;
}

/** What an error status from OpenAI means for the user. The body is read for the quota case only and is never kept or logged. */
export function mapFailure(status: number, body: unknown): VoiceChatErrorCode {
  if (status === 401 || status === 403) return "key-rejected";
  if (status === 402) return "no-credit";
  if (status === 429) {
    const e = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
    return e?.code === "insufficient_quota" || e?.type === "insufficient_quota" ? "no-credit" : "rate-limited";
  }
  return "unavailable";
}

interface Call extends OpenAiOptions {
  key: string;
  path: string;
  init: RequestInit;
  defaultTimeoutMs: number;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null; // not JSON: only the status counts then
  }
}

async function call(c: Call): Promise<OpenAiResult<unknown>> {
  const signal = AbortSignal.any([AbortSignal.timeout(c.timeoutMs ?? c.defaultTimeoutMs), ...(c.signal ? [c.signal] : [])]);
  let res: Response;
  try {
    res = await c.fetch(`${c.baseUrl}${c.path}`, { ...c.init, headers: { ...c.init.headers, Authorization: `Bearer ${c.key}` }, signal });
  } catch {
    return { ok: false, code: "offline" }; // no connection, DNS failure or timeout; the error text is dropped
  }
  const body = await readJson(res);
  return res.ok ? { ok: true, value: body } : { ok: false, code: mapFailure(res.status, body) };
}

/** GET /v1/models: the cheapest call that needs a valid key. */
export async function testKey(key: string, o: OpenAiOptions): Promise<OpenAiResult<true>> {
  const r = await call({ ...o, key, path: "/v1/models", init: { method: "GET" }, defaultTimeoutMs: 5000 });
  return r.ok ? { ok: true, value: true } : r;
}

const secretSchema = v.object({ value: v.pipe(v.string(), v.minLength(1)), expires_at: v.number() });

export interface MintOptions extends OpenAiOptions {
  model: string;
  voice: VoiceChatVoice;
}

/** POST /v1/realtime/client_secrets: a client secret that expires after 10 minutes, for a realtime session with the model and voice. */
export async function mintClientSecret(key: string, o: MintOptions): Promise<OpenAiResult<{ clientSecret: string; expiresAt: number }>> {
  const body = { expires_after: { anchor: "created_at", seconds: SECRET_LIFETIME_SECONDS }, session: { type: "realtime", model: o.model, audio: { output: { voice: o.voice } } } };
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await call({ ...o, key, path: "/v1/realtime/client_secrets", init, defaultTimeoutMs: 6000 });
  if (!r.ok) return r;
  const parsed = v.safeParse(secretSchema, r.value);
  return parsed.success ? { ok: true, value: { clientSecret: parsed.output.value, expiresAt: parsed.output.expires_at } } : { ok: false, code: "unavailable" };
}
