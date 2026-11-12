/** The replay buffer keeps the screen in short video pieces and drops the old ones, so only the last stretch of time is ever held. */
export const REPLAY = {
  /** What a saved replay covers at least. */
  windowMs: 15_000,
  /** The video is cut into pieces of this length: each one can be played on its own, and the oldest piece is dropped whole. */
  segmentMs: 3000,
} as const;

export interface ReplayPiece {
  startMs: number;
  endMs: number;
}

/** Index of the oldest piece of the newest run that covers the window (0 when everything together is shorter). */
function firstCovering(pieces: readonly ReplayPiece[], windowMs: number): number {
  let covered = 0;
  let first = pieces.length;
  while (first > 0 && covered < windowMs) {
    first--;
    covered += pieces[first]!.endMs - pieces[first]!.startMs;
  }
  return first;
}

/** The pieces to keep: the newest ones that cover the window, and one more so the window is still covered when the piece being recorded is cut off short. */
export const keepPieces = <T extends ReplayPiece>(pieces: readonly T[], windowMs: number = REPLAY.windowMs): T[] => pieces.slice(Math.max(0, firstCovering(pieces, windowMs) - 1));

/** The pieces a saved replay is made of: from the newest back until the window is covered. Empty when nothing was recorded. */
export const clipPieces = <T extends ReplayPiece>(pieces: readonly T[], windowMs: number = REPLAY.windowMs): T[] => pieces.slice(firstCovering(pieces, windowMs));

/** The picture times of a clip, moved so the clip starts at zero; pictures from before its first piece are left out. */
export function clipTimes<T extends { atMs: number }>(items: readonly T[], clipStartMs: number): (T & { atMs: number })[] {
  return items.filter((x) => x.atMs >= clipStartMs).map((x) => ({ ...x, atMs: x.atMs - clipStartMs }));
}
