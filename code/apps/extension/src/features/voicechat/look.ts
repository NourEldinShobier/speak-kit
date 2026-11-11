import { parseLookError, parseScreenLook, type LookScope, type VoiceView } from "@speakkit/protocol";
import { ignore } from "../../shared/ignore";
import type { LookAnswer } from "./look-tool";
import type { VoiceEvent } from "./machine";
import { call, type LocalDeps } from "./mint";

/** The user may be answering the app's consent card (it gives up after 60 s), then the app captures and reads the screen. */
const LOOK_TIMEOUT_MS = 90_000;

/** POST /v1/voice-chat/look: one look at the screen. Errors come back as the code to tell the model, never as text from the response. */
export async function lookAtScreen(d: LocalDeps, req: { session: string; scope: LookScope }): Promise<LookAnswer> {
  const res = await call({ timeoutMs: LOOK_TIMEOUT_MS, ...d }, "/v1/voice-chat/look", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  if (typeof res === "string") return { ok: false, code: res === "unpaired" ? "unpaired" : "app-not-running" };
  const body: unknown = await res.json().catch(ignore);
  const code = parseLookError(body);
  if (code) return { ok: false, code };
  if (res.status === 401 || res.status === 403) return { ok: false, code: "unpaired" };
  const look = res.ok ? parseScreenLook(body) : undefined;
  return look ? { ok: true, look } : { ok: false, code: "unavailable" };
}

export interface LookerOptions {
  /** where the app is and the pairing token */
  app(): { port: number; token: string };
  dispatch(e: VoiceEvent): void;
  /** the conversation is not idle: the user may take a while to answer the app's card */
  touch(): void;
  phase(): VoiceView["phase"];
  fetch?: typeof fetch;
}

/** The looks of one conversation. The id names it to the app, which asks the user once per id; a reconnect keeps the conversation, "Talk again" makes a new one. */
export class Looker {
  private readonly id = crypto.randomUUID();
  private readonly o: LookerOptions;
  constructor(o: LookerOptions) {
    this.o = o;
  }

  /** The pill shows "looking" while the app asks, captures and reads. The model goes on only when the user did not speak meanwhile (the phase is then "thinking"). */
  async look(args: { scope: LookScope }): Promise<{ answer: LookAnswer; resume: boolean }> {
    const { dispatch, touch } = this.o;
    dispatch({ t: "look-start" });
    touch();
    const answer = await lookAtScreen({ fetch: (i, init) => (this.o.fetch ?? fetch)(i, init), ...this.o.app() }, { session: this.id, scope: args.scope });
    dispatch({ t: "look-end" });
    touch();
    return { answer, resume: this.o.phase() === "thinking" };
  }
}
