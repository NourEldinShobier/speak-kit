import type { VoiceProblem } from "@speakkit/protocol";

export type PillAction = "set-up" | "check-key" | "manage-plan" | "retry" | "allow-mic" | "reader" | "update" | "use-selection" | "open-app" | "settings";

/** The pill of each problem: one short line and one action. */
export const PROBLEMS: Record<VoiceProblem, { text: string; label: string; action: PillAction }> = {
  "no-key": { text: "Add your API key", label: "Set up", action: "set-up" },
  "key-rejected": { text: "Key rejected", label: "Check key", action: "check-key" },
  "no-credit": { text: "No credit left", label: "Manage plan", action: "manage-plan" },
  "rate-limited": { text: "Too many requests", label: "Retry", action: "retry" },
  offline: { text: "You are offline", label: "Retry", action: "retry" },
  unavailable: { text: "Voice chat is unavailable", label: "Retry", action: "retry" },
  "app-not-running": { text: "Speak Kit isn't running", label: "Open Speak Kit", action: "open-app" },
  unpaired: { text: "Pair Speak Kit first", label: "Settings", action: "settings" },
  "mic-blocked": { text: "Microphone blocked", label: "How to allow", action: "allow-mic" },
  "mic-missing": { text: "No microphone found", label: "Retry", action: "retry" },
  unreadable: { text: "Cannot read this page", label: "Reader view", action: "reader" },
  "too-long": { text: "Page is too long", label: "Use selection", action: "use-selection" },
  "page-changed": { text: "Page changed", label: "Update", action: "update" },
};

/** What went wrong talking to OpenAI. `code` is the error code or type of an OpenAI error body, never its message. */
export interface OpenAiFailure {
  status?: number | undefined;
  code?: string | undefined;
  network?: boolean | undefined;
}

/** The problem an OpenAI failure maps to. */
export function openAiProblem(f: OpenAiFailure): VoiceProblem {
  if (f.network) return "offline";
  if (f.code === "insufficient_quota" || f.code === "billing_hard_limit_reached") return "no-credit";
  if (f.status === 401 || f.status === 403 || f.code === "invalid_api_key" || f.code === "invalid_ephemeral_key") return "key-rejected";
  if (f.status === 429 || f.code === "rate_limit_exceeded") return "rate-limited";
  return "unavailable";
}

/** Reads the code of an OpenAI error body ({ error: { code, type } }), or undefined. Message text is dropped on purpose: it can echo a key. */
export function openAiCode(body: unknown): string | undefined {
  const e = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  const c = [e?.code, e?.type].find((x) => typeof x === "string") as string | undefined;
  return c?.slice(0, 80);
}

/** The pill for a failed getUserMedia: no device, one another program holds, or no usable one is "missing"; everything else (the user said no, a policy) is "blocked". */
export function micProblem(error: unknown): VoiceProblem {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError" ? "mic-missing" : "mic-blocked";
}

/** Errors of the data channel that change nothing for the conversation (an empty audio commit, a cancel with nothing to cancel). */
const HARMLESS = new Set(["input_audio_buffer_commit_empty", "response_cancel_not_active", "conversation_already_has_active_response"]);
const ACCOUNT = new Set(["insufficient_quota", "billing_hard_limit_reached", "invalid_api_key", "invalid_ephemeral_key", "rate_limit_exceeded"]);

/** An `error` event of the data channel ends the conversation unless its code is known to be harmless: an unknown one, a rejected session.update among them, means the model may not have the page, so it ends as unavailable. Only the code is read, never the message. */
export function eventProblem(event: unknown): VoiceProblem | undefined {
  const code = openAiCode(event);
  if (code && HARMLESS.has(code)) return undefined;
  return code && ACCOUNT.has(code) ? openAiProblem({ code }) : "unavailable";
}
