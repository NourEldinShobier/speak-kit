import { describe, expect, it } from "vite-plus/test";
import { maxAnswerTokens, tidy, type ChatSession } from "../src/writer/tidy";

/** A chat session that answers with `reply` and remembers what it was asked. */
function fakeSession(reply: string | ((signal: AbortSignal) => Promise<string>)) {
  const seen: { history: unknown; text: string; options: Record<string, unknown> }[] = [];
  let history: unknown;
  const session: ChatSession = {
    setChatHistory: (h) => void (history = h),
    prompt: async (text, options) => {
      seen.push({ history, text, options });
      return typeof reply === "string" ? reply : reply(options.signal);
    },
  };
  return { session, seen };
}
const live = () => new AbortController().signal;
const req = (signal = live()) => ({ system: "Tidy it.", text: "hello there", signal });

describe("tidying one dictation", () => {
  it("sends the instructions as the only history, the text as the prompt, at a low temperature with thinking off, and returns the answer", async () => {
    const { session, seen } = fakeSession("  Hello there.\n");
    expect(await tidy(session, req())).toBe("Hello there.");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.history).toEqual([{ type: "system", text: "Tidy it." }]);
    expect(seen[0]!.text).toBe("hello there");
    expect(seen[0]!.options).toMatchObject({ temperature: 0.2, maxTokens: 70, stopOnAbortSignal: true, budgets: { thoughtTokens: 0 } });
  });

  it("never returns thinking text, whichever way the model marks it", async () => {
    expect(await tidy(fakeSession("<|channel>thought\nThe user said hello there; add a full stop.<channel|>Hello there.").session, req())).toBe("Hello there.");
    expect(await tidy(fakeSession("<think>hello there needs a capital</think>\nHello there.").session, req())).toBe("Hello there.");
    expect(await tidy(fakeSession("<|channel>thought\n<channel|>Hello there.").session, req())).toBe("Hello there.");
  });

  it("throws when only a thought came out or the answer is empty, so the original text is used", async () => {
    await expect(tidy(fakeSession("<|channel>thought\nstill thinking about the full stop").session, req())).rejects.toThrow("no answer");
    await expect(tidy(fakeSession("  \n").session, req())).rejects.toThrow("no answer");
  });

  it("throws the signal's reason when it fired before the job, and does not ask the model", async () => {
    const stop = new AbortController();
    stop.abort(new Error("deadline"));
    const { session, seen } = fakeSession("Hello there.");
    await expect(tidy(session, req(stop.signal))).rejects.toThrow("deadline");
    expect(seen).toEqual([]);
  });

  it("throws the signal's reason when it fires during the job, and drops the part of the answer that was already written", async () => {
    const stop = new AbortController();
    const { session } = fakeSession(async () => {
      stop.abort(new Error("deadline"));
      return "Hello th";
    });
    await expect(tidy(session, req(stop.signal))).rejects.toThrow("deadline");
  });

  it("allows an answer about as long as the dictation, within 64 and 1024 tokens of it", () => {
    expect(maxAnswerTokens("")).toBe(64);
    expect(maxAnswerTokens("hello there")).toBe(70);
    expect(maxAnswerTokens("x".repeat(10_000))).toBe(1024);
  });
});
