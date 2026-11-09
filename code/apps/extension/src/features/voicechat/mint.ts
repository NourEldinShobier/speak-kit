import { parseVoiceChatError, parseVoiceChatSession, parseVoiceChatStatus, type VoiceChatSession, type VoiceProblem } from "@speakkit/protocol";
import { ignore } from "../../shared/ignore";

/** Calls to the Speak Kit app on 127.0.0.1. The app holds the OpenAI key; this side only ever sees a short-lived client secret. */
export interface LocalDeps {
  fetch: typeof fetch;
  port: number;
  token: string;
}

export type Minted = { ok: true; session: VoiceChatSession } | { ok: false; problem: VoiceProblem };

const TIMEOUT_MS = 15_000;

async function call(d: LocalDeps, path: string, init: RequestInit): Promise<Response | VoiceProblem> {
  if (!d.token) return "unpaired";
  try {
    const res = await d.fetch(`http://127.0.0.1:${d.port}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${d.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.status === 401 || res.status === 403 ? "unpaired" : res;
  } catch {
    return "app-not-running";
  }
}

/** POST /v1/voice-chat/session: a fresh client secret. Errors come back as the problem to show, never as text from the response. */
export async function mintSession(d: LocalDeps): Promise<Minted> {
  const res = await call(d, "/v1/voice-chat/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (typeof res === "string") return { ok: false, problem: res };
  const body: unknown = await res.json().catch(ignore);
  if (res.ok) {
    const session = parseVoiceChatSession(body);
    return session ? { ok: true, session } : { ok: false, problem: "unavailable" };
  }
  return { ok: false, problem: parseVoiceChatError(body) ?? "unavailable" };
}

/** GET /v1/voice-chat/status: whether the app has a key. */
export async function voiceStatus(d: LocalDeps): Promise<{ ok: true; hasKey: boolean } | { ok: false; problem: VoiceProblem }> {
  const res = await call(d, "/v1/voice-chat/status", {});
  if (typeof res === "string") return { ok: false, problem: res };
  const status = res.ok ? parseVoiceChatStatus(await res.json().catch(ignore)) : undefined;
  return status ? { ok: true, hasKey: status.hasKey } : { ok: false, problem: "unavailable" };
}
