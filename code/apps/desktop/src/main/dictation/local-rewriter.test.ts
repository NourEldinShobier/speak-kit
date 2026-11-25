import { WriterLoadingError, type Rewriter } from "@speakkit/dictation";
import { describe, expect, it } from "vite-plus/test";
import { chooseRewriter, createLocalRewriter, type LocalWriterPort } from "./local-rewriter";
import { instructions } from "./openai-rewriter";

type Req = Parameters<LocalWriterPort["complete"]>[0];
const live = () => new AbortController().signal;

/** A model host that answers `answer` and remembers what it was asked. */
function fakeWriter(answer: string, { downloaded = true, state = "ready" }: { downloaded?: boolean; state?: string } = {}) {
  const asked: Req[] = [];
  const warmed: string[] = [];
  const port: LocalWriterPort = {
    downloaded: async () => downloaded,
    status: () => ({ state }),
    warm: async () => void warmed.push("warm"),
    complete: async (req) => (asked.push(req), answer),
  };
  return { asked, warmed, port };
}
const ready = { status: () => ({ state: "ready" }), warm: async () => {} };

describe("rewriting on this computer", () => {
  it("sends the instructions for the capital and full-stop choices with the text, and returns the trimmed answer", async () => {
    const { port, asked } = fakeWriter("  Hello there\n");
    const signal = live();
    const style = { capitals: "keep", stripFinalStop: true } as const;
    expect(await createLocalRewriter(port).rewrite({ text: "hello there", signal, style })).toBe("Hello there");
    expect(asked).toEqual([{ system: instructions(style), text: "hello there", signal }]);
    expect(asked[0]!.system).toContain("Do not end the text with a full stop");
  });

  it("puts the misheard spots into the instructions", async () => {
    const { port, asked } = fakeWriter("Hello.");
    const hints = [{ heard: "get hug", correct: "GitHub", start: 0, end: 7 }];
    await createLocalRewriter(port).rewrite({ text: "get hug", signal: live(), hints });
    expect(asked[0]!.system).toBe(instructions(undefined, hints));
    expect(asked[0]!.system).toContain('heard "get hug" may be "GitHub"');
  });

  it("uses the sentence-case instructions when the pass gives no style", async () => {
    const { port, asked } = fakeWriter("Hello.");
    await createLocalRewriter(port).rewrite({ text: "hello", signal: live() });
    expect(asked[0]!.system).toBe(instructions());
  });

  it("throws when the model file is not downloaded, and never asks the model, so the original text is used", async () => {
    const { port, asked } = fakeWriter("Hello.", { downloaded: false });
    await expect(createLocalRewriter(port).rewrite({ text: "hello", signal: live() })).rejects.toThrow("no writer model");
    expect(asked).toEqual([]);
  });

  it("does not wait for a model that is loading or released: it keeps loading for the next dictation and the pass pastes the text as said", async () => {
    for (const state of ["loading", "unloaded"]) {
      const { port, asked, warmed } = fakeWriter("Hello.", { state });
      await expect(createLocalRewriter(port).rewrite({ text: "hello", signal: live() })).rejects.toBeInstanceOf(WriterLoadingError);
      expect(asked).toEqual([]);
      expect(warmed).toEqual(["warm"]);
    }
  });

  it("tries a model that failed to load again in the background and reports a plain failure", async () => {
    const { port, asked, warmed } = fakeWriter("Hello.", { state: "error" });
    const job = createLocalRewriter(port).rewrite({ text: "hello", signal: live() });
    await expect(job).rejects.toThrow("the writer failed to load");
    await expect(job).rejects.not.toBeInstanceOf(WriterLoadingError);
    expect(asked).toEqual([]);
    expect(warmed).toEqual(["warm"]);
  });

  it("throws when the model gives no text", async () => {
    await expect(createLocalRewriter(fakeWriter(" \n").port).rewrite({ text: "hello", signal: live() })).rejects.toThrow("no answer");
  });

  it("throws the deadline's reason when it passes while the model works, and when it passed before the model was asked", async () => {
    const stop = new AbortController();
    const slow: LocalWriterPort = {
      ...ready,
      downloaded: async () => true,
      complete: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    };
    const job = createLocalRewriter(slow).rewrite({ text: "hello", signal: stop.signal });
    stop.abort(new Error("deadline"));
    await expect(job).rejects.toThrow("deadline");

    const late = new AbortController();
    const { port, asked } = fakeWriter("Hello.");
    const slowDisk: LocalWriterPort = { ...port, downloaded: async () => (late.abort(new Error("deadline")), true) };
    await expect(createLocalRewriter(slowDisk).rewrite({ text: "hello", signal: late.signal })).rejects.toThrow("deadline");
    expect(asked).toEqual([]);
  });

  it("passes on a failure of the model host as it is", async () => {
    const broken: LocalWriterPort = { ...ready, downloaded: async () => true, complete: async () => Promise.reject(new Error("out of memory")) };
    await expect(createLocalRewriter(broken).rewrite({ text: "hello", signal: live() })).rejects.toThrow("out of memory");
  });
});

describe("choosing the writer", () => {
  const named = (name: string): Rewriter => ({ rewrite: async () => name });

  it("asks the writer the setting names at every dictation", async () => {
    let which: "openai" | "local" = "openai";
    const r = chooseRewriter(() => which, { openai: named("from OpenAI"), local: named("from this computer") });
    expect(await r.rewrite({ text: "x", signal: live() })).toBe("from OpenAI");
    which = "local";
    expect(await r.rewrite({ text: "x", signal: live() })).toBe("from this computer");
  });
});
