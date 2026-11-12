import { describe, expect, it } from "vitest";
import { createMeetings, DEFAULT_RETENTION, type Meetings, type MeetingsDeps } from "../src";
import { MemFs, clock, tone } from "./fakes";

const HOUR = 3_600_000;

function setup(o: Partial<MeetingsDeps> & { texts?: string[] } = {}) {
  const fs = (o as { fs?: MemFs }).fs ?? new MemFs();
  const c = clock(new Date(2026, 10, 3, 14, 5).getTime());
  const texts = o.texts ?? [];
  const calls = { changed: 0, transcribe: 0 };
  let n = 0;
  const deps: MeetingsDeps = {
    dir: "/meetings",
    fs,
    now: c.now,
    newId: () => `m${++n}`,
    sleep: c.sleep,
    transcribe: async () => {
      calls.transcribe++;
      const text = texts.shift();
      return text === undefined ? { ok: false, code: "failed" } : { ok: true, text, speech: true };
    },
    busy: () => false,
    retention: () => DEFAULT_RETENTION,
    notes: () => undefined,
    vocabulary: () => [],
    language: () => "en",
    headphones: () => false,
    exportDir: () => "/out",
    changed: () => calls.changed++,
    ...o,
  };
  return { fs, c, calls, deps, open: () => createMeetings(deps) };
}

async function record(m: Meetings, c: ReturnType<typeof clock>, secs = 3) {
  const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
  if (!b.ok) throw new Error("begin");
  await m.append(b.id, "you", tone(secs), 0);
  await m.append(b.id, "them", tone(secs), 0);
  c.advance(secs * 1000);
  const e = await m.end(b.id);
  return { id: b.id, e };
}

const settled = async (m: Meetings, id: string, until: (s: string) => boolean = (s) => s === "done" || s === "failed" || s === "interrupted") => {
  for (let i = 0; i < 200; i++) {
    const g = (await m.get(id))!;
    if (until(g.status) && g.notes.state !== "writing") return g;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("did not settle");
};

describe("a meeting from start to transcript", () => {
  it("starts with the app and the start time as the title", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    const row = m.list()[0]!;
    expect(row).toMatchObject({ id: b.ok && b.id, title: "Zoom · 14:05", titleTemporary: true, status: "recording", providerName: "Zoom" });
  });

  it("records two tracks, transcribes them as You and Them in time order, and emits one finished event", async () => {
    const t = setup({ texts: ["I will send the file", "Great thanks for the update"] });
    const m = await t.open();
    const { id, e } = await record(m, t.c);
    expect(e).toEqual({ ok: true, id });
    const g = await settled(m, id);
    expect(g.status).toBe("done");
    expect(g.lines.map((l) => [l.who, l.text])).toEqual([
      ["You", "I will send the file"],
      ["Them", "Great thanks for the update"],
    ]);
    expect(g.durationSec).toBe(3);
    expect(g.audio).toBe("Audio removed in 24 h");
    expect(m.since(0).events.map((x) => [x.meetingId, x.title, x.durationSec])).toEqual([[id, "Zoom · 14:05", 3]]);
  });

  it("drops the You line that is the Them line coming back through the speakers, unless headphones are on", async () => {
    const t = setup({ texts: ["we ship the release on friday", "we ship the release on Friday"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    expect((await settled(m, id)).lines.map((l) => l.who)).toEqual(["Them"]);
    const h = setup({ texts: ["we ship the release on friday", "we ship the release on Friday"], headphones: () => true });
    const m2 = await h.open();
    const r = await record(m2, h.c);
    expect((await settled(m2, r.id)).lines.map((l) => l.who).sort()).toEqual(["Them", "You"]);
  });

  it("discards a silent track without asking the engine, and an invented credit line", async () => {
    const t = setup({ texts: ["Thanks for watching!"] });
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(3, 0), 0);
    await m.append(b.id, "them", tone(3), 0);
    t.c.advance(3000);
    await m.end(b.id);
    const g = await settled(m, b.id);
    expect(g.lines).toEqual([]);
    expect(t.calls.transcribe).toBe(1);
    expect(g.status).toBe("done");
  });

  it("fails a recording with no audio and keeps it deletable", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    const e = await m.end(b.id);
    expect(e).toMatchObject({ ok: false, failure: { code: "nothing-recorded" } });
    expect(m.list()[0]).toMatchObject({ status: "failed", failure: { code: "nothing-recorded" } });
    await m.remove(b.id);
    expect(m.list()).toEqual([]);
  });

  it("keeps the spool and fails the meeting when the audio cannot be finished; delete removes everything", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(2), 0);
    t.fs.failOn = /\.wav$/;
    const e = await m.end(b.id);
    expect(e).toMatchObject({ ok: false, failure: { code: "finalise-failed" } });
    t.fs.failOn = undefined;
    expect(m.list()[0]).toMatchObject({ status: "failed" });
    expect(t.fs.files.has(`/meetings/${b.id}/you.pcm`)).toBe(true);
    await m.remove(b.id);
    expect([...t.fs.files.keys()].filter((k) => k.includes(b.id))).toEqual([]);
  });

  it("keeps a meeting listed when its files could not be deleted, so deleting again works", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(2), 0);
    await m.end(b.id);
    await settled(m, b.id);
    t.fs.failRemove = /you\.pcm|you\.wav|transcript/;
    await expect(m.remove(b.id)).rejects.toThrow();
    expect(m.list().map((r) => r.id)).toEqual([b.id]);
    t.fs.failRemove = undefined;
    await m.remove(b.id);
    expect(m.list()).toEqual([]);
    expect([...t.fs.files.keys()].filter((k) => k.includes(b.id))).toEqual([]);
  });

  it("refuses to delete a meeting that is still being recorded unless its recording gives up", async () => {
    const t = setup();
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.remove(b.id);
    expect(m.list()).toHaveLength(1);
    await m.remove(b.id, { abandon: true });
    expect(m.list()).toEqual([]);
  });

  it("answers a repeated or unknown end with a failure, not a crash", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    expect(await m.end(id)).toMatchObject({ ok: false });
    expect(await m.end("nope")).toMatchObject({ ok: false });
    expect(await m.append("nope", "you", tone(1), 0)).toMatchObject({ ok: false });
  });

  it("a failed transcription is retried from the saved audio", async () => {
    const t = setup({ texts: [] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    expect((await settled(m, id)).status).toBe("failed");
    let n = 0;
    t.deps.transcribe = async () => ({ ok: true, text: ["hello from the second try", "something else entirely now"][n++ % 2]!, speech: true });
    expect(await m.retry(id)).toEqual({ ok: true });
    expect((await settled(m, id)).lines.length).toBe(2);
  });

  it("an engine that is missing says so and the audio stays", async () => {
    const t = setup({ transcribe: async () => ({ ok: false, code: "engine-missing" }) });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const g = await settled(m, id);
    expect(g).toMatchObject({ status: "failed", failure: { code: "engine-missing" } });
    expect(g.audioBytes).toBeGreaterThan(0);
  });
});

describe("restart", () => {
  it("turns a recording that was running into an interrupted meeting with its audio, then Try again works", async () => {
    const t = setup({ texts: [] });
    const m = await t.open();
    const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
    if (!b.ok) throw new Error();
    await m.append(b.id, "you", tone(2), 0);
    const t2 = setup({ fs: t.fs as never, texts: ["words here today"] });
    t2.deps.newId = () => "x";
    const m2 = await t2.open();
    expect(m2.list()[0]).toMatchObject({ status: "interrupted", failure: { code: "interrupted" } });
    expect(m2.list()[0]!.audioBytes).toBeGreaterThan(0);
    expect(await m2.retry(b.id)).toEqual({ ok: true });
    expect((await settled(m2, b.id)).status).toBe("done");
  });

  it("a meeting left transcribing becomes interrupted", async () => {
    const t = setup();
    await t.fs.write("/meetings/manifest.json", JSON.stringify({ v: 1, entries: [{ id: "a", status: "transcribing", startedAt: 1 }] }));
    const m = await t.open();
    expect(m.list()[0]).toMatchObject({ status: "interrupted" });
  });
});

describe("notes", () => {
  const good = JSON.stringify({ title: "Release plan", summary: "They planned it. They shipped it.", chapters: [{ start: 0, title: "Plan" }] });

  it("stays off without the opt-in: the temporary title stays", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const g = await settled(m, id);
    expect(g).toMatchObject({ title: "Zoom · 14:05", titleTemporary: true, notes: { state: "off" }, versions: [] });
  });

  it("writes the notes, names the meeting, and keeps the raw transcript untouched by vocabulary", async () => {
    const t = setup({
      texts: ["wazoo plan", "ok wazoo"],
      notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good.replace("Release plan", "Wazoo plan") }) }),
      vocabulary: () => [{ from: "wazoo", to: "Wazuh" }],
    });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const g = await settled(m, id);
    expect(g).toMatchObject({ title: "Wazuh plan", titleTemporary: false, notes: { state: "done", chapters: 1 } });
    expect(g.versions.map((v) => [v.kind, v.title])).toEqual([
      ["summary", "Wazoo plan"],
      ["vocabulary", "Wazuh plan"],
    ]);
    expect(g.lines.map((l) => l.text).sort()).toEqual(["ok wazoo", "wazoo plan"]);
  });

  it("a failed notes pass leaves transcript and audio as they are and can be regenerated", async () => {
    let ok = false;
    const t = setup({ texts: ["a b c", "d e f"], notes: () => ({ writer: "GPT", complete: async () => (ok ? { ok: true, text: good } : { ok: false, code: "offline" }) }) });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const g = await settled(m, id);
    expect(g).toMatchObject({ status: "done", notes: { state: "failed", failure: { code: "offline" } }, titleTemporary: true });
    expect(g.lines).toHaveLength(2);
    expect(g.audioBytes).toBeGreaterThan(0);
    ok = true;
    expect(await m.regenerateNotes(id)).toEqual({ ok: true });
    expect(await settled(m, id)).toMatchObject({ title: "Release plan", notes: { state: "done" } });
  });

  it("refuses to regenerate while notes are off", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    expect(await m.regenerateNotes(id)).toMatchObject({ ok: false, failure: { code: "notes-off" } });
  });

  it("applying the vocabulary again adds a version only when something changed", async () => {
    const vocab = [{ from: "wazoo", to: "Wazuh" }];
    const t = setup({ texts: ["a b c", "d e f"], notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good.replace("Plan", "Wazoo") }) }), vocabulary: () => vocab });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const before = (await settled(m, id)).versions.length;
    expect(await m.applyVocabulary(id)).toEqual({ ok: true, changed: 0 });
    expect((await m.get(id))!.versions).toHaveLength(before);
  });
});

describe("the notes file after the vocabulary was applied", () => {
  it("still names the model that wrote the summary, never Vocabulary", async () => {
    const good = JSON.stringify({ title: "Release plan", summary: "They planned it. They shipped it.", chapters: [{ start: 0, title: "Plan" }] });
    const vocab = [{ from: "wazoo", to: "Wazuh" }];
    const t = setup({ texts: ["a b c", "d e f"], notes: () => ({ writer: "GPT", complete: async () => ({ ok: true, text: good.replace("Plan", "Wazoo") }) }), vocabulary: () => vocab });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    expect((await m.get(id))!.versions.at(-1)!.kind).toBe("vocabulary");
    const r = await m.writeFiles(id);
    if (!r.ok) throw new Error();
    const text = t.fs.text(r.paths[1]!)!;
    expect(text).toContain("Wazuh");
    expect(text.endsWith("Summary written by GPT.\n")).toBe(true);
  });
});

describe("list, search, copy and files", () => {
  async function two() {
    const t = setup({ texts: ["kubernetes migration plan", "sounds good to me", "pricing feedback today", "thanks for the call"] });
    const m = await t.open();
    const a = await record(m, t.c);
    await settled(m, a.id);
    t.c.advance(1000);
    await m.rename(a.id, "Weekly planning");
    const b = await record(m, t.c);
    await settled(m, b.id);
    return { t, m, a: a.id, b: b.id };
  }

  it("lists newest first and searches title and words", async () => {
    const { m, a, b } = await two();
    expect(m.list().map((r) => r.id)).toEqual([b, a]);
    expect(m.list({ search: "kubernetes" }).map((r) => r.id)).toEqual([a]);
    expect(m.list({ search: "planning" }).map((r) => r.id)).toEqual([a]);
    expect(m.list({ search: "kubernetes" })[0]!.snippet).toContain("kubernetes");
    expect(m.list({ search: "nothing here" })).toEqual([]);
    expect(m.highlights("kubernetes plan", "kube")).toEqual([{ from: 0, to: 10 }]);
  });

  it("copy new returns each line once", async () => {
    const { m, a } = await two();
    const first = await m.copyNew(a);
    expect(first).toContain("Them 0:00: sounds good to me");
    expect(first).toContain("You 0:00: kubernetes migration plan");
    expect(await m.copyNew(a)).toBe("");
    expect(await m.text("nope")).toBeUndefined();
  });

  it("writes files with clean names, never over an existing file, and records them", async () => {
    const { m, a, t } = await two();
    await m.rename(a, 'Q4: plan/"review"?');
    const one = await m.writeFiles(a);
    const two2 = await m.writeFiles(a);
    const norm = (r: typeof one) => (r.ok ? r.paths.map((p) => p.replaceAll("\\", "/")) : r);
    expect(norm(one)).toEqual(["/out/Q4 plan review.txt"]);
    expect(norm(two2)).toEqual(["/out/Q4 plan review (2).txt"]);
    expect(t.fs.files.has("/out/Q4 plan review.txt")).toBe(true);
    expect((await m.get(a))!.files.map((p) => p.replaceAll("\\", "/"))).toEqual(["/out/Q4 plan review (2).txt"]);
  });

  it("moves to the Trash, restores, and removes", async () => {
    const { m, a } = await two();
    await m.trash(a);
    expect(m.list().map((r) => r.id)).not.toContain(a);
    expect(m.list({ trashed: true }).map((r) => r.id)).toEqual([a]);
    expect(m.list({ search: "kubernetes" })).toEqual([]);
    await m.restore(a);
    expect(m.list({ search: "kubernetes" }).map((r) => r.id)).toEqual([a]);
    await m.remove(a);
    expect(await m.get(a)).toBeUndefined();
  });

  it("an empty title keeps the old one", async () => {
    const { m, a } = await two();
    await m.rename(a, "   ");
    expect((await m.get(a))!.title).toBe("Weekly planning");
  });
});

describe("retention sweep", () => {
  it("removes audio after 24 h, trashes text after 30 days and deletes from the Trash, without losing a change made meanwhile", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    t.c.advance(25 * HOUR);
    expect(await m.sweep()).toEqual({ trashed: 0, removed: 0, audioDropped: 1 });
    const g = (await m.get(id))!;
    expect(g.audio).toBe("Audio removed");
    expect(g.audioBytes).toBe(0);
    expect([...t.fs.files.keys()].some((k) => k.endsWith(".wav"))).toBe(false);
    expect(g.lines).toHaveLength(2);
    t.c.advance(31 * 24 * HOUR);
    const rename = m.rename(id, "Renamed");
    const sweep = m.sweep();
    await Promise.all([rename, sweep]);
    expect(m.list({ trashed: true })[0]).toMatchObject({ id, title: "Renamed" });
    t.c.advance(31 * 24 * HOUR);
    expect(await m.sweep()).toEqual({ trashed: 0, removed: 1, audioDropped: 0 });
    expect(m.list({ trashed: true })).toEqual([]);
  });
});

describe("finished events", () => {
  it("lets a consumer that missed the event catch up with since and confirm it", async () => {
    const t = setup({ texts: ["a b c", "d e f"] });
    const m = await t.open();
    const { id } = await record(m, t.c);
    await settled(m, id);
    const after = m.since(0);
    expect(after.events).toHaveLength(1);
    expect(m.since(after.latest).events).toEqual([]);
    await m.ack("cli", after.latest);
    const reopened = await setup({ fs: t.fs as never }).open();
    expect(reopened.since(after.latest - 1).events.map((e) => e.meetingId)).toEqual([id]);
  });
});

describe("dictation goes first", () => {
  it("waits while dictation uses the engine", async () => {
    let busy = true;
    const t = setup({
      texts: ["a b c", "d e f"],
      busy: () => busy,
      sleep: async () => {
        busy = false;
      },
    });
    const m = await t.open();
    const { id } = await record(m, t.c);
    expect((await settled(m, id)).status).toBe("done");
  });

  it("stops a chunk already running when dictation starts, and runs it again afterwards", async () => {
    let busy = false;
    let calls = 0;
    const t = setup({
      texts: ["unused"],
      busy: () => busy,
      transcribe: async (_p, _l, signal) => {
        if (++calls === 1) {
          busy = true;
          await new Promise((r) => signal.addEventListener("abort", r, { once: true }));
          setTimeout(() => (busy = false), 20);
          throw signal.reason;
        }
        return { ok: true, text: "said it", speech: true };
      },
    });
    const m = await t.open();
    const { id } = await record(m, t.c);
    const g = await settled(m, id);
    expect(g.status).toBe("done");
    expect(g.lines.map((l) => l.text)).toEqual(["said it", "said it"]);
    expect(calls).toBe(3);
  });
});
