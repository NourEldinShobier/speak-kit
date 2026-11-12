import { describe, expect, it } from "vitest";
import { NOTES_FAILURES, chapterText, parseNotes, promptText, writeNotes } from "../src";

const SAME = "The transcript and the audio are unchanged.";

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
      empty: "There is nothing to write notes from: no words were heard in this meeting.",
    });
  });

  it("a transcript with no words fails as empty without asking the writer", async () => {
    let asked = false;
    const r = await writeNotes({ writer: "w", complete: async () => ((asked = true), { ok: true, text: "{}" }) }, [{ start: 0, text: "   " }]);
    expect(asked).toBe(false);
    expect(r).toEqual({ ok: false, failure: { code: "empty", message: NOTES_FAILURES.empty } });
  });

  it("a writer that never answers ends as a timeout once the wait is over", async () => {
    const r = await writeNotes({ writer: "w", timeoutMs: 5, complete: (_s, _u, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) }, [
      { start: 0, text: "hello" },
    ]);
    expect(r).toMatchObject({ ok: false, failure: { code: "timeout" } });
  });
});

const L = (start: number, text: string) => ({ start, text });

describe("reading the writer's answer", () => {
  const lines = [L(0, "a"), L(10, "b"), L(20, "c")];

  it("accepts a fenced answer, collapses whitespace and keeps only well-formed chapters in time order", () => {
    const answer =
      '```json\n{"title":"  Plan \\n now ","summary":"One.  Two.","chapters":[{"start":20,"title":"Last"},{"start":0,"title":"First"},{"start":-1,"title":"Negative"},{"start":"5","title":"Text start"},{"start":5,"title":"  "},null,{"start":10,"title":"Mid"}]}\n```';
    expect(parseNotes(answer, lines)).toEqual({
      title: "Plan now",
      summary: "One. Two.",
      chapters: [
        { start: 0, title: "First", text: "a" },
        { start: 10, title: "Mid", text: "b" },
        { start: 20, title: "Last", text: "c" },
      ],
    });
  });

  it("cuts a long title and summary", () => {
    const r = parseNotes(JSON.stringify({ title: "t".repeat(300), summary: "s".repeat(3000) }), lines)!;
    expect([r.title.length, r.summary.length, r.chapters]).toEqual([120, 1200, []]);
  });

  it("an answer that is not an object is refused", () => {
    expect(parseNotes("null", lines)).toBeUndefined();
    expect(parseNotes('{"title":"x","summary":""}', lines)).toBeUndefined();
    expect(parseNotes('{"title":"","summary":"x"}', lines)).toBeUndefined();
  });

  it("a line that starts exactly where the next chapter starts belongs to the next chapter", () => {
    expect(
      chapterText(lines, [
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
  it("a transcript exactly at the limit is sent whole and one character over is cut in the middle", () => {
    const whole = "[0:00] x".padEnd(40, "y");
    expect(promptText([L(0, whole.slice(7))], whole.length)).toBe(whole);
    expect(promptText([L(0, `${whole.slice(7)}z`)], whole.length)).toContain("[... part of the meeting left out ...]");
  });
});
