import { describe, expect, it } from "vite-plus/test";
import { createOpenAiRewriter, instructions, REWRITE_MODEL } from "./openai-rewriter";

const reply =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });
const signal = new AbortController().signal;

describe("OpenAI rewriter", () => {
  it("sends the text with the saved key and returns the answer", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const w = createOpenAiRewriter({
      readKey: async () => "sk-test",
      baseUrl: "http://local.test",
      fetch: (async (url: string, init: RequestInit) => ((seen = { url, init }), new Response(JSON.stringify({ choices: [{ message: { content: "Hello there." } }] })))) as never,
    });
    expect(await w.rewrite({ text: "hello there", signal })).toBe("Hello there.");
    expect(seen?.url).toBe("http://local.test/v1/chat/completions");
    const headers = (seen?.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(seen?.init.body));
    expect(body.model).toBe(REWRITE_MODEL);
    expect(body.messages[1]).toEqual({ role: "user", content: "hello there" });
    expect(seen?.init.signal).toBe(signal);
  });

  it("fails without a key, on an error status and on an answer with no text, so the pass falls back", async () => {
    await expect(createOpenAiRewriter({ readKey: async () => null, fetch: reply({}) as never }).rewrite({ text: "x", signal })).rejects.toThrow("no key");
    await expect(createOpenAiRewriter({ readKey: async () => "k", fetch: reply({}, 401) as never }).rewrite({ text: "x", signal })).rejects.toThrow("status 401");
    await expect(createOpenAiRewriter({ readKey: async () => "k", fetch: reply({ choices: [] }) as never }).rewrite({ text: "x", signal })).rejects.toThrow("no answer");
    await expect(createOpenAiRewriter({ readKey: async () => "k", fetch: reply({ choices: [{ message: { content: 5 } }] }) as never }).rewrite({ text: "x", signal })).rejects.toThrow("no answer");
  });

  it("passes the deadline signal on, so a late answer is cut off", async () => {
    const ac = new AbortController();
    const w = createOpenAiRewriter({
      readKey: async () => "k",
      fetch: ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as never,
    });
    const p = w.rewrite({ text: "x", signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow("aborted");
  });

  it("tells the model the mode's capital and full-stop choices, and asks for capitals only when the mode wants them", () => {
    expect(instructions()).toContain("capital letters");
    expect(instructions({ capitals: "sentence", stripFinalStop: false })).toContain("capital letters");
    expect(instructions({ capitals: "lower", stripFinalStop: false })).toContain("lower case");
    expect(instructions({ capitals: "lower", stripFinalStop: false })).not.toContain("capital letters");
    expect(instructions({ capitals: "keep", stripFinalStop: true })).toContain("Do not change any capital");
    expect(instructions({ capitals: "keep", stripFinalStop: true })).toContain("Do not end the text with a full stop");
  });
});
