import { describe, expect, it } from "vitest";
import { transcriptNotes } from "./notes";

const ANSWER = JSON.stringify({ title: "Plan", summary: "One. Two.", chapters: [{ start: 0, title: "Start" }] });
const segs = [{ start: 0, end: 2, text: "hello there" }];

describe("transcriptNotes", () => {
  it("is off while the setting is off and on as soon as it is turned on", () => {
    let on = false;
    const get = transcriptNotes({ on: () => on, writer: "W", complete: async () => ({ ok: true, value: ANSWER }) });
    expect(get()).toBeUndefined();
    on = true;
    expect(get()).toBeTypeOf("function");
  });

  it("sends the words without speaker names and returns the writer's notes with the chapter words", async () => {
    const seen: string[] = [];
    const get = transcriptNotes({ on: () => true, writer: "OpenAI m", complete: async (s, u) => (seen.push(s, u), { ok: true, value: ANSWER }) });
    const r = await get()!(segs);
    expect(seen[1]).toBe("[0:00] hello there");
    expect(seen[0]).not.toContain("Them");
    expect(r).toEqual({ ok: true, writer: "OpenAI m", notes: { title: "Plan", summary: "One. Two.", chapters: [{ start: 0, title: "Start", text: "hello there" }] } });
  });

  it("turns a rejected key into a message that says the transcript is unchanged", async () => {
    const get = transcriptNotes({ on: () => true, writer: "W", complete: async () => ({ ok: false, code: "key-rejected" }) });
    const r = await get()!(segs);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.failure.message).toContain("The transcript and the audio are unchanged.");
  });
});
