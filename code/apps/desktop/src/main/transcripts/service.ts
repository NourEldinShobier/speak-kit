import path from "node:path";
import { createTranscripts, nodeFs, plainText, type Detail, type Format, type Fs, type Outcome, type Transcripts } from "@speakkit/transcripts";
import type { Picked, Push, RecordingView, SavedFile, SettingsView, TranscriptsBridge } from "../../shared/transcripts/contract";
import { policyOf, type TranscriptsPatch } from "../../shared/transcripts/settings";
import type { Ctx } from "../context";
import { decodeFile, inspectFile, type FilePorts } from "./decode";
import { chunkEngine } from "./engine";
import { RecordingSession, type MicPort } from "./mic-session";
import type { Stt } from "../dictation/stt";
import type { DictationModelId } from "../../shared/dictation/settings";

/** What the service needs from Electron and the rest of the app, so tests can stand in for each. */
export interface TranscriptsPorts {
  dataDir: string;
  /** Documents folder: the default home of exports is `Speak Kit/Transcripts` inside it. */
  documentsDir: string;
  fs?: Fs;
  stt: Stt;
  model(): DictationModelId;
  modelName(): { name: string; installed: boolean };
  /** Dictation is recording or transcribing. */
  dictationBusy(): boolean;
  files: Omit<FilePorts, "decodeInPage"> & { decodeInPage: FilePorts["decodeInPage"] };
  mic: MicPort;
  dialog: { pickFile(): Promise<string | null>; pickFolder(): Promise<string | null> };
  shell: { reveal(file: string): void; openFolder(dir: string): Promise<void> };
  clipboard: { writeText(text: string): void };
  /** Tells the windows to redraw. */
  push(p: Push): void;
  /** The tray follows the recorder and the jobs. */
  changed(): void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
}

export type TrayPhase = "ready" | "starting" | "recording" | "saving" | "transcribing";

type Handlers = Omit<TranscriptsBridge, "onPush" | "pathOf" | "decoder" | "mic">;

export interface TranscriptsService {
  handlers: Handlers;
  core: Promise<Transcripts>;
  /** What the tray item shows. */
  phase(): TrayPhase;
  stopRecording(): Promise<Outcome<{ id: string }>>;
  startRecording(): Promise<Outcome<{ id: string }>>;
  dispose(): Promise<void>;
}

const HOUR = 3_600_000;

export function createTranscriptsService(ctx: Ctx, p: TranscriptsPorts): TranscriptsService {
  const cfg = () => ctx.config.transcripts;
  const folder = () => cfg().folder || path.join(p.documentsDir, "Speak Kit", "Transcripts");
  let tick = 0;
  let recording: RecordingView | null = null;
  let notice: string | undefined;
  let lastSend = 0;
  const send = () => {
    lastSend = Date.now();
    p.push({ recording, tick, ...(notice && { notice }) });
    p.changed();
  };
  let busy = false;
  let facade: Transcripts | undefined;
  const changed = () => {
    tick++;
    busy = !!facade && facade.list().some((r) => r.status === "queued" || r.status === "transcribing");
    send();
  };

  const core = createTranscripts({
    dir: `${p.dataDir}/transcripts`,
    fs: p.fs ?? nodeFs(),
    now: p.now ?? Date.now,
    newId: p.newId ?? (() => crypto.randomUUID()),
    transcribe: chunkEngine({ stt: p.stt, model: p.model }),
    busy: p.dictationBusy,
    sleep: p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    model: p.model,
    policy: () => policyOf(cfg()),
    exportDir: folder,
    changed,
  });
  const ready = core.then((t) => t.ready.then(() => (facade = t)));
  const session = core.then(
    (t) =>
      new RecordingSession({
        mic: p.mic,
        transcripts: t,
        language: () => cfg().language,
        now: p.now ?? Date.now,
        changed: (v) => {
          recording = v;
          // Level updates arrive many times a second; the window gets about ten.
          if (!v || Date.now() - lastSend > 100 || v.phase !== "recording") send();
        },
        notice: (text) => {
          notice = text;
          ctx.addActivity("error", "Recording stopped", text);
          ctx.publish();
          send();
        },
      }),
  );
  const sweepTimer = setInterval(() => void core.then((t) => t.sweep()), HOUR);
  sweepTimer.unref();

  const picked = async (file: string): Promise<Picked> => inspectFile(file, p.files);
  const settings = async (): Promise<SettingsView> => {
    const t = await ready;
    const n = t.notice();
    return { config: { ...cfg() }, folder: folder(), model: p.modelName(), storage: t.storage(), notice: { newer: n.newer, ...(n.recoveredFrom && { recoveredFrom: n.recoveredFrom }) }, supported: true };
  };
  const exportFile = async (id: string, format: Format) => (await (await ready).get(id))?.exports.find((f) => f.path.toLowerCase().endsWith(`.${format}`));

  const handlers: Handlers = {
    async list(q) {
      return (await ready).list(q ?? {});
    },
    async get(id): Promise<Detail | null> {
      return (await (await ready).get(id)) ?? null;
    },
    async pickFile() {
      const file = await p.dialog.pickFile();
      return file ? picked(file) : null;
    },
    checkFile: picked,
    async importFile({ path, language }) {
      const t = await ready;
      const d = await decodeFile(path, p.files);
      if (!d.ok) return { ok: false, failure: d.failure };
      return t.importAudio({ name: d.name, pcm: d.pcm, language });
    },
    async cancel(id) {
      await (await ready).cancel(id);
    },
    async resume(id) {
      return (await ready).resume(id);
    },
    async rename(id, title) {
      await (await ready).rename(id, title);
    },
    async trash(id) {
      await (await ready).trash(id);
    },
    async restore(id) {
      await (await ready).restore(id);
    },
    async remove(id) {
      await (await ready).remove(id);
    },
    async emptyTrash() {
      return (await ready).emptyTrash();
    },
    async copyText(id) {
      const d = await (await ready).get(id);
      if (!d) return false;
      p.clipboard.writeText(plainText(d.segments));
      return true;
    },
    async save(id, format): Promise<Outcome<SavedFile>> {
      const r = await (await ready).save(id, format);
      return r.ok ? { ok: true, path: r.path, kind: r.kind } : r;
    },
    async reveal(id, format) {
      const f = await exportFile(id, format);
      if (!f) return false;
      p.shell.reveal(f.path);
      return true;
    },
    async deleteAudio(id) {
      await (await ready).dropAudio(id);
    },
    async deleteAllAudio() {
      return (await ready).dropAllAudio();
    },
    async recordStart() {
      notice = undefined;
      return (await session).start();
    },
    async recordStop() {
      return (await session).stop();
    },
    settings,
    async patchSettings(patch: TranscriptsPatch) {
      Object.assign(cfg(), patch);
      ctx.saveConfig();
      await (await ready).sweep();
      return settings();
    },
    async chooseFolder() {
      const dir = await p.dialog.pickFolder();
      if (!dir) return null;
      cfg().folder = dir;
      ctx.saveConfig();
      return settings();
    },
    async openFolder() {
      await p.shell.openFolder(folder());
    },
    async push() {
      return { recording, tick, ...(notice && { notice }) };
    },
  };

  return {
    handlers,
    core: ready,
    phase() {
      if (recording) return recording.phase === "starting" ? "starting" : recording.phase === "saving" ? "saving" : "recording";
      return busy ? "transcribing" : "ready";
    },
    startRecording: handlers.recordStart,
    stopRecording: handlers.recordStop,
    async dispose() {
      clearInterval(sweepTimer);
      const t = await ready;
      if (recording?.phase === "recording") await (await session).stop();
      await t.dispose();
    },
  };
}

