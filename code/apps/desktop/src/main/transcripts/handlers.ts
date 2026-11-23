import { plainText, type Detail, type Transcripts } from "@speakkit/transcripts";
import type { Picked, Push, SettingsView, TranscriptsBridge } from "../../shared/transcripts/contract";
import type { TranscriptsConfig, TranscriptsPatch } from "../../shared/transcripts/settings";
import { decodeFile, inspectFile } from "./decode";
import type { TranscriptsPorts } from "./service";

export type Handlers = Omit<TranscriptsBridge, "onPush" | "pathOf" | "decoder">;

export interface HandlerEnv {
  ready: Promise<Transcripts>;
  ports: TranscriptsPorts;
  cfg(): TranscriptsConfig;
  saveConfig(): void;
  /** The change counter, for `push`. */
  push(): Push;
}

type Part<K extends keyof Handlers> = Pick<Handlers, K>;

/** Looking at transcripts and changing what is in the list. */
function listing({ ready }: HandlerEnv): Part<"list" | "get" | "cancel" | "resume" | "writeNotes" | "rename" | "remove" | "deleteAudio" | "deleteAllAudio"> {
  return {
    list: async (q) => (await ready).list(q ?? {}),
    get: async (id): Promise<Detail | null> => (await (await ready).get(id)) ?? null,
    cancel: async (id) => (await ready).cancel(id),
    resume: async (id) => (await ready).resume(id),
    writeNotes: async (id) => (await ready).writeNotes(id),
    rename: async (id, title) => (await ready).rename(id, title),
    remove: async (id) => (await ready).remove(id),
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

/** Copy section. */
function exporting({ ready, ports: p }: HandlerEnv): Part<"copyText"> {
  return {
    copyText: async (id, range) => {
      const d = await (await ready).get(id);
      const segments = d?.segments.filter((s) => s.start >= range.from && s.start < range.to);
      if (!segments?.length) return false;
      p.clipboard.writeText(plainText(segments));
      return true;
    },
  };
}

/** Settings, model and storage. */
function settingsOf(env: HandlerEnv): Part<"settings" | "patchSettings" | "push"> {
  const { ready, ports: p, cfg } = env;
  const view = async (): Promise<SettingsView> => {
    const t = await ready;
    const n = t.notice();
    return {
      config: { ...cfg() },
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
      return view();
    },
    push: async () => env.push(),
  };
}

/** What the History page calls: each method is one thing the person can do, answered from the store or the OS ports. */
export function createHandlers(env: HandlerEnv): Handlers {
  return { ...listing(env), ...importing(env), ...exporting(env), ...settingsOf(env) };
}
