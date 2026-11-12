import { padTail, supportsPrompt, trailingPadMs, type Clip, type Transcriber, type TranscribeResult } from "@speakkit/dictation";
import { EngineNotReadyError, STT_MODELS, resolveLanguage, type SttLanguage, type SttModel, type SttModelId, type TransferInfo, type Transcript } from "@speakkit/engine";
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
  /** Downloads without loading; absent in scripted engines, which then download inside load. */
  download?(id: SttModelId, o?: { progress?: (fraction: number) => void; signal?: AbortSignal }): Promise<void>;
  load(id: SttModelId, progress?: (fraction: number) => void): Promise<void>;
  warm(id: SttModelId): Promise<void>;
  transcribe(pcm: Int16Array, language: SttLanguage, opts?: { signal?: AbortSignal; prompt?: string }): Promise<Transcript>;
  unload(): Promise<void>;
}

export interface ModelProgress {
  id: DictationModelId;
  kind: "downloading" | "preparing";
  fraction: number;
  /** Seconds left, from the speed so far; undefined until there is a measurement. */
  etaSeconds?: number;
}

interface ViewState {
  isInstalled(id: string): boolean;
  job: ModelProgress | null;
  transfers?: readonly TransferInfo[];
}

function progressOf(id: string, { job, transfers = [] }: ViewState): ModelView["progress"] {
  const paused = transfers.find((t) => t.id === id && t.state === "paused");
  if (paused) return { kind: "paused", fraction: paused.fraction };
  if (job?.id !== id) return undefined;
  if (job.kind === "preparing") return { kind: "preparing" };
  return { kind: "downloading", fraction: job.fraction, ...(job.etaSeconds !== undefined && { etaSeconds: job.etaSeconds }) };
}

export function modelViews(models: readonly SttModel[], selected: DictationModelId, state: ViewState): ModelView[] {
  return models.map((m) => {
    const id = m.id as DictationModelId;
    const progress = progressOf(id, state);
    return {
      id,
      name: m.name,
      tag: m.tag,
      description: m.description,
      bytes: m.bytes,
      installed: state.isInstalled(id),
      selected: id === selected,
      languages: [...m.languages],
      ...(progress && { progress }),
    };
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
  /** Every model there is (catalog and the ones the person added); the catalog alone when absent. */
  models?(): readonly SttModel[];
  /** A recording is about to be transcribed with this model: it counts as used (idle release restarts its wait). */
  onUsed?(id: string): void;
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

/** A language the model lacks becomes English (the page says so); automatic detection only on a model that detects. */
const pickLanguage = (id: string, language: string, models?: () => readonly SttModel[]): SttLanguage => {
  const facts = (models?.() ?? STT_MODELS).find((m) => m.id === id);
  return (facts ? resolveLanguage(facts, language).language : "en") as SttLanguage;
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
  { stt, model, models, deadlineMs = transcribeDeadlineMs, sentencePause, onPromptDropped }: TranscriberDeps,
  req: { clip: Clip; language: string; prompt?: string | undefined },
): Promise<TranscribeResult> {
  const { clip, language, prompt } = req;
  const id = model();
  const lang = pickLanguage(id, language, models);
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
      deps.onUsed?.(deps.model());
      try {
        return await heard(deps, { clip, language, prompt });
      } catch (e) {
        return keep(e instanceof EngineNotReadyError ? "model-loading" : "failed");
      }
    },
  };
}
