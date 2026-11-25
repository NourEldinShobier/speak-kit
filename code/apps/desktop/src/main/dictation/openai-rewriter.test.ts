import { describe, expect, it } from "vite-plus/test";
import { GUARD, TEMPLATE_IDS, type TemplateId } from "@speakkit/dictation";
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

  it("tells the model the capital and full-stop choices, and asks for capitals only when they are on", () => {
    expect(instructions()).toContain("capital letters");
    expect(instructions({ capitals: "sentence", stripFinalStop: false })).toContain("capital letters");
    expect(instructions({ capitals: "keep", stripFinalStop: true })).toContain("Do not change any capital");
    expect(instructions({ capitals: "keep", stripFinalStop: true })).toContain("Do not end the text with a full stop");
  });

  const KEY: Record<TemplateId, string> = {
    tidy: "You tidy dictated text.",
    exact: "Change nothing else: keep every word, filler and repetition exactly as said.",
    message: "as a relaxed chat message",
    email: "as the body of an email",
    formal: "in a formal, neutral register",
    notes: "into brief notes",
    concise: "Shorten this dictated text.",
    technical: "for a code editor or terminal",
    professional: "as a calm, professional one",
    firm: "so it stays firm but polite",
    diplomatic: "as a warm, diplomatic one",
  };

  it("builds the prompt of every template from its task and the guard, in at most 92 words", () => {
    for (const id of TEMPLATE_IDS) {
      const text = instructions({ capitals: "sentence", stripFinalStop: false, template: id });
      expect(text, id).toContain(KEY[id]);
      expect(text.endsWith(GUARD), id).toBe(true);
      expect(text.split(/\s+/).length, id).toBeLessThanOrEqual(92);
    }
  });

  it("uses Tidy when no template is named, and puts the capital and full-stop notes before the guard", () => {
    expect(instructions()).toBe(instructions({ capitals: "sentence", stripFinalStop: false, template: "tidy" }));
    const text = instructions({ capitals: "keep", stripFinalStop: true, template: "email" });
    expect(text).toContain("as the body of an email");
    expect(text.endsWith(`Do not change any capital or small letter. Do not end the text with a full stop. ${GUARD}`)).toBe(true);
  });

  const mine = { id: "u-abc123", name: "Support", line: "", prompt: "Write like a friendly support agent.", keepsLists: false };

  it("uses the prompt of a style the person wrote in place of a template's, then the capital notes and the guard", () => {
    const text = instructions({ capitals: "keep", stripFinalStop: false, template: mine.id, styles: [mine] });
    expect(text).toBe(`Write like a friendly support agent. Do not change any capital or small letter. ${GUARD}`);
  });

  it("uses Tidy for a style that was deleted, or one that is not in the list", () => {
    const tidy = instructions({ capitals: "sentence", stripFinalStop: false, template: "tidy" });
    expect(instructions({ capitals: "sentence", stripFinalStop: false, template: mine.id, styles: [] })).toBe(tidy);
    expect(instructions({ capitals: "sentence", stripFinalStop: false, template: "u-other", styles: [mine] })).toBe(tidy);
  });

  it("lists the spots that may be misheard words after the template, before the guard", () => {
    const hints = [{ heard: "clod code", correct: "Claude Code", start: 0, end: 9 }];
    const text = instructions({ capitals: "sentence", stripFinalStop: false, template: "exact" }, hints);
    expect(text).toContain('These words may have been misheard; fix them only where they clearly fit: heard "clod code" may be "Claude Code".');
    expect(text.endsWith(`may be "Claude Code". ${GUARD}`)).toBe(true);
    expect(instructions(undefined, [])).toBe(instructions());
  });
});
