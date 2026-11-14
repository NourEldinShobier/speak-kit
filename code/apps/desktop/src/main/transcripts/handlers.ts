import { plainText, type Detail, type Format, type Outcome, type Transcripts } from "@speakkit/transcripts";
import type { Picked, Push, SavedFile, SettingsView, TranscriptsBridge } from "../../shared/transcripts/contract";
import type { TranscriptsConfig, TranscriptsPatch } from "../../shared/transcripts/settings";
import { checkPickedFolder } from "../../shared/control/settings-registry";
import { decodeFile, inspectFile } from "./decode";
import type { RecordingSession } from "./mic-session";
import type { TranscriptsPorts } from "./service";

export type Handlers = Omit<TranscriptsBridge, "onPush" | "pathOf" | "decoder" | "mic">;

export interface HandlerEnv {
  ready: Promise<Transcripts>;
  session: Promise<RecordingSession>;
  ports: TranscriptsPorts;
  cfg(): TranscriptsConfig;
  folder(): string;
  saveConfig(): void;
  /** The recorder and the change counter, for `push`. */
  live(): Push;
  clearNotice(): void;
}

type Part<K extends keyof Handlers> = Pick<Handlers, K>;

/** Looking at transcripts and changing what is in the list. */
function listing({ ready }: HandlerEnv): Part<"list" | "get" | "cancel" | "resume" | "writeNotes" | "rename" | "trash" | "restore" | "remove" | "emptyTrash" | "deleteAudio" | "deleteAllAudio"> {
  return {
    list: async (q) => (await ready).list(q ?? {}),
    get: async (id): Promise<Detail | null> => (await (await ready).get(id)) ?? null,
    cancel: async (id) => (await ready).cancel(id),
    resume: async (id) => (await ready).resume(id),
    writeNotes: async (id) => (await ready).writeNotes(id),
    rename: async (id, title) => (await ready).rename(id, title),
    trash: async (id) => (await ready).trash(id),
    restore: async (id) => (await ready).restore(id),
    remove: async (id) => (await ready).remove(id),
    emptyTrash: async () => (await ready).emptyTrash(),
    deleteAudio: async (id) => (await ready).dropAudio(id),
    deleteAllAudio: async () => (await ready).dropAllAudio(),
  };
}

/** Choosing and importing an audio file. */
function importing({ ready, ports: p }: HandlerEnv): Part<"pickFile" | "checkFile" | "importFile"> {
  const picked = async (file: string): Promise<Picked> => inspectFile(file, p.files);
  return {
    pickFile: async () => {
      const file = await p.dialog.pickFile();
      return file ? picked(file) : null;
    },
    checkFile: picked,
    importFile: async ({ path, language }) => {
      const t = await ready;
      const d = await decodeFile(path, p.files);
      return d.ok ? t.importAudio({ name: d.name, pcm: d.pcm, language }) : { ok: false, failure: d.failure };
    },
  };
}

/** Copy, Save as and Show in folder. */
function exporting({ ready, ports: p }: HandlerEnv): Part<"copyText" | "save" | "reveal"> {
  return {
    copyText: async (id, range) => {
      const d = await (await ready).get(id);
      const segments = d && (range ? d.segments.filter((s) => s.start >= range.from && s.start < range.to) : d.segments);
      if (!segments?.length) return false;
      p.clipboard.writeText(plainText(segments));
      return true;
    },
    save: async (id, format: Format): Promise<Outcome<SavedFile>> => {
      const r = await (await ready).save(id, format);
      return r.ok ? { ok: true, path: r.path, kind: r.kind } : r;
    },
    reveal: async (id, format) => {
      const file = (await (await ready).get(id))?.exports.find((f) => f.path.toLowerCase().endsWith(`.${format}`));
      if (file) p.shell.reveal(file.path);
      return !!file;
    },
  };
}

/** Retention, folder, model and storage. */
function settingsOf(env: HandlerEnv): Part<"settings" | "patchSettings" | "chooseFolder" | "openFolder"> {
  const { ready, ports: p, cfg } = env;
  const view = async (): Promise<SettingsView> => {
    const t = await ready;
    const n = t.notice();
    return {
      config: { ...cfg() },
      folder: env.folder(),
      model: p.modelName(),
      storage: t.storage(),
      notice: { newer: n.newer, ...(n.unreadable && { unreadable: true }), ...(n.recoveredFrom && { recoveredFrom: n.recoveredFrom }) },
      supported: true,
    };
  };
  return {
    settings: view,
    patchSettings: async (patch: TranscriptsPatch) => {
      Object.assign(cfg(), patch);
      env.saveConfig();
      await (await ready).sweep();
      return view();
    },
    chooseFolder: async () => {
      const dir = await p.dialog.pickFolder();
      if (!dir) return null;
      const checked = checkPickedFolder("transcripts", dir);
      if (!checked.ok) throw new Error(checked.message);
      Object.assign(cfg(), checked.patch);
      env.saveConfig();
      return view();
    },
    openFolder: () => p.shell.openFolder(env.folder()),
  };
}

/** The recorder and the live state. */
function recording(env: HandlerEnv): Part<"recordStart" | "recordStop" | "push"> {
  return {
    recordStart: async () => {
      env.clearNotice();
      return (await env.session).start();
    },
    recordStop: async () => (await env.session).stop(),
    push: async () => env.live(),
  };
}

/** What the History page calls: each method is one thing the person can do, answered from the store, the recorder or the OS ports. */
export function createHandlers(env: HandlerEnv): Handlers {
  return { ...listing(env), ...importing(env), ...exporting(env), ...settingsOf(env), ...recording(env) };
}
