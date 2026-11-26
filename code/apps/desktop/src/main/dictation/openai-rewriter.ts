import { DEFAULT_TEMPLATE, dictationMessage, GUARD, hintBlock, resolveStyle, systemFor, type Hint, type LanguageProfile, type Rewriter, type RewriteStyle } from "@speakkit/dictation";
import { OPENAI_BASE_URL } from "../voice-chat/openai";

/** The writer model the rewrite pass uses; the opt-in dialog names it. */
export const REWRITE_MODEL = "gpt-4o-mini";

const CASE_NOTE = { sentence: "", keep: " Do not change any capital or small letter." } as const;

/** The system prompt: the task of the template or of the person's own style (Tidy when that style is gone), then the clean-up choices about capitals and the final full stop (told to the model, not left to it), the spots that may be misheard words, then the guard; for text in a language with a profile, its wording. */
export const instructions = (style?: RewriteStyle, hints: readonly Hint[] = [], language?: LanguageProfile): string => {
  const case_ = style ? CASE_NOTE[style.capitals] : "";
  const stop = style?.stripFinalStop ? " Do not end the text with a full stop." : "";
  const misheard = hints.length ? ` ${hintBlock(hints)}` : "";
  const system = `${resolveStyle(style?.template ?? DEFAULT_TEMPLATE, style?.styles).prompt}${case_}${stop}${misheard} ${GUARD}`;
  return systemFor(system, language);
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
    async rewrite({ text, signal, style, hints, language }) {
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
            { role: "system", content: instructions(style, hints, language) },
            { role: "user", content: dictationMessage(text, language) },
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
