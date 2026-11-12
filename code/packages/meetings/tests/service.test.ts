import { describe, expect, it } from "vitest";
import { record, setup, settled } from "./harness";
import { tone } from "./fakes";

const good = JSON.stringify({ title: "Release plan", summary: "They planned it.", chapters: [{ start: 0, title: "Plan" }] });
const FULL = "The disk is full. Free some space and try again.";
const GENERIC = "Something went wrong with this meeting. The audio recorded so far is kept.";

describe("starting and appending", () => {
  it("trims a given title and falls back to the temporary one when it is blank", async () => {
    const t = setup();
    const m = await t.open();
    await m.begin({ providerId: "zoom", providerName: "Zoom", title: "  Standup  " });
    await m.begin({ providerId: "zoom", providerName: "Zoom", title: "   " });
    expect(
      m
        .list()
        .map((r) => r.title)
        .sort(),
    ).toEqual(["Standup", "Zoom · 14:05"]);
    expect(m.list().find((r) => r.title === "Standup")).toMatchObject({ titleTemporary: true, audioBytes: 0, trashed: false, notes: { state: "off", chapters: 0 } });
  });

  it("tells the app about every change, and refuses to start when the manifest cannot be written", async () => {
    const t = setup();
    const m = await t.open();
    const before = t.calls.changed;
    await m.begin({ providerId: "zoom", providerName: "Zoom" });
    expect(t.calls.changed).toBeGreaterThan(before);
    t.fs.failOn = /manifest/;
    const n = t.calls.changed;
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    expect(b.ok).toBe(false);
    expect(t.calls.changed).toBeGreaterThan(n);
  });

  it("says a full disk in words when audio cannot be written", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    t.fs.full = true;
    expect(await m.append(b.id, "you", tone(1), 0)).toMatchObject({ ok: false, failure: { message: FULL } });
    t.fs.full = false;
    expect(await m.append(b.id, "you", tone(1), 0)).toEqual({ ok: true });
    expect(await m.append("nope", "you", tone(1), 0)).toMatchObject({ ok: false, failure: { message: GENERIC } });
  });
});

describe("ending", () => {
  it("records the exact duration and keeps the duration of a recording that failed", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c, 4);
    expect((await settled(m, id)).durationSec).toBe(4);
    const t2 = setup();
    const m2 = await t2.open();
    const b = await m2.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    t2.c.advance(7000);
    expect(await m2.end(b.id)).toMatchObject({ ok: false, failure: { code: "nothing-recorded" } });
    expect(m2.list()[0]).toMatchObject({ status: "failed", durationSec: 7 });
  });

  it("moves through saving and transcribing before it is done", async () => {
    const seen: string[] = [];
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    t.deps.changed = () => void seen.push(m.list()[0]?.status ?? "");
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(2), 0);
    await m.end(b.id);
    await settled(m, b.id);
    expect(seen).toContain("saving");
    expect(seen).toContain("transcribing");
    expect(seen.at(-1)).toBe("done");
  });
});

describe("retry", () => {
  it("refuses a meeting that is done, recording or unknown", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    expect(await m.retry(id)).toMatchObject({ ok: false, failure: { message: GENERIC } });
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    expect((await m.retry(b.id)).ok).toBe(false);
    expect((await m.retry("zzz")).ok).toBe(false);
  });

  it("finishes the spools of a failed save first, and fails again with the reason when they still cannot be finished", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(2), 0);
    t.fs.failOn = /\.wav$/;
    await m.end(b.id);
    expect(await m.retry(b.id)).toMatchObject({ ok: false, failure: { code: "finalise-failed" } });
    expect(m.list()[0]).toMatchObject({ status: "failed", failure: { code: "finalise-failed" } });
    t.fs.failOn = undefined;
    expect(await m.retry(b.id)).toEqual({ ok: true });
    const g = await settled(m, b.id);
    expect(g.status).toBe("done");
    expect(g.audioBytes).toBeGreaterThan(0);
  });
});

describe("restart messages", () => {
  it("says what happened to a meeting that was running or transcribing when the app stopped", async () => {
    const t = setup();
    await t.fs.write(
      "/meetings/manifest.json",
      JSON.stringify({
        v: 1,
        entries: [
          { id: "a", status: "saving", startedAt: 1, endedAt: 500 },
          { id: "b", status: "transcribing", startedAt: 1 },
        ],
      }),
    );
    await t.fs.write("/meetings/a/you.pcm", new Uint8Array(64));
    const m = await t.open();
    const rows = Object.fromEntries(m.list().map((r) => [r.id, r]));
    expect(rows.a).toMatchObject({ status: "interrupted", failure: { code: "interrupted", message: "Speak Kit closed while this meeting was recording. The audio that was saved is kept." } });
    expect(rows.a!.audioBytes).toBeGreaterThan(0);
    expect(rows.b).toMatchObject({ status: "interrupted", failure: { code: "interrupted", message: "Speak Kit closed before the transcript was finished." } });
  });

  it("marks a recording whose spools hold nothing as failed", async () => {
    const t = setup();
    await t.fs.write("/meetings/manifest.json", JSON.stringify({ v: 1, entries: [{ id: "a", status: "recording", startedAt: 1 }] }));
    const m = await t.open();
    expect(m.list()[0]).toMatchObject({ status: "failed", failure: { code: "nothing-recorded" } });
  });
});

describe("notes and text", () => {
  it("regenerates only for a finished meeting with notes on, and adds one more version", async () => {
    const t = setup({ texts: ["a b c", "d e f"], notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good }) }) });
    const m = await t.open();
    const { id } = await record(m, t.c);
    expect((await settled(m, id)).versions).toHaveLength(1);
    expect(await m.regenerateNotes(id)).toEqual({ ok: true });
    expect((await m.get(id))!.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(await m.regenerateNotes("nope")).toMatchObject({ ok: false, failure: { code: "notes-off", message: "Notes are off. Turn on the summary in Meetings settings first." } });
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    expect((await m.regenerateNotes(b.id)).ok).toBe(false);
  });

  it("returns the transcript with or without labels, and applyVocabulary fails for an unknown meeting", async () => {
    const t = setup({ texts: ["hello there", "good morning"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    expect(await m.text(id)).toBe("You 0:00: hello there\nThem 0:00: good morning");
    expect(await m.text(id, false)).toBe("hello there\ngood morning");
    expect(await m.applyVocabulary("nope")).toMatchObject({ ok: false, failure: { message: GENERIC } });
  });

  it("applies new vocabulary to the notes of a meeting and finds it by the new word", async () => {
    let vocab: { from: string; to: string }[] = [];
    const t = setup({ texts: ["wazoo plan", "ok then"], notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good.replace("Release", "Wazoo") }) }), vocabulary: () => vocab });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    vocab = [{ from: "wazoo", to: "Wazuh" }];
    m.vocabularyChanged();
    expect(await m.applyVocabulary(id)).toEqual({ ok: true, changed: 2 });
    expect((await m.get(id))!.title).toBe("Wazuh plan");
    expect(m.list({ search: "wazuh" }).map((r) => r.id)).toEqual([id]);
    expect(m.list({ search: "  wazuh  " }).map((r) => r.id)).toEqual([id]);
  });
});

describe("files", () => {
  it("writes the transcript and a notes file with title, summary and chapters, and says why when it cannot", async () => {
    const t = setup({ texts: ["hello there", "good morning"], notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good }) }) });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    const r = await m.writeFiles(id);
    if (!r.ok) throw new Error();
    expect(r.paths.map((p) => p.replaceAll("\\", "/"))).toEqual(["/out/Release plan.txt", "/out/Release plan notes.txt"]);
    expect(t.fs.text("/out/Release plan.txt")).toBe("You 0:00: hello there\nThem 0:00: good morning");
    expect(t.fs.text("/out/Release plan notes.txt")).toBe("Release plan\n\nThey planned it.\n\nPlan\nhello there good morning\n\nSummary written by GPT.\n");
    t.fs.failOn = /\/out\//;
    expect(await m.writeFiles(id)).toMatchObject({ ok: false });
    expect(await m.writeFiles("nope")).toMatchObject({ ok: false });
  });

  it("names the failure for a file that cannot be written when the error has no message", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    t.fs.write = async () => {
      throw new Error("");
    };
    expect(await m.writeFiles(id)).toEqual({ ok: false, failure: { code: "export-failed", message: "The files could not be written." } });
  });
});

describe("rename, trash and remove", () => {
  it("cuts a title at 200 characters, ignores an unknown meeting and keeps the temporary flag off", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    await m.rename(id, ` ${"x".repeat(250)} `);
    expect((await m.get(id))!.title).toBe("x".repeat(200));
    expect((await m.get(id))!.titleTemporary).toBe(false);
    await m.rename("nope", "Hello");
    expect(m.list()).toHaveLength(1);
  });

  it("puts a trashed meeting out of search and a restored one back", async () => {
    const t = setup({ texts: ["kubernetes plan", "ok then"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    expect(m.list()[0]).toMatchObject({ trashed: false });
    await m.trash(id);
    expect(m.list({ trashed: true })[0]).toMatchObject({ trashed: true });
    await m.restore(id);
    expect(m.list()[0]).toMatchObject({ trashed: false });
    expect(m.list({ search: "kubernetes" })).toHaveLength(1);
    expect(m.list({ trashed: true })).toEqual([]);
  });

  it("removes a meeting that is still transcribing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({ transcribe: async () => (await gate, { ok: true, text: "words", speech: true }) });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await m.remove(id);
    release();
    await m.dispose();
    expect(m.list()).toEqual([]);
    expect([...t.fs.files.keys()].filter((k) => k.includes(id))).toEqual([]);
  });

  it("starts no transcription after dispose", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    await m.dispose();
    const { id } = await record(m, t.c);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls.transcribe).toBe(0);
    expect((await m.get(id))!.status).toBe("transcribing");
  });
});

describe("sweep", () => {
  it("counts what it did, tells the app only then, and leaves a young meeting alone", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    const n = t.calls.changed;
    expect(await m.sweep()).toEqual({ trashed: 0, removed: 0, audioDropped: 0 });
    expect(t.calls.changed).toBe(n);
    t.c.advance(25 * 3_600_000);
    await m.sweep();
    expect(t.calls.changed).toBeGreaterThan(n);
    expect(await m.sweep()).toEqual({ trashed: 0, removed: 0, audioDropped: 0 });
    t.c.advance(31 * 86_400_000);
    expect(await m.sweep()).toEqual({ trashed: 1, removed: 0, audioDropped: 0 });
    expect((await m.get(id))!.trashed).toBe(true);
  });
});

describe("list order and the notice", () => {
  it("orders search results by relevance and reports a newer manifest", async () => {
    const t = setup({ texts: ["pricing pricing pricing", "ok then", "a pricing note", "fine"] });
    const m = await t.open();
    const a = await record(m, t.c);
    await settled(m, a.id);
    t.c.advance(1000);
    const b = await record(m, t.c);
    await settled(m, b.id);
    expect(m.list({ search: "pricing" }).map((r) => r.id)).toEqual([a.id, b.id]);
    expect(m.notice()).toEqual({ newer: false });
    const t2 = setup();
    await t2.fs.write("/meetings/manifest.json", JSON.stringify({ v: 9, entries: [] }));
    expect((await t2.open()).notice()).toEqual({ newer: true });
  });
});
