import { writeNotes } from "@speakkit/meetings";
import type { Summarise } from "@speakkit/transcripts";
import type { OpenAiResult } from "../voice-chat/openai";

/** The notes writer for transcripts: the same opt-in, key and model as the meeting notes. `on` is read each time, so turning the setting off takes effect at once. */
export function transcriptNotes(o: { on(): boolean; writer: string; complete(system: string, user: string, signal: AbortSignal): Promise<OpenAiResult<string>> }): () => Summarise | undefined {
  const deps = {
    writer: o.writer,
    complete: async (system: string, user: string, signal: AbortSignal) => {
      const r = await o.complete(system, user, signal);
      return r.ok ? { ok: true as const, text: r.value } : r;
    },
  };
  return () =>
    o.on()
      ? async (segments, signal) => {
          const out = await writeNotes(
            deps,
            segments.map((s) => ({ start: s.start, text: s.text })),
            signal,
          );
          return out.ok ? { ok: true, notes: out.notes, writer: out.writer } : out;
        }
      : undefined;
}
