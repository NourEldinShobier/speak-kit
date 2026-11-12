import { describe, expect, it, vi } from "vite-plus/test";
import path from "node:path";
import { encodeWav16k, type Fs } from "@speakkit/transcripts";
import type { Push } from "../../shared/transcripts/contract";
import { parseConfig } from "../../shared/schemas";
import type { Ctx } from "../context";
import type { Stt } from "../dictation/stt";
import type { MicPort } from "./mic-session";
import { createTranscriptsService, type TranscriptsPorts } from "./service";

const norm = (f: string) => f.replaceAll("\\", "/");
function memFs() {
  const files = new Map<string, Uint8Array>();
  const fs: Fs = {
    read: async (f) => files.get(norm(f))?.slice(),
    write: async (f, d) => void files.set(norm(f), typeof d === "string" ? new TextEncoder().encode(d) : d.slice()),
    append: async (f, d) => void files.set(norm(f), Uint8Array.from([...(files.get(norm(f)) ?? []), ...d])),
    remove: async (f) => void files.delete(norm(f)),
    rename: async (a, b) => (files.set(norm(b), files.get(norm(a))!), void files.delete(norm(a))),
    exists: async (f) => files.has(norm(f)),
  };
  return { fs, files };
}

const tone = (sec: number) => Int16Array.from({ length: sec * 16000 }, (_, i) => Math.round(Math.sin(i / 20) * 5000));

function setup(over: { stt?: Partial<Stt>; busy?: () => boolean; config?: object } = {}) {
  const { fs, files } = memFs();
  const pushes: Push[] = [];
  // The schema hands out one shared default object: a test that changes a setting must not change it for the next.
  const config = structuredClone(parseConfig(over.config ?? {}));
  const activity: string[] = [];
  const ctx = { config, saveConfig: vi.fn(), addActivity: (_k: string, t: string, b: string) => activity.push(`${t}: ${b}`), publish: vi.fn() } as unknown as Ctx;
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
  let chunk: (p: Int16Array) => void = () => {};
  let ended: () => void = () => {};
  const mic: MicPort = { start: async () => ({ ok: true }), stop: async () => {}, onChunk: (cb) => (chunk = cb), onLevel: () => {}, onEnded: (cb) => (ended = cb) };
  const revealed: string[] = [];
  const recycled: string[] = [];
  const clip: string[] = [];
  let pick: string | null = null;
  let dir: string | null = null;
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
    documentsDir: "/docs",
    fs,
    stt,
    model: () => "large-v3-turbo-q5_0",
    modelName: () => ({ name: "Whisper Large v3 Turbo", installed: true }),
    dictationBusy: over.busy ?? (() => false),
    files: files2,
    mic,
    dialog: { pickFile: async () => pick, pickFolder: async () => dir },
    shell: { reveal: (f) => void revealed.push(f), trash: async (f) => void recycled.push(f), openFolder: async (d) => void revealed.push(`open ${d}`) },
    clipboard: { writeText: (t) => void clip.push(t) },
    push: (p) => void pushes.push(p),
    changed: vi.fn(),
    doneMs: 400,
    sleep: () => new Promise((r) => setTimeout(r, 0)),
    newId: () => `id${++n}`,
  });
  return {
    service,
    ctx,
    files,
    pushes,
    ended: () => ended(),
    revealed,
    recycled,
    clip,
    activity,
    chunk: (p: Int16Array) => chunk(p),
    setPick: (f: string | null) => (pick = f),
    setDir: (d: string | null) => (dir = d),
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
    expect(d).toMatchObject({ title: "talk", source: "file", sourceName: "talk.wav", language: "en", durationSec: 5 });
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

  it("rename, trash, restore, remove, empty trash", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    await h.rename(id, "Weekly sync");
    expect((await h.get(id))!.title).toBe("Weekly sync");
    await h.trash(id);
    expect(await h.list()).toEqual([]);
    expect((await h.list({ trashed: true })).map((r) => r.id)).toEqual([id]);
    await h.restore(id);
    expect(await h.list()).toHaveLength(1);
    await h.trash(id);
    expect(await h.emptyTrash()).toBe(1);
    expect(await h.get(id)).toBeNull();
    await h.remove("nope");
  });

  it("copy puts the words on the clipboard; an unknown transcript copies nothing", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    expect(await h.copyText(id)).toBe(true);
    expect(t.clip).toEqual(["hello world"]);
    expect(await h.copyText("nope")).toBe(false);
  });

  it("save writes into the folder, never over a file, and reveal selects the saved file", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    expect(await h.reveal(id, "md")).toBe(false);
    const saved = await h.save(id, "md");
    expect(saved).toMatchObject({ ok: true, kind: "new" });
    const file = (saved as { path: string }).path;
    expect(norm(file)).toBe(norm(path.join("/docs", "Speak Kit", "Transcripts", "talk.md")));
    t.files.set(norm(file), new TextEncoder().encode("edited by me"));
    expect(await h.save(id, "md")).toMatchObject({ ok: true, kind: "copy" });
    expect(new TextDecoder().decode(t.files.get(norm(file)))).toBe("edited by me");
    expect(await h.reveal(id, "txt")).toBe(false);
    expect(await h.reveal(id, "md")).toBe(true);
    expect(t.revealed).toHaveLength(1);
    expect(await h.save("nope", "md")).toMatchObject({ ok: false });
  });

  it("settings show the model, the folder and the storage; a patch is saved and applied", async () => {
    const t = setup();
    const h = t.service.handlers;
    const s = await h.settings();
    expect(s).toMatchObject({ model: { name: "Whisper Large v3 Turbo", installed: true }, storage: { count: 0, audioBytes: 0, trashed: 0 }, notice: { newer: false }, supported: true });
    expect(norm(s.folder)).toBe(norm(path.join("/docs", "Speak Kit", "Transcripts")));
    const after = await h.patchSettings({ textDays: 90, keepAudio: false });
    expect(after.config).toMatchObject({ textDays: 90, keepAudio: false });
    expect(t.ctx.saveConfig).toHaveBeenCalled();
    t.setDir(null);
    expect(await h.chooseFolder()).toBeNull();
    t.setDir("/elsewhere");
    expect((await h.chooseFolder())!.folder).toBe("/elsewhere");
    await h.openFolder();
    expect(t.revealed).toContain("open /elsewhere");
  });

  it("delete audio of one recording and of all", async () => {
    const t = setup();
    const h = t.service.handlers;
    const r = await h.recordStart();
    expect(r.ok).toBe(true);
    t.chunk(tone(2));
    await vi.waitFor(async () => expect((await h.push()).recording!.seconds).toBe(2));
    expect((await h.recordStop()).ok).toBe(true);
    const id = (await h.list())[0]!.id;
    await done(h, id);
    expect((await h.settings()).storage.audioBytes).toBeGreaterThan(0);
    await h.deleteAudio(id);
    expect((await h.settings()).storage.audioBytes).toBe(0);
    expect(await h.deleteAllAudio()).toBe(0);
  });

  it("deleting a transcript for good sends its export to the Recycle Bin through the shell port", async () => {
    const t = setup();
    const h = t.service.handlers;
    const id = ((await h.importFile({ path: "/in/talk.wav", language: "auto" })) as { id: string }).id;
    await done(h, id);
    const saved = (await h.save(id, "md")) as { path: string };
    await h.trash(id);
    await h.remove(id);
    expect(t.recycled).toEqual([saved.path]);
  });

  it("the tray phase follows the recorder and the job", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const t = setup({ stt: { transcribe: async () => (await hold, { text: "x", speech: true }) } });
    const h = t.service.handlers;
    expect(t.service.phase()).toBe("ready");
    await h.recordStart();
    expect(t.service.phase()).toBe("recording");
    t.chunk(tone(2));
    await vi.waitFor(async () => expect((await h.push()).recording!.seconds).toBe(2));
    const stopping = h.recordStop();
    await vi.waitFor(() => expect(["saving", "transcribing"]).toContain(t.service.phase()));
    await stopping;
    await vi.waitFor(() => expect(t.service.phase()).toBe("transcribing"));
    release();
    await vi.waitFor(() => expect(t.service.phase()).toBe("done"));
    await vi.waitFor(() => expect(t.service.phase()).toBe("ready"));
  });

  it("a recording that ends by itself leaves a notice in the push and the bell, and is kept", async () => {
    const t = setup();
    const h = t.service.handlers;
    await h.recordStart();
    t.chunk(tone(2));
    await vi.waitFor(async () => expect((await h.push()).recording!.seconds).toBe(2));
    t.ended();
    await vi.waitFor(async () => expect((await h.push()).notice).toBe("The microphone was disconnected. What was recorded is saved."));
    expect((await h.push()).recording).toBeNull();
    expect(t.activity).toEqual(["Recording stopped: The microphone was disconnected. What was recorded is saved."]);
    expect(await h.list()).toHaveLength(1);
    await h.recordStart(); // starting again clears the notice
    expect((await h.push()).notice).toBeUndefined();
  });

  it("dispose while recording saves the recording", async () => {
    const t = setup();
    const h = t.service.handlers;
    await h.recordStart();
    t.chunk(tone(3));
    await vi.waitFor(async () => expect((await h.push()).recording!.seconds).toBe(3));
    await t.service.dispose();
    const rows = await (await t.service.core).list();
    expect(rows).toHaveLength(1);
    expect(["queued", "interrupted", "transcribing"]).toContain(rows[0]!.status);
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
