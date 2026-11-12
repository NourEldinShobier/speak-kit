import { HUNG, type ChunkResult } from "@speakkit/transcripts";
import { EngineNotReadyError, STT_MODELS, type SttLanguage, type SttModelId } from "@speakkit/engine";
import type { Stt } from "../dictation/stt";

export interface ChunkEngineDeps {
  stt: Stt;
  /** The model dictation uses; there is one resident engine, so transcripts borrow it and never load a second copy. */
  model(): SttModelId;
}

/**
 * One chunk of audio through the shared speech engine. A model that is on disk but not loaded is loaded first (the load is shared with anyone else
 * waiting for it). Says "engine-missing" when no model is installed, "engine-loading" while one downloads or still is not up, "failed" for anything else.
 * A chunk that outlives its deadline means the engine hangs: the worker is killed and loaded again, like dictation does.
 */
export function chunkEngine({ stt, model }: ChunkEngineDeps): (pcm: Int16Array, language: string, signal: AbortSignal) => Promise<ChunkResult> {
  return async (pcm, language, signal) => {
    const id = model();
    if (stt.status().state !== "ready") {
      if (!(await stt.downloaded(id))) return { ok: false, code: "engine-missing" };
      if (stt.status().state === "downloading") return { ok: false, code: "engine-loading" };
      await stt.warm(id);
      const after = stt.status().state;
      if (after !== "ready") return { ok: false, code: after === "error" ? "failed" : "engine-loading" };
    }
    const supported: readonly string[] = STT_MODELS.find((m) => m.id === id)?.languages ?? [];
    const lang = (supported.includes(language) ? language : "auto") as SttLanguage;
    try {
      const t = await stt.transcribe(pcm, lang, signal);
      return { ok: true, text: t.text, speech: t.speech };
    } catch (e) {
      if (e instanceof EngineNotReadyError) return { ok: false, code: "engine-loading" };
      if (signal.aborted && signal.reason instanceof Error && signal.reason.message === HUNG) {
        await stt.unload().catch(() => {});
        void stt.warm(id);
      }
      return { ok: false, code: "failed" };
    }
  };
}
