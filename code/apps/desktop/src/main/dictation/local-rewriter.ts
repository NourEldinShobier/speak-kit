import type { Rewriter } from "@speakkit/dictation";
import { instructions } from "./openai-rewriter";

/** What the local writer needs from the model host: whether the file is on disk, and one tidy-up job that stops with its signal. */
export interface LocalWriterPort {
  downloaded(): Promise<boolean>;
  complete(req: { system: string; text: string; signal: AbortSignal }): Promise<string>;
}

/** Tidies one dictation with the model on this computer. Any failure throws: the pass falls back to the text as said. */
export function createLocalRewriter(writer: LocalWriterPort): Rewriter {
  return {
    async rewrite({ text, signal, style, hints }) {
      if (!(await writer.downloaded())) throw new Error("no writer model");
      signal.throwIfAborted(); // the deadline may have passed while the disk was read
      const out = (await writer.complete({ system: instructions(style, hints), text, signal })).trim();
      if (!out) throw new Error("no answer");
      return out;
    },
  };
}

/** The writer the settings name, read at every dictation so a change applies at once. */
export function chooseRewriter(which: () => "openai" | "local", writers: { openai: Rewriter; local: Rewriter }): Rewriter {
  return { rewrite: (req) => writers[which()].rewrite(req) };
}
