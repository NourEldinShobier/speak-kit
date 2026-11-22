import { describe, expect, it } from "vitest";
import { NOTES_FAILURES, chapterText, parseNotes, promptText, writeNotes } from "../src/notes-writer";

const SAME = "The transcript and the audio are unchanged.";
const L = (start: number, text: string) => ({ start, text });
const lines = [L(0, "Let's plan the release."), L(65, "Wazuh needs the new Okta setup."), L(130, "Agreed, ship Friday.")];
const good = JSON.stringify({
  title: " Release plan ",
  summary: "They planned the release. They agreed to ship Friday.",
  chapters: [
    { start: 60, title: "Security" },
    { start: 0, title: "Plan" },
    { start: "x", title: "bad" },
    { start: 5, title: "" },
  ],
});

describe("what each notes failure says", () => {
  it("names the cause, says nothing else was touched, and says what to do", () => {
    expect(NOTES_FAILURES).toEqual({
      "no-key": `Notes need your OpenAI key, which is not set. ${SAME} Add the key in Voice chat settings, then regenerate the notes.`,
      "key-rejected": `OpenAI did not accept the key. ${SAME} Check the key, then regenerate the notes.`,
      "no-credit": `Your OpenAI account has no credit left. ${SAME} Add credit, then regenerate the notes.`,
      "rate-limited": `OpenAI is busy right now. ${SAME} Regenerate the notes in a minute.`,
      offline: `The notes could not be written because OpenAI could not be reached. ${SAME} Regenerate the notes when you are online.`,
      unavailable: `OpenAI could not write the notes. ${SAME} Regenerate the notes to try again.`,
      unreadable: `The writer's answer could not be read. ${SAME} Regenerate the notes to try again.`,
      timeout: `Writing the notes took too long. ${SAME} Regenerate the notes to try again.`,
      empty: "There is nothing to write notes from: no words were heard.",
    });
  });
});

describe("writing the notes", () => {
  it("a transcript with no words fails as empty without asking the writer", async () => {
    let asked = false;
    const r = await writeNotes({ writer: "w", complete: async () => ((asked = true), { ok: true, text: "{}" }) }, [L(0, "   ")]);
    expect(asked).toBe(false);
    expect(r).toEqual({ ok: false, failure: { code: "empty", message: "There is nothing to write notes from: no words were heard." } });
  });

  it("a writer that never answers ends as a timeout once the wait is over", async () => {
    const r = await writeNotes({ writer: "w", timeoutMs: 5, complete: (_s, _u, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) }, [
      L(0, "hello"),
    ]);
    expect(r).toMatchObject({ ok: false, failure: { code: "timeout" } });
  });

  it.each(["no-key", "key-rejected", "no-credit", "rate-limited", "offline", "unavailable"] as const)("falls back to the transcript with a clear message on %s", async (code) => {
    const r = await writeNotes({ writer: "w", complete: async () => ({ ok: false, code }) }, lines);
    expect(r).toEqual({ ok: false, failure: { code, message: NOTES_FAILURES[code] } });
  });

  it("fails with a message when the writer answers nonsense or throws", async () => {
    expect(await writeNotes({ writer: "w", complete: async () => ({ ok: true, text: "nope" }) }, lines)).toMatchObject({ failure: { code: "unreadable" } });
    const throws = async (): Promise<never> => {
      throw new Error("boom");
    };
    expect(await writeNotes({ writer: "w", complete: throws }, lines)).toMatchObject({ failure: { code: "unavailable" } });
  });

  it("writes the notes and names the writer", async () => {
    const r = await writeNotes({ writer: "GPT", complete: async () => ({ ok: true, text: good }) }, lines);
    expect(r).toMatchObject({ ok: true, writer: "GPT", notes: { title: "Release plan" } });
  });
});

describe("reading the writer's answer", () => {
  const three = [L(0, "a"), L(10, "b"), L(20, "c")];

  it("accepts a fenced answer, orders chapters and gives each its words", () => {
    expect(parseNotes(`\`\`\`json\n${good}\n\`\`\``, lines)).toEqual({
      title: "Release plan",
      summary: "They planned the release. They agreed to ship Friday.",
      chapters: [
        { start: 0, title: "Plan", text: "Let's plan the release." },
        { start: 60, title: "Security", text: "Wazuh needs the new Okta setup. Agreed, ship Friday." },
      ],
    });
  });

  it("collapses whitespace and keeps only well-formed chapters in time order", () => {
    const answer =
      '```json\n{"title":"  Plan \\n now ","summary":"One.  Two.","chapters":[{"start":20,"title":"Last"},{"start":0,"title":"First"},{"start":-1,"title":"Negative"},{"start":"5","title":"Text start"},{"start":5,"title":"  "},null,{"start":10,"title":"Mid"}]}\n```';
    expect(parseNotes(answer, three)).toEqual({
      title: "Plan now",
      summary: "One. Two.",
      chapters: [
        { start: 0, title: "First", text: "a" },
        { start: 10, title: "Mid", text: "b" },
        { start: 20, title: "Last", text: "c" },
      ],
    });
  });

  it("drops a chapter that starts after the last word", () => {
    const answer = JSON.stringify({
      title: "T",
      summary: "S.",
      chapters: [
        { start: 0, title: "Plan" },
        { start: 9999, title: "Past the end" },
      ],
    });
    expect(parseNotes(answer, lines)?.chapters.map((c) => c.title)).toEqual(["Plan"]);
  });

  it("cuts a long title and summary", () => {
    const r = parseNotes(JSON.stringify({ title: "t".repeat(300), summary: "s".repeat(3000) }), three)!;
    expect([r.title.length, r.summary.length, r.chapters]).toEqual([120, 1200, []]);
  });

  it("an answer that is not JSON, not an object or without a title or summary is refused", () => {
    expect(parseNotes("sure!", three)).toBeUndefined();
    expect(parseNotes("null", three)).toBeUndefined();
    expect(parseNotes('{"title":"x","summary":""}', three)).toBeUndefined();
    expect(parseNotes('{"title":"","summary":"x"}', three)).toBeUndefined();
  });

  it("a line that starts exactly where the next chapter starts belongs to the next chapter", () => {
    expect(
      chapterText(three, [
        { start: 0, title: "A" },
        { start: 10, title: "B" },
      ]),
    ).toEqual([
      { start: 0, title: "A", text: "a" },
      { start: 10, title: "B", text: "b c" },
    ]);
  });
});

describe("the text sent to the writer", () => {
  it("is one stamped line per entry", () => {
    expect(promptText([L(3725, "hi"), L(5, "hello")])).toBe("[1:02:05] hi\n[0:05] hello");
  });

  it("a transcript exactly at the limit is sent whole and one character over is cut in the middle", () => {
    const whole = "[0:00] x".padEnd(40, "y");
    expect(promptText([L(0, whole.slice(7))], whole.length)).toBe(whole);
    expect(promptText([L(0, `${whole.slice(7)}z`)], whole.length)).toContain("[... part of the transcript left out ...]");
  });

  it("cuts a huge transcript in the middle", () => {
    const big = Array.from({ length: 5000 }, (_, i) => L(i, "word ".repeat(10)));
    const t = promptText(big, 1000);
    expect(t.length).toBeLessThan(1100);
    expect(t).toContain("[... part of the transcript left out ...]");
  });
});
