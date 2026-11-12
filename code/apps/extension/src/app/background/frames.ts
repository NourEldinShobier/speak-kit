import type { ExtractReply } from "@speakkit/protocol";

/** What one frame of a tab answered to an 'extract' request (undefined: no content script, or it did not answer). */
export interface FrameReply {
  frameId: number;
  reply: ExtractReply | undefined;
}

const docOf = (r: FrameReply) => (r.reply && "doc" in r.reply ? r.reply.doc : undefined);
const size = (r: FrameReply) => docOf(r)?.sentences.reduce((n, s) => n + s.text.length, 0) ?? 0;

/**
 * The frame to read: one holding a selection wins, else the one with the most readable text; the earlier entry (the top frame comes first) wins a tie.
 * With no readable text anywhere, the first answer is returned so its error reaches the user; undefined when nothing answered.
 */
export function pickFrame(replies: FrameReply[]): FrameReply | undefined {
  const withText = replies.filter((r) => size(r) > 0);
  const selected = withText.filter((r) => docOf(r)?.source === "selection");
  const pool = selected.length ? selected : withText;
  return pool.reduce<FrameReply | undefined>((best, r) => (!best || size(r) > size(best) ? r : best), undefined) ?? replies.find((r) => r.reply);
}
