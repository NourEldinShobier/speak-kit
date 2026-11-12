import type { RecorderPayload } from "../../../shared/capture/contract";
import { clipPieces, clipTimes, keepPieces, REPLAY } from "../../../shared/capture/replay";

/** What the buffer needs of the screen recorder: it starts and ends one video piece at a time. */
export interface PieceRecorder {
  /** The moment the picture started, on the clock of `now`. */
  readonly startedAt: number;
  startSegment(frameEveryMs: number): void;
  endSegment(): Promise<void>;
  stop(): void;
}

interface Piece {
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
  /** How many pieces and pictures are held now (for tests and diagnostics). */
  held(): { pieces: number; frames: number };
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

/** The pieces and pictures held now. A piece with an end time of -1 is the one being recorded. */
function createStore() {
  let pieces: Piece[] = [];
  let frames: { atMs: number; jpeg: Uint8Array }[] = [];
  const open = () => pieces[pieces.length - 1];
  return {
    clear() {
      pieces = [];
      frames = [];
    },
    begin(startMs: number) {
      pieces.push({ startMs, endMs: -1, chunks: [] });
    },
    end(endMs: number) {
      const piece = open();
      if (piece && piece.endMs < 0) piece.endMs = endMs;
    },
    chunk: (chunk: Uint8Array) => open()?.chunks.push(chunk),
    frame: (atMs: number, jpeg: Uint8Array) => frames.push({ atMs, jpeg }),
    /** Drops the finished pieces nobody needs any more, and the pictures from before the oldest one kept. */
    prune() {
      const keep = new Set(keepPieces(pieces.filter((p) => p.endMs >= 0)));
      pieces = pieces.filter((p) => p.endMs < 0 || keep.has(p));
      const oldest = pieces[0]?.startMs ?? 0;
      frames = frames.filter((f) => f.atMs >= oldest);
    },
    /** The newest 15 seconds of finished pieces with video, or undefined when there are none. */
    clip(): Clip | undefined {
      const chosen = clipPieces(pieces.filter((p) => p.endMs >= 0 && p.chunks.length));
      const first = chosen[0];
      const last = chosen[chosen.length - 1];
      if (!first || !last) return undefined;
      const durationMs = last.endMs - first.startMs;
      return { videos: chosen.map((p) => joined(p.chunks)), frames: clipTimes(frames, first.startMs).filter((f) => f.atMs <= durationMs), durationMs };
    },
    held: () => ({ pieces: pieces.length, frames: frames.length }),
  };
}

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
  const set = d.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = d.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const store = createStore();
  let run: PieceRecorder | undefined;
  let frameEveryMs = 1000;
  let timer: unknown;
  let rotating: Promise<void> = Promise.resolve();
  const begin = () => {
    run!.startSegment(frameEveryMs);
    store.begin(d.now() - run!.startedAt);
  };
  const close = async () => {
    await run!.endSegment();
    store.end(d.now() - run!.startedAt);
  };
  const rotate = () =>
    (rotating = rotating.then(async () => {
      await close();
      store.prune();
      begin();
    }));
  return {
    attach: (r) => void (run = r),
    onPayload(p) {
      if (p.kind === "frame") store.frame(p.atMs, p.jpeg);
      else if (p.kind === "video") store.chunk(p.chunk);
    },
    start(every) {
      frameEveryMs = every;
      store.clear();
      begin();
      timer = set(() => void rotate(), d.segmentMs ?? REPLAY.segmentMs);
    },
    async save() {
      await rotating;
      await close();
      const clip = store.clip();
      begin();
      return clip;
    },
    stop() {
      if (timer !== undefined) clear(timer);
      timer = undefined;
      run?.stop();
      store.clear();
    },
    held: store.held,
  };
}
