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

/** An `error` event of the data channel ends the conversation only when it names one of these codes; the rest (an empty audio commit, say) are ignored. */
export function eventProblem(event: unknown): VoiceProblem | undefined {
  const code = openAiCode(event);
  return code === "insufficient_quota" || code === "billing_hard_limit_reached" || code === "invalid_api_key" || code === "rate_limit_exceeded" ? openAiProblem({ code }) : undefined;
}
