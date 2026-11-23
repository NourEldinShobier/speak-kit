// Runs inside the writer host. Plain Node-runnable TS (type stripping): no enums.

/** The part of node-llama-cpp's chat session the writer uses; tests give a fake one. */
export interface ChatSession {
  setChatHistory(history: { type: "system"; text: string }[]): void;
  prompt(text: string, options: { temperature: number; maxTokens: number; signal: AbortSignal; stopOnAbortSignal: true; budgets: { thoughtTokens: 0 } }): Promise<string>;
}

/** Low, so the same dictation gets the same text; the OpenAI writer uses the same value. */
const TEMPERATURE = 0.2;

/** The answer is about as long as the dictation; this stops a model that does not stop. */
export const maxAnswerTokens = (text: string): number => Math.min(1024, Math.ceil(text.length / 2) + 64);

/** Gemma's thought channel and the <think> blocks of other reasoning models; thinking is switched off, so this only guards against a leak. */
const THOUGHT = /<\|channel>thought[\s\S]*?(?:<channel\|>|$)|<think>[\s\S]*?(?:<\/think>|$)|<\|?\/?(?:channel|think|turn)\|?>/g;

/** One tidy-up job on a chat session that is reset first: nothing of an earlier dictation reaches the model. Throws when stopped or when nothing came out. */
export async function tidy(session: ChatSession, req: { system: string; text: string; signal: AbortSignal }): Promise<string> {
  req.signal.throwIfAborted();
  session.setChatHistory([{ type: "system", text: req.system }]);
  const raw = await session.prompt(req.text, { temperature: TEMPERATURE, maxTokens: maxAnswerTokens(req.text), signal: req.signal, stopOnAbortSignal: true, budgets: { thoughtTokens: 0 } });
  req.signal.throwIfAborted(); // a stopped prompt answers with what it had so far; that is not an answer
  const out = raw.replace(THOUGHT, "").trim();
  if (!out) throw new Error("the writer gave no answer");
  return out;
}
