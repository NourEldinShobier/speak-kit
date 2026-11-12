import type { RecorderPayload } from "../../../shared/capture/contract";
import { clipPieces, clipTimes, keepPieces, REPLAY } from "../../../shared/capture/replay";

/** What the buffer needs of the screen recorder: it starts and ends one video piece at a time. */
export interface PieceRecorder {
  /** The moment the picture started, on the clock of `now`. */
  readonly startedAt: number;
  startSegment(frameEveryMs: number): void;
  endSegment(): Promise<void>;
  stop(): void;
  /** How many pieces and pictures are held now (for tests and diagnostics). */
  held(): { pieces: number; frames: number };
}

interface Piece {
  segment: number;
  startMs: number;
  endMs: number;
  chunks: Uint8Array[];
}

export interface Clip {
  videos: Uint8Array[];
  frames: { atMs: number; jpeg: Uint8Array }[];
  durationMs: number;
}

export interface ReplayBuffer {
  /** Where the recorder's video and pictures go. */
  onPayload(d: RecorderPayload): void;
  attach(run: PieceRecorder): void;
  start(frameEveryMs: number): void;
  /** Ends the piece being recorded, gives the newest 15 seconds, and goes on recording. Undefined when nothing was recorded yet. */
  save(): Promise<Clip | undefined>;
  stop(): void;
}

const joined = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export interface ReplayBufferDeps {
  now(): number;
  segmentMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
}

/**
 * The last 15 seconds of the screen, kept in short video pieces that each play on their own. Every few seconds the recorder starts a new piece and the oldest
 * is dropped, so memory holds one clip's worth and nothing is written to disk until a clip is saved.
 */
export function createReplayBuffer(d: ReplayBufferDeps): ReplayBuffer {
  const segmentMs = d.segmentMs ?? REPLAY.segmentMs;
  const set = d.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = d.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  let run: PieceRecorder | undefined;
  let frameEveryMs = 1000;
  let pieces: Piece[] = [];
  let frames: { atMs: number; jpeg: Uint8Array }[] = [];
  let timer: unknown;
  let rotating: Promise<void> = Promise.resolve();
  const clock = () => d.now() - run!.startedAt;
  const open = () => pieces[pieces.length - 1];

  const begin = () => {
    run!.startSegment(frameEveryMs);
    pieces.push({ segment: -1, startMs: clock(), endMs: -1, chunks: [] });
  };
  const close = async () => {
    await run!.endSegment();
    const piece = open();
    if (piece && piece.endMs < 0) piece.endMs = clock();
  };
  const prune = () => {
    const closed = pieces.filter((p) => p.endMs >= 0);
    const keep = new Set(keepPieces(closed));
    pieces = pieces.filter((p) => p.endMs < 0 || keep.has(p));
    const oldest = pieces[0]?.startMs ?? 0;
    frames = frames.filter((f) => f.atMs >= oldest);
  };
  const rotate = () => {
    rotating = rotating.then(async () => {
      await close();
      prune();
      begin();
    });
    return rotating;
  };

  return {
    attach: (r) => void (run = r),
    onPayload(p) {
      if (p.kind === "frame") frames.push({ atMs: p.atMs, jpeg: p.jpeg });
      else if (p.kind === "video") {
        const piece = open();
        if (!piece) return;
        piece.segment = p.segment;
        piece.chunks.push(p.chunk);
      }
    },
    start(every) {
      frameEveryMs = every;
      pieces = [];
      frames = [];
      begin();
      timer = set(() => void rotate(), segmentMs);
    },
    async save() {
      await rotating;
      await close();
      const chosen = clipPieces(pieces.filter((p) => p.endMs >= 0 && p.chunks.length));
      const first = chosen[0];
      const last = chosen[chosen.length - 1];
      let clip: Clip | undefined;
      if (first && last)
        clip = { videos: chosen.map((p) => joined(p.chunks)), frames: clipTimes(frames, first.startMs).filter((f) => f.atMs <= last.endMs - first.startMs), durationMs: last.endMs - first.startMs };
      begin();
      return clip;
    },
    held: () => ({ pieces: pieces.length, frames: frames.length }),
    stop() {
      if (timer !== undefined) clear(timer);
      timer = undefined;
      run?.stop();
      pieces = [];
      frames = [];
    },
  };
}
