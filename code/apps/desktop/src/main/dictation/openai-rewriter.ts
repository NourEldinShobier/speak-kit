import type { Rewriter } from "@speakkit/dictation";
import { OPENAI_BASE_URL } from "../voice-chat/openai";

/** The writer model the rewrite pass uses; the opt-in dialog names it. */
export const REWRITE_MODEL = "gpt-4o-mini";

const INSTRUCTIONS =
  "You tidy text that was dictated aloud. Fix punctuation, capital letters and clear speech-recognition mistakes. Keep the meaning, the language, every number, every list item and every line break as they are. Do not add, remove or explain anything. Answer with the tidied text only.";

interface Options {
  /** The saved OpenAI key, read when needed and not kept; null when there is none. */
  readKey(): Promise<string | null>;
  fetch?: typeof fetch;
  baseUrl?: string;
}

/** Sends one dictation to OpenAI for a light tidy. Any failure throws: the pass falls back to the text as said. */
export function createOpenAiRewriter(o: Options): Rewriter {
  const doFetch = o.fetch ?? fetch;
  return {
    async rewrite({ text, signal }) {
      const key = await o.readKey();
      if (!key) throw new Error("no key");
      signal.throwIfAborted(); // the deadline may have passed while the key was read
      const res = await doFetch(`${o.baseUrl ?? OPENAI_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: REWRITE_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: INSTRUCTIONS },
            { role: "user", content: text },
          ],
        }),
        signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
      const out = body.choices?.[0]?.message?.content;
      if (typeof out !== "string") throw new Error("no answer");
      return out;
    },
  };
}
