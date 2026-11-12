import { padTail, supportsPrompt, trailingPadMs, type Clip, type Transcriber, type TranscribeResult } from "@speakkit/dictation";
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
  transcribe(pcm: Int16Array, language: SttLanguage, opts?: { signal?: AbortSignal; prompt?: string }): Promise<Transcript>;
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

/** Time a transcription may take before the engine is taken to be hung: generous for a CPU-only machine (measured up to 6x real time), far above a GPU's. */
export const transcribeDeadlineMs = (clipSeconds: number): number => 20_000 + Math.ceil(clipSeconds) * 6_000;

interface TranscriberDeps {
  stt: Stt;
  model(): DictationModelId;
  /** The audio of a recording that could not be transcribed, kept for one retry. */
  onFailedClip(clip: Clip): void;
  /** Why the model cannot be used, when loading it failed (the engine's own message). */
  onModelError?(detail: string): void;
  /** Whether to add the end-of-sentence pause for the models that need it. */
  sentencePause?(): boolean;
  /** How long a clip of this many seconds may take. */
  deadlineMs?(clipSeconds: number): number;
  /** The words were not sent because the model cannot read a prompt; dictation goes on without them. */
  onPromptDropped?(): void;
}

type Waiting = "model-loading" | "model-failed" | "model-missing";

/** Why the engine cannot take a recording now; undefined when it can. Starts loading a model that is on disk but not loaded. */
async function whyNotReady({ stt, model, onModelError }: TranscriberDeps): Promise<Waiting | undefined> {
  const status = stt.status();
  if (status.state === "ready") return undefined;
  if (status.state === "downloading" || status.state === "loading") return "model-loading";
  const id = model();
  if (!(await stt.downloaded(id))) return "model-missing";
  if (status.state === "error") {
    // Loading again on every press would only hide the reason behind "still loading"; a new attempt happens when dictation is switched on again.
    onModelError?.(status.detail ?? "The speech model could not be loaded.");
    return "model-failed";
  }
  void stt.warm(id);
  return "model-loading";
}

const pickLanguage = (id: string, language: string): SttLanguage => {
  const supported: readonly string[] = STT_MODELS.find((m) => m.id === id)?.languages ?? [];
  return (supported.includes(language) ? language : "auto") as SttLanguage;
};

/** Kills the hung worker and loads a new one; nothing is left to kill when unloading itself fails, and the load starts a new worker either way. */
async function restart(stt: TranscriberDeps["stt"], id: SttModelId): Promise<void> {
  try {
    await stt.unload();
  } catch {
    // Nothing is left to kill when unloading itself fails; the load below starts a new worker either way.
  }
  void stt.warm(id);
}

/** The engine's answer for one clip, cut off at the deadline (then the worker is killed and loaded again). Throws when the engine fails or the deadline passes. */
export async function heard(
  { stt, model, deadlineMs = transcribeDeadlineMs, sentencePause, onPromptDropped }: TranscriberDeps,
  req: { clip: Clip; language: string; prompt?: string | undefined },
): Promise<TranscribeResult> {
  const { clip, language, prompt } = req;
  const id = model();
  const lang = pickLanguage(id, language);
  const sent = prompt && supportsPrompt(id) ? prompt : undefined;
  if (prompt && !sent) onPromptDropped?.();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(new Error("transcription timed out")), deadlineMs(clip.pcm.length / clip.sampleRate));
  try {
    const pcm = padTail(clip.pcm, clip.sampleRate, trailingPadMs(id, sentencePause?.() ?? false));
    const t = await stt.transcribe(to16(pcm), lang, { signal: stop.signal, ...(sent && { prompt: sent }) });
    return { ok: true, text: t.speech ? t.text.trim() : "", model: id, ...(lang !== "auto" && { language: lang }) };
  } catch (e) {
    if (stop.signal.aborted) await restart(stt, id);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `Transcriber` port. Says why it cannot transcribe instead of throwing: a model that is still loading is "model-loading", one that is not on disk
 * "model-missing", one whose load failed "model-failed" (with the engine's reason sent to `onModelError`), anything else "failed". Every failure except
 * a missing model keeps the clip for a retry. A language the model lacks falls back to detection. A transcription that outlives its deadline means the
 * engine hangs: the worker is killed and loaded again, and the clip is kept.
 */
export function createTranscriber(deps: TranscriberDeps): Transcriber {
  return {
    async transcribe({ clip, language, prompt }): Promise<TranscribeResult> {
      const keep = (code: "model-loading" | "model-failed" | "failed"): TranscribeResult => (deps.onFailedClip(clip), { ok: false, code });
      const waiting = await whyNotReady(deps);
      if (waiting) return waiting === "model-missing" ? { ok: false, code: waiting } : keep(waiting);
      try {
        return await heard(deps, { clip, language, prompt });
      } catch (e) {
        return keep(e instanceof EngineNotReadyError ? "model-loading" : "failed");
      }
    },
  };
}
