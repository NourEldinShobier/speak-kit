import { applyMode, applyRules, defaultSettings, resolveMode, soundsLikeRules, type Settings } from "@speakkit/dictation";
import type { Heard, StreamsHost } from "@speakkit/server";
import type { Ctx } from "../context";
import { coreSettings } from "../dictation/service-support";
import type { Stt } from "../dictation/stt";
import type { DictationService } from "../dictation/service";
import { chunkEngine } from "../transcripts/engine";

const WHY = { "engine-missing": "model_missing", "engine-loading": "busy", failed: "failed" } as const;

/**
 * Live transcription for other apps, on the engine dictation already holds. Dictation goes first: while it records, a segment waits.
 * The text rules are the ones dictation uses with no program in front, so a `process` stream returns what a dictation would have pasted.
 */
export function desktopStreams(ctx: Ctx, p: { stt: Stt; dictation(): DictationService }): StreamsHost {
  const hear = chunkEngine({ stt: p.stt, model: () => ctx.config.dictation.model });
  return {
    async transcribe(pcm, language, signal): Promise<Heard> {
      const phase = p.dictation().status().phase;
      if (phase === "recording" || phase === "locked") return { ok: false, code: "busy" };
      const r = await hear(pcm, language, signal);
      if (r.ok) return { ok: true, text: r.text, speech: r.speech !== false };
      return { ok: false, code: WHY[r.code] };
    },
    process(text, language) {
      const base: Settings = { ...defaultSettings, ...coreSettings(ctx.config.dictation) };
      const eff = applyMode(base, resolveMode(base.modes, undefined));
      return applyRules(text, { ...eff, replacements: [...eff.replacements, ...soundsLikeRules(eff.terms)], language: language === "auto" ? ctx.config.dictation.language : language }).trimEnd();
    },
  };
}
