import type { Clip, Transcriber, TranscribeResult } from "@speakkit/dictation";
import { EngineNotReadyError, STT_MODELS, type SttLanguage, type SttModelId, type Transcript } from "@speakkit/engine";
import type { DictationModelId, ModelView } from "../../shared/dictation/contract";

export interface SttStatus {
  state: string;
  progress?: number;
  detail?: string;
}

/** The speech engine as dictation uses it: `WhisperStt` in the app, a scripted one in tests. */
export interface Stt {
  status(): SttStatus;
  onStatus(cb: (s: SttStatus) => void): () => void;
  downloaded(id: SttModelId): Promise<boolean>;
  load(id: SttModelId, progress?: (fraction: number) => void): Promise<void>;
  warm(id: SttModelId): Promise<void>;
  transcribe(pcm: Int16Array, language: SttLanguage, signal?: AbortSignal): Promise<Transcript>;
  unload(): Promise<void>;
}

const BLURB: Record<DictationModelId, { name: string; tag: string; description: string }> = {
  "large-v3-turbo-q5_0": { name: "Whisper Large v3 Turbo", tag: "Accurate", description: "Best accuracy in English, German and Arabic. Quick with a graphics card." },
  "parakeet-tdt-0.6b-v3-q4_0": { name: "Parakeet v3", tag: "Fast", description: "Very fast on any computer. English and German only." },
};

export interface ModelProgress {
  id: DictationModelId;
  kind: "downloading" | "preparing";
  fraction: number;
  /** Seconds left, from the speed so far; undefined until there is a measurement. */
  etaSeconds?: number;
}

export function modelViews(selected: DictationModelId, installed: Record<DictationModelId, boolean>, job: ModelProgress | null): ModelView[] {
  return STT_MODELS.map((m) => {
    const id = m.id as DictationModelId;
    const view: ModelView = { id, ...BLURB[id], bytes: m.bytes, installed: installed[id], selected: id === selected, languages: [...m.languages] };
    if (job?.id === id)
      view.progress = job.kind === "preparing" ? { kind: "preparing" } : { kind: "downloading", fraction: job.fraction, ...(job.etaSeconds !== undefined && { etaSeconds: job.etaSeconds }) };
    return view;
  });
}

const to16 = (pcm: Float32Array): Int16Array => {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767);
  return out;
};

interface TranscriberDeps {
  stt: Stt;
  model(): DictationModelId;
  /** The audio of a recording that could not be transcribed, kept for one retry. */
  onFailedClip(clip: Clip): void;
}

/**
 * The `Transcriber` port. Says why it cannot transcribe instead of throwing: a model that is still loading is "model-loading", one that is not on disk
 * "model-missing", anything else "failed" (and the clip is kept for a retry). A language the model lacks falls back to detection.
 */
export function createTranscriber({ stt, model, onFailedClip }: TranscriberDeps): Transcriber {
  return {
    async transcribe({ clip, language }): Promise<TranscribeResult> {
      const id = model();
      const state = stt.status().state;
      if (state === "downloading" || state === "loading") return { ok: false, code: "model-loading" };
      if (state !== "ready") {
        if (!(await stt.downloaded(id))) return { ok: false, code: "model-missing" };
        void stt.warm(id);
        return { ok: false, code: "model-loading" };
      }
      const supported: readonly string[] = STT_MODELS.find((m) => m.id === id)?.languages ?? [];
      const lang = (supported.includes(language) ? language : "auto") as SttLanguage;
      try {
        const t = await stt.transcribe(to16(clip.pcm), lang);
        return { ok: true, text: t.speech ? t.text.trim() : "", model: id, ...(lang !== "auto" && { language: lang }) };
      } catch (e) {
        if (e instanceof EngineNotReadyError) return { ok: false, code: "model-loading" };
        onFailedClip(clip);
        return { ok: false, code: "failed" };
      }
    },
  };
}
