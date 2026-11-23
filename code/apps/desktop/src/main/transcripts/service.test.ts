import { describe, expect, it, vi } from "vite-plus/test";
import { encodeWav16k, type Fs, type Summarise } from "@speakkit/transcripts";
import type { Push } from "../../shared/transcripts/contract";
import { parseConfig } from "../../shared/schemas";
import type { Ctx } from "../context";
import type { Stt } from "../dictation/stt";
import { createTranscriptsService, type TranscriptsPorts } from "./service";

const norm = (f: string) => f.replaceAll("\\", "/");
function memFs() {
  const files = new Map<string, Uint8Array>();
  const fs: Fs = {
    read: async (f) => files.get(norm(f))?.slice(),
    write: async (f, d) => void files.set(norm(f), typeof d === "string" ? new TextEncoder().encode(d) : d.slice()),
    remove: async (f) => void files.delete(norm(f)),
    rename: async (a, b) => (files.set(norm(b), files.get(norm(a))!), void files.delete(norm(a))),
    exists: async (f) => files.has(norm(f)),
  };
  return { fs };
}

const tone = (sec: number) => Int16Array.from({ length: sec * 16000 }, (_, i) => Math.round(Math.sin(i / 20) * 5000));

function setup(over: { stt?: Partial<Stt>; busy?: () => boolean; config?: object; notes?: () => Summarise | undefined } = {}) {
  const { fs } = memFs();
  const pushes: Push[] = [];
  // The schema hands out one shared default object: a test that changes a setting must not change it for the next.
  const config = structuredClone(parseConfig(over.config ?? {}));
  const ctx = { config, saveConfig: vi.fn() } as unknown as Ctx;
  let state = "ready";
  const stt: Stt = {
    status: () => ({ state }),
    onStatus: () => () => {},
    downloaded: async () => true,
    load: async () => {},
    warm: async () => void (state = "ready"),
    transcribe: async () => ({ text: "hello world", speech: true }),
    unload: async () => {},
    ...over.stt,
  };
  const recycled: string[] = [];
  const clip: string[] = [];
  let pick: string | null = null;
  const wavs: Record<string, Uint8Array> = {
    "/in/talk.wav": encodeWav16k(tone(5)),
    "/in/big.mp3": new TextEncoder().encode("ID3\x04".padEnd(32, "\0")),
    "/in/notes.txt": new TextEncoder().encode("just words, not audio"),
  };
  const files2: TranscriptsPorts["files"] = {
    stat: async (f) => (wavs[f] ? { size: wavs[f]!.length } : undefined),
    head: async (f, n) => wavs[f]!.subarray(0, n),
    read: async (f) => wavs[f]!,
    decodeInPage: async () => ({ ok: true, pcm: tone(2) }),
    pause: async () => {},
  };
  let n = 0;
  const service = createTranscriptsService(ctx, {
    dataDir: "/data",
    fs,
    stt,
    model: () => "large-v3-turbo-q5_0",
    modelName: () => ({ name: "Whisper Large v3 Turbo", installed: true }),
    dictationBusy: over.busy ?? (() => false),
    ...(over.notes && { notes: over.notes }),
    files: files2,
    dialog: { pickFile: async () => pick },
    shell: { trash: async (f) => void recycled.push(f) },
    clipboard: { writeText: (t) => void clip.push(t) },
    push: (p) => void pushes.push(p),
    sleep: () => new Promise((r) => setTimeout(r, 0)),
    newId: () => `id${++n}`,
  });
  return {
    service,
    ctx,
    pushes,
    recycled,
    clip,
    setPick: (f: string | null) => (pick = f),
    config,
  };
}
const done = async (h: ReturnType<typeof setup>["service"]["handlers"], id: string) => vi.waitFor(async () => expect((await h.get(id))!.status).toBe("done"));

describe("transcripts service", () => {
  it("imports a WAVE file, transcribes it and lists it", async () => {
    const t = setup();
    const r = await t.service.handlers.importFile({ path: "/in/talk.wav", language: "en" });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    await done(t.service.handlers, id);
    const d = (await t.service.handlers.get(id))!;
    expect(d).toMatchObject({ title: "talk", sourceName: "talk.wav", language: "en", durationSec: 5 });
    expect(d.segments).toEqual([{ start: 0, end: 5, text: "hello world" }]);
    expect((await t.service.handlers.list()).map((x) => x.id)).toEqual([id]);
    expect((await t.service.handlers.list({ search: "hello" })).map((x) => x.id)).toEqual([id]);
    expect(t.pushes.at(-1)!.tick).toBeGreaterThan(0);
  });

  it("a compressed file goes through the decoder page", async () => {
    const t = setup();
    const r = await t.service.handlers.importFile({ path: "/in/big.mp3", language: "auto" });
    expect(r.ok).toBe(true);
    await done(t.service.handlers, (r as { id: string }).id);
  });

  it("a file that is not audio is refused with the formats that work; nothing is stored", async () => {
    const t = setup();
    const r = await t.service.handlers.importFile({ path: "/in/notes.txt", language: "auto" });
    expect(r).toMatchObject({ ok: false, failure: { code: "unsupported" } });
    expect(await t.service.handlers.list()).toEqual([]);
    expect(await t.service.handlers.checkFile("/in/notes.txt")).toMatchObject({ ok: false, name: "notes.txt" });
    expect(await t.service.handlers.checkFile("/in/talk.wav")).toMatchObject({ ok: true, name: "talk.wav" });
  });

  it("the file chooser answer is checked; closing it gives null", async () => {
    const t = setup();
    expect(await t.service.handlers.pickFile()).toBeNull();
    t.setPick("/in/talk.wav");
    expect(await t.service.handlers.pickFile()).toMatchObject({ ok: true, path: "/in/talk.wav" });
  });

  it("a missing speech model fails the import's job with its message", async () => {
    const t = setup({ stt: { status: () => ({ state: "unloaded" }), downloaded: async () => false } });
    const r = await t.service.handlers.importFile({ path: "/in/talk.wav", language: "auto" });
    const id = (r as { id: string }).id;
    await vi.waitFor(async () => expect((await t.service.handlers.get(id))!.status).toBe("failed"));
    expect((await t.service.handlers.get(id))!.failure!.code).toBe("engine-missing");
  });

  it("rename and remove", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    await h.rename(id, "Weekly sync");
    expect((await h.get(id))!.title).toBe("Weekly sync");
    await h.remove(id);
    expect(await h.list()).toEqual([]);
    expect(await h.get(id)).toBeNull();
    await h.remove("nope");
  });

  it("Copy section copies only the words said inside the chapter", async () => {
    const t = setup({ stt: { transcribe: async () => ({ text: "alpha beta", speech: true }) } });
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    expect(await h.copyText(id, { from: 0, to: 0.5 })).toBe(true);
    expect(t.clip.at(-1)).toBe("alpha beta");
    expect(await h.copyText(id, { from: 100, to: 200 })).toBe(false);
    expect(await h.copyText("nope", { from: 0, to: 1 })).toBe(false);
    expect(t.clip).toEqual(["alpha beta"]);
  });

  it("writes notes through the handler and keeps the transcript when the writer fails", async () => {
    let fail = true;
    const t = setup({
      notes: () => async () =>
        fail ? { ok: false, failure: { code: "x", message: "OpenAI is busy. The transcript is unchanged." } } : { ok: true, writer: "W", notes: { title: "T", summary: "One. Two.", chapters: [] } },
    });
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    await vi.waitFor(async () => expect((await h.get(id))!.notes?.state).toBe("failed"));
    expect((await h.get(id))!.segments[0]!.text).toBe("hello world");
    fail = false;
    expect(await h.writeNotes(id)).toEqual({ ok: true });
    expect((await h.get(id))!.notes).toMatchObject({ state: "ready", doc: { title: "T", writer: "W" } });
  });

  it("settings show the model and the storage; a patch is saved and applied", async () => {
    const t = setup();
    const h = t.service.handlers;
    expect(await h.settings()).toEqual({
      config: { language: "auto", notes: false },
      model: { name: "Whisper Large v3 Turbo", installed: true },
      storage: { count: 0, audioBytes: 0 },
      notice: { newer: false },
      supported: true,
    });
    const after = await h.patchSettings({ language: "de", notes: true });
    expect(after.config).toEqual({ language: "de", notes: true });
    expect(t.ctx.saveConfig).toHaveBeenCalled();
  });

  it("delete audio of one unfinished import and of all", async () => {
    const t = setup({ stt: { status: () => ({ state: "unloaded" }), downloaded: async () => false } });
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await vi.waitFor(async () => expect((await h.get(id))!.status).toBe("failed"));
    expect((await h.settings()).storage.audioBytes).toBeGreaterThan(0);
    await h.deleteAudio(id);
    expect((await h.settings()).storage.audioBytes).toBe(0);
    expect(await h.deleteAllAudio()).toBe(0);
  });

  it("deleting a transcript for good sends its audio to the Recycle Bin through the shell port", async () => {
    const t = setup({ stt: { status: () => ({ state: "unloaded" }), downloaded: async () => false } });
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await vi.waitFor(async () => expect((await h.get(id))!.status).toBe("failed"));
    await h.remove(id);
    expect(t.recycled.map(norm)).toEqual([`/data/transcripts/audio/${id}.wav`]);
  });

  it("every change pushes a new tick to the window", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    const ticks = t.pushes.map((p) => p.tick);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(await h.push()).toEqual({ tick: ticks.at(-1) });
  });

  it("dictation busy: nothing is transcribed until it is idle", async () => {
    let busy = true;
    const transcribe = vi.fn(async () => ({ text: "x", speech: true }));
    const t = setup({ busy: () => busy, stt: { transcribe } });
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await new Promise((r) => setTimeout(r, 50));
    expect(transcribe).not.toHaveBeenCalled();
    busy = false;
    await done(h, id);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});
