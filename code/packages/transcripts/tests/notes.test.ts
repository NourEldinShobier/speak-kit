import { describe, expect, test, vi } from "vitest";
import { createTranscripts, DEFAULT_POLICY, footerOf, notesBlock, viewOf, type NoteDoc, type Summarise, type Transcripts } from "../src";
import { clock, DIR, ids, MemFs, tone } from "./fakes";

const OUT = "/export";
const GOOD: Summarise = async () => ({
  ok: true,
  writer: "OpenAI test-model",
  notes: { title: "Weekly sync", summary: "They agreed the date. Nothing else was decided.", chapters: [{ start: 0, title: "Date", text: "words 1" }] },
});

function setup(notes: () => Summarise | undefined, text = (n: number) => `words ${n}`, busy: () => boolean = () => false, changed: () => void = () => {}) {
  const fs = new MemFs();
  const c = clock();
  let calls = 0;
  const t = createTranscripts({
    dir: DIR,
    fs,
    now: c.now,
    newId: ids(),
    transcribe: async () => ({ ok: true, text: text(++calls), speech: true }),
    busy,
    sleep: c.sleep,
    model: () => "model-a",
    policy: () => DEFAULT_POLICY,
    exportDir: () => OUT,
    changed,
    notes,
  });
  return { fs, t };
}

const imported = async (t: Transcripts) => {
  await t.ready;
  const r = await t.importAudio({ name: "a.m4a", pcm: tone(5), language: "en" });
  const id = (r as unknown as { id: string }).id;
  await vi.waitFor(async () => expect((await t.get(id))!.status).toBe("done"));
  return id;
};

const notesState = async (t: Transcripts, id: string, state: string) => vi.waitFor(async () => expect((await t.get(id))!.notes?.state).toBe(state));

describe("notes after a transcript finishes", () => {
  test("a finished transcript gets notes when a writer is on", async () => {
    const s = await setup(() => GOOD);
    const t = await s.t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    const d = (await t.get(id))!;
    expect(d.notes).toMatchObject({ state: "ready", doc: { title: "Weekly sync", writer: "OpenAI test-model" } });
    expect(t.list()[0]!.notesState).toBe("ready");
  });

  test("no writer means no notes state at all", async () => {
    const t = await setup(() => undefined).t;
    const id = await imported(t);
    await t.dispose();
    expect((await t.get(id))!.notes).toBeUndefined();
    expect(t.list()[0]!.notesState).toBeUndefined();
  });

  test("a failed pass keeps the words and the audio and a later pass can succeed", async () => {
    let on: Summarise = async () => ({ ok: false, failure: { code: "failed", message: "OpenAI is busy right now. The transcript is unchanged." } });
    const s = setup(() => on);
    const t = await s.t;
    const id = await imported(t);
    await notesState(t, id, "failed");
    const d = (await t.get(id))!;
    expect(d.notes).toEqual({ state: "failed", failure: { code: "notes", message: "OpenAI is busy right now. The transcript is unchanged." } });
    expect(d.segments.map((x) => x.text)).toEqual(["words 1"]);
    expect(d.status).toBe("done");
    on = GOOD;
    expect(await t.writeNotes(id)).toEqual({ ok: true });
    expect((await t.get(id))!.notes?.state).toBe("ready");
    expect([...s.fs.files.keys()].some((k) => k.endsWith(`${id}.notes.json`))).toBe(true);
  });

  test("a later failure keeps the notes written before", async () => {
    let on: Summarise = GOOD;
    const t = await setup(() => on).t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    on = async () => ({ ok: false, failure: { code: "failed", message: "offline" } });
    expect((await t.writeNotes(id)).ok).toBe(false);
    const n = (await t.get(id))!.notes!;
    expect(n.state).toBe("failed");
    expect(n.doc?.title).toBe("Weekly sync");
  });

  test("a writer that throws is a failure with a message that says the transcript is unchanged", async () => {
    const t = await setup(() => async () => {
      throw new Error("boom");
    }).t;
    const id = await imported(t);
    await notesState(t, id, "failed");
    const d = (await t.get(id))!;
    expect(d.status).toBe("done");
    expect(d.notes).toEqual({ state: "failed", failure: { code: "notes", message: "The notes could not be written. The transcript is unchanged." } });
  });

  test("only one pass runs at a time and the state says writing while it runs", async () => {
    let release: () => void = () => {};
    let calls = 0;
    const slow: Summarise = () => {
      calls++;
      return new Promise((res) => (release = () => res({ ok: true, writer: "W", notes: { title: "T", summary: "S.", chapters: [] } })));
    };
    const t = await setup(() => slow).t;
    const id = await imported(t);
    await vi.waitFor(() => expect(calls).toBe(1));
    expect((await t.get(id))!.notes).toEqual({ state: "writing" });
    expect(t.list()[0]!.notesState).toBe("writing");
    expect((await t.writeNotes(id)).ok).toBe(false);
    expect(calls).toBe(1);
    release();
    await notesState(t, id, "ready");
    expect(t.list()[0]!.notesState).toBe("ready");
  });

  test("a window is told when the pass starts and when it ends", async () => {
    let n = 0;
    const t = await setup(
      () => GOOD,
      (k) => `words ${k}`,
      () => false,
      () => void n++,
    ).t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    const before = n;
    await t.writeNotes(id);
    expect(n - before).toBeGreaterThanOrEqual(3);
  });

  test("notes cannot be written for a transcript that is not finished", async () => {
    let busy = true;
    const t = await setup(
      () => GOOD,
      undefined,
      () => busy,
    ).t;
    await t.ready;
    const r = await t.importAudio({ name: "a.m4a", pcm: tone(5), language: "en" });
    const id = (r as unknown as { id: string }).id;
    expect((await t.get(id))!.status).not.toBe("done");
    expect((await t.writeNotes(id)).ok).toBe(false);
    busy = false;
    await vi.waitFor(async () => expect((await t.get(id))!.status).toBe("done"));
  });

  test("writing again with notes off says so and changes nothing", async () => {
    const t = await setup(() => undefined).t;
    const id = await imported(t);
    const r = await t.writeNotes(id);
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, failure: { code: "notes", message: "Notes are off. Turn on writing notes in the Meetings settings, then write them again. The transcript is unchanged." } });
    expect((await t.get(id))!.notes).toBeUndefined();
  });

  test("a transcript with no words has nothing to write notes from", async () => {
    const t = await setup(
      () => GOOD,
      () => "   ",
    ).t;
    const id = await imported(t);
    await t.dispose();
    const r = await t.writeNotes(id);
    expect(r).toEqual({ ok: false, failure: { code: "notes", message: "There is nothing to write notes from: no words were heard." } });
  });

  test("writing again for an unknown transcript fails without throwing", async () => {
    const t = await setup(() => GOOD).t;
    await t.ready;
    expect((await t.writeNotes("nope")).ok).toBe(false);
  });

  test("removing a transcript removes its notes file", async () => {
    const s = setup(() => GOOD);
    const t = await s.t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    await t.remove(id);
    expect([...s.fs.files.keys()].filter((k) => k.includes(`/items/${id}`))).toEqual([]);
  });

  test("an unreadable notes file is no notes and the transcript still opens", async () => {
    const s = setup(() => GOOD);
    const t = await s.t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    s.fs.files.set(`${DIR}/items/${id}.notes.json`, new TextEncoder().encode("{not json"));
    const d = (await t.get(id))!;
    expect(d.notes).toBeUndefined();
    expect(d.segments).toHaveLength(1);
  });
});

describe("exports with a summary", () => {
  test("text and Markdown carry the summary and name the writer", async () => {
    const t = await setup(() => GOOD).t;
    const id = await imported(t);
    await notesState(t, id, "ready");
    const txt = (await t.text(id, "txt"))!.text;
    expect(txt).toContain("Summary\nThey agreed the date. Nothing else was decided.");
    expect(txt).toContain("Summary written by OpenAI test-model.");
    expect(txt).toContain("[0:00] words 1");
    const md = (await t.text(id, "md"))!.text;
    expect(md).toContain("## Summary");
    expect(md).toContain("_Summary written by OpenAI test-model._");
    expect(JSON.parse((await t.text(id, "json"))!.text)).toMatchObject({ summaryWriter: "OpenAI test-model", chapters: [{ start: 0, title: "Date" }] });
    expect((await t.text(id, "srt"))!.text).not.toContain("Summary");
  });

  test("with no notes the export is the plain transcript", async () => {
    const t = await setup(() => undefined).t;
    const id = await imported(t);
    expect((await t.text(id, "txt"))!.text).not.toContain("Summary");
  });
});

describe("pure notes helpers", () => {
  const doc: NoteDoc = { title: "T", summary: "S.", chapters: [{ start: 65, title: "Later", text: "x" }], writer: "W", at: 1 };
  test("footer and block", () => {
    expect(footerOf("W")).toBe("Summary written by W.");
    expect(notesBlock(doc, false)).toEqual(["Summary", "S.", "", "Chapters", "[1:05] Later", "", "Summary written by W.", ""]);
    expect(notesBlock({ ...doc, chapters: [] }, true)).toEqual(["## Summary", "S.", "", "_Summary written by W._", ""]);
  });
  test("view of a record", () => {
    expect(viewOf(undefined, false)).toBeUndefined();
    expect(viewOf(undefined, true)).toEqual({ state: "writing" });
    expect(viewOf({ doc }, true)).toEqual({ state: "writing", doc });
    expect(viewOf({ doc }, false)).toEqual({ state: "ready", doc });
    expect(viewOf({ doc, failure: { code: "failed", message: "m" } }, false)).toEqual({ state: "failed", failure: { code: "failed", message: "m" }, doc });
    expect(viewOf({}, false)).toBeUndefined();
  });
});
