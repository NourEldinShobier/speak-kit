import type { Rewriter, RewriteStyle } from "@speakkit/dictation";
import { OPENAI_BASE_URL } from "../voice-chat/openai";

/** The writer model the rewrite pass uses; the opt-in dialog names it. */
export const REWRITE_MODEL = "gpt-4o-mini";

const BASE = "Keep the meaning, the language, every number, every list item and every line break as they are. Do not add, remove or explain anything. Answer with the tidied text only.";

const CASE_NOTE = { sentence: "", lower: " Write everything in lower case.", keep: " Do not change any capital or small letter." } as const;

/** The system prompt: the mode's choices about capitals and the final full stop are told to the model, not left to it. */
export const instructions = (style?: RewriteStyle): string => {
  const fixes = style && style.capitals !== "sentence" ? "Fix punctuation and clear speech-recognition mistakes." : "Fix punctuation, capital letters and clear speech-recognition mistakes.";
  const case_ = style ? CASE_NOTE[style.capitals] : "";
  const stop = style?.stripFinalStop ? " Do not end the text with a full stop." : "";
  return `You tidy text that was dictated aloud. ${fixes}${case_}${stop} ${BASE}`;
};

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
    async rewrite({ text, signal, style }) {
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
            { role: "system", content: instructions(style) },
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
