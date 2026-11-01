import { SAMPLE_RATE } from "@speakkit/protocol";
import { normalizeText, type SynthOptions, type Synthesized, type TtsEngine } from "@speakkit/engine";

/** Normalizes a sentence for the engine and synthesizes it; a sentence that is only emoji or symbols becomes 100 ms of silence. */
export async function render(engine: TtsEngine, sentence: string, o: SynthOptions): Promise<Synthesized> {
  const text = normalizeText(sentence, { numbers: !!engine.needsNumberWords });
  if (!text) return { pcm: new Int16Array(SAMPLE_RATE / 10), sampleRate: SAMPLE_RATE };
  return engine.synthesize(text, o);
}
