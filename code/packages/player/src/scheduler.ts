import type { Settings } from "@speakkit/protocol";
import type { SourceLike } from "./deps";
import type { AudioOutput } from "./output";
import { playbackRateFor } from "./rate";

/** Sentences decoded and scheduled beyond the one being heard; reading the stream pauses above this (TCP backpressure). Played buffers are dropped at once. */
const LOOKAHEAD = 3;
const PAUSE_SECONDS = { none: 0, short: 0.35, long: 0.8 } as const;
const START_DELAY = 0.02;

interface Scheduled {
  index: number;
  start: number;
  end: number;
  started: boolean;
  src: SourceLike;
}

interface Sentence {
  index: number;
  block: number;
  pcm: Int16Array;
  sampleRate: number;
  durationMs: number;
}

/** Puts decoded sentences on the AudioContext clock back to back, holds at most LOOKAHEAD of them ahead of the one heard, and frees each when played. */
export class Scheduler {
  items: Scheduled[] = [];
  cur: Scheduled | undefined;
  anyScheduled = false;
  framesReceived = 0;
  scheduledMs = 0;
  /** playbackRate of the most recently scheduled buffer (test hook) */
  lastRate = 1;
  /** Longest wait (ms) between the end of one scheduled sentence and the start of the next, beyond the paragraph pause: 0 means gapless (test hook) */
  maxLateMs = 0;
  private nextStart = 0;
  private lastBlock: number | undefined;
  private waiters: (() => void)[] = [];

  private output: AudioOutput;

  constructor(output: AudioOutput) {
    this.output = output;
  }

  /** Schedules one sentence; returns how long it is heard at this speed (ms). */
  schedule(s: Sentence, speed: number, pause: Settings["pauseBetweenParagraphs"]): number {
    const ctx = this.output.ensure();
    const buf = ctx.createBuffer(1, s.pcm.length, s.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < s.pcm.length; i++) ch[i] = s.pcm[i]! / 32768;
    const src = ctx.createBufferSource();
    const rate = playbackRateFor(speed);
    src.buffer = buf;
    src.playbackRate.value = rate;
    this.lastRate = rate;
    this.output.connect(src, rate);
    const gap = this.lastBlock !== undefined && s.block !== this.lastBlock ? PAUSE_SECONDS[pause] : 0;
    this.lastBlock = s.block;
    const start = Math.max(this.nextStart + gap, ctx.currentTime + START_DELAY);
    if (this.nextStart > 0) this.maxLateMs = Math.max(this.maxLateMs, (start - this.nextStart - gap) * 1000);
    const end = start + s.durationMs / 1000 / rate;
    src.start(start);
    this.nextStart = end;
    this.items.push({ index: s.index, start, end, started: false, src });
    this.framesReceived++;
    this.scheduledMs += s.durationMs;
    this.anyScheduled = true;
    return s.durationMs / rate;
  }

  /** Sentences whose start time has arrived: the one heard changes. */
  takeStarted(now: number): Scheduled[] {
    const out: Scheduled[] = [];
    for (const it of this.items)
      if (!it.started && now >= it.start - 0.005) {
        it.started = true;
        this.cur = it;
        out.push(it);
      }
    return out;
  }

  /** Frees the sentences already played, then wakes the stream reader if there is room again. */
  retire(now: number): void {
    while (this.items[0] && now >= this.items[0].end) this.release(this.items.shift()!);
    if (this.ahead() < LOOKAHEAD) this.flushWaiters();
  }

  isDrained(): boolean {
    return this.items.length === 0;
  }

  /** Resolves when fewer than LOOKAHEAD sentences wait to be heard (or the stream was replaced). */
  room(current: () => boolean): Promise<void> {
    if (!current() || this.ahead() < LOOKAHEAD) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  /** Stops and frees everything scheduled and forgets the clock position. */
  halt(): void {
    for (const it of this.items) {
      try {
        it.src.stop();
      } catch {
        /* not started */
      }
      this.release(it);
    }
    this.items = [];
    this.cur = undefined;
    this.anyScheduled = false;
    this.nextStart = 0;
    this.lastBlock = undefined;
    this.flushWaiters();
  }

  /** Duration of a scheduled sentence at the source rate, before the speed-up (what the highlighter times against). */
  rawDuration(it: Scheduled, speed: number): number {
    return (it.end - it.start) * 1000 * playbackRateFor(speed);
  }

  /** Bytes of decoded audio still held by scheduled sentences (test hook). */
  retainedBytes(): number {
    let n = 0;
    for (const it of this.items) n += ((it.src.buffer as unknown as { length?: number } | null)?.length ?? 0) * 4;
    return n;
  }

  private ahead() {
    return this.items.filter((i) => !i.started).length;
  }

  private flushWaiters() {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  /** Drop the decoded audio of a played (or cancelled) sentence so memory stays at the lookahead window. */
  private release(it: Scheduled) {
    try {
      it.src.disconnect?.();
    } catch {
      /* already disconnected */
    }
    it.src.buffer = null;
  }
}
