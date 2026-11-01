import {
  MAX_SPEED,
  MIN_SPEED,
  type PlayerCommand,
  type PlayerState,
  type PlayerStatus,
  type ReadDoc,
} from "@speakkit/protocol";
import { readChunk } from "./chunk";
import type { CtxLike, PlayerDeps, SourceLike, StretchNode } from "./deps";
import { StreamError, mapHttpError } from "./errors";
import { IDLE_CLOSE_MS, IdleTimer, ModelHold } from "./lifecycle";
import type { PlayerConfig, QueueItem } from "./types";

export { mapHttpError, IDLE_CLOSE_MS };
export type { BufferLike, CtxLike, PlayerDeps, SourceLike, StretchDeps, StretchNode } from "./deps";

/** Sentences decoded and scheduled beyond the one being heard; reading the stream pauses above this (TCP backpressure). Played buffers are dropped at once. */
export const LOOKAHEAD = 3;
/** Max sentences per /v1/speak request (server limit is 500; smaller chunks bound work the server does ahead of us). */
export const CHUNK = 40;
/** Estimated speech rate for sentences not synthesized yet, chars per second at speed 1. */
export const CHARS_PER_SEC = 15;
const PAUSE_SECONDS = { none: 0, short: 0.35, long: 0.8 } as const;
const START_DELAY = 0.02;
/** While the model loads, a play request waits (1 s polls, at most this many) instead of failing. */
export const LOAD_WAIT_TRIES = 90;
const ELAPSED_EMIT_MS = 500;

interface Item {
  index: number;
  start: number;
  end: number;
  started: boolean;
  src: SourceLike;
}

export const playbackRateFor = (speed: number) => Math.max(1, speed / 2);
const clampSpeed = (s: number) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));

export class Player {
  cfg: PlayerConfig;
  framesReceived = 0;
  scheduledMs = 0;
  analyser: { getFloatTimeDomainData(a: Float32Array): void; fftSize: number } | undefined;

  private ctx: CtxLike | undefined;
  private out: unknown;
  private doc: ReadDoc | undefined;
  private queue: ReadDoc[] = [];
  /** false: the queue waits when a document ends */
  autoPlay = true;
  /** playbackRate of the most recently scheduled buffer (test hook) */
  lastRate = 1;
  /** Longest wait (ms) between the end of one scheduled sentence and the start of the next, beyond the paragraph pause: 0 means gapless (test hook) */
  maxLateMs = 0;
  /** AudioContext clock and state (test hook) */
  audioClock(): { time: number; state: string } {
    const c = this.ctx as unknown as { currentTime: number; state?: string } | undefined;
    return { time: c?.currentTime ?? 0, state: c?.state ?? "none" };
  }
  private status: PlayerStatus = "idle";
  private error: PlayerState["error"];
  private idx = 0;
  private known: (number | undefined)[] = [];
  private items: Item[] = [];
  private cur: Item | undefined;
  private nextStart = 0;
  private lastBlock: number | undefined;
  private gen = 0;
  private abort: AbortController | undefined;
  private streamDone = false;
  private anyScheduled = false;
  private waiters: (() => void)[] = [];
  private timer: unknown;
  private lastElapsedEmit = 0;
  private stretchNode: StretchNode | undefined;
  private stretchReady: Promise<void> | undefined;
  private replaceNext = false;
  private hold: ModelHold;
  private idleTimer: IdleTimer;

  constructor(
    private deps: PlayerDeps,
    cfg: PlayerConfig,
    private wantAnalyser = false,
  ) {
    this.cfg = { ...cfg };
    this.hold = new ModelHold(deps);
    this.idleTimer = new IdleTimer(deps, () => {
      if (this.status === "idle" || this.status === "finished" || this.status === "error") {
        if (this.queue.length === 0) this.deps.onIdle?.();
        else this.idleTimer.arm();
      }
    });
  }

  // ---- public ----

  command(cmd: PlayerCommand, cfg?: PlayerConfig): void {
    if (cfg) {
      this.cfg.port = cfg.port;
      this.cfg.token = cfg.token;
      this.cfg.pause = cfg.pause;
    }
    switch (cmd.cmd) {
      case "play":
        if (cfg) this.applyDefaults(cfg);
        this.begin(cmd.doc, cmd.doc.startIndex);
        break;
      case "pause":
        this.pause();
        break;
      case "resume":
        this.resume();
        break;
      case "toggle":
        this.toggle();
        break;
      case "stop":
        this.stop();
        break;
      case "seek-ms":
        this.seekMs(cmd.deltaMs);
        break;
      case "seek-sentence":
        this.seekSentence(cmd.index);
        break;
      case "next-block":
        this.jumpBlock(1);
        break;
      case "prev-block":
        this.jumpBlock(-1);
        break;
      case "set-speed":
        this.setSpeed(cmd.speed);
        break;
      case "set-voice":
        this.setVoice(cmd.voice);
        break;
      case "queue-add":
        this.queueAdd(cmd.doc, cfg);
        break;
      case "queue-remove":
        this.queue = this.queue.filter((d) => d.docId !== cmd.docId);
        this.emitQueue();
        this.emit();
        break;
      case "queue-play":
        this.queuePlay(cmd.docId);
        break;
      case "queue-clear":
        this.queue = [];
        this.emitQueue();
        this.emit();
        break;
    }
  }

  /** Release the AudioContext (idle). It is created again by the next play. */
  private closeCtx() {
    this.stretchNode?.disconnect();
    this.stretchNode = undefined;
    this.stretchReady = undefined;
    this.analyser = undefined;
    const c = this.ctx;
    this.ctx = undefined;
    this.out = undefined;
    void c?.close?.().catch(() => {});
  }

  state(): PlayerState {
    const d = this.doc;
    return {
      status: this.status,
      docId: d?.docId,
      tabId: d?.tabId,
      title: d?.title,
      url: d?.url,
      sentenceIndex: this.idx,
      sentenceCount: d?.sentences.length ?? 0,
      elapsedMs: Math.round(this.elapsedMs()),
      totalMs: Math.round(this.totalMs()),
      speed: this.cfg.speed,
      voice: this.cfg.voice,
      error: this.error,
      queueLength: this.queue.length,
    };
  }

  queueItems(): QueueItem[] {
    return this.queue.map((d) => ({
      docId: d.docId,
      tabId: d.tabId,
      title: d.title,
      url: d.url,
      sentenceCount: d.sentences.length,
      estMs: Math.round((d.sentences.reduce((a, s) => a + s.text.length, 0) / 15 / this.cfg.speed) * 1000),
    }));
  }

  /** Heard duration of sentence i in ms: measured when synthesized, estimated otherwise. */
  durationMs(i: number): number {
    const k = this.known[i];
    if (k !== undefined) return k;
    const text = this.doc?.sentences[i]?.text ?? "";
    return (text.length / (CHARS_PER_SEC * this.cfg.speed)) * 1000;
  }

  /** Estimated start of sentence i in ms from the beginning of the document. */
  startMs(i: number): number {
    let t = 0;
    for (let k = 0; k < i; k++) t += this.durationMs(k);
    return t;
  }

  totalMs(): number {
    return this.startMs(this.doc?.sentences.length ?? 0);
  }

  elapsedMs(): number {
    if (!this.doc) return 0;
    let t = this.startMs(this.idx);
    if (this.cur && this.ctx)
      t += Math.max(
        0,
        Math.min((this.ctx.currentTime - this.cur.start) * 1000, this.durationMs(this.idx)),
      );
    if (this.status === "finished") t = this.totalMs();
    return t;
  }

  /** RMS of the output right now (test hook). */
  rms(): number {
    const a = this.analyser;
    if (!a) return 0;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return Math.sqrt(s / buf.length);
  }

  /** Current output samples (test hook). */
  waveform(): number[] {
    const a = this.analyser;
    if (!a) return [];
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    return Array.from(buf);
  }

  /** Bytes of decoded audio still held by scheduled sentences (test hook). */
  retainedBytes(): number {
    let n = 0;
    for (const it of this.items) n += ((it.src.buffer as unknown as { length?: number } | null)?.length ?? 0) * 4;
    return n;
  }

  /** Advance sentence boundaries, retire finished items, wake the stream reader. Runs on a timer while a document is loaded. */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    let changed = false;
    for (const it of this.items) {
      if (!it.started && now >= it.start - 0.005) {
        it.started = true;
        this.cur = it;
        this.idx = it.index;
        changed = true;
        this.emit();
        const d = this.doc;
        if (d)
          this.deps.emitSentence(
            {
              docId: d.docId,
              index: it.index,
              durationMs: this.rawDuration(it),
              speed: this.cfg.speed,
            },
            d.tabId,
          );
      }
    }
    while (this.items[0] && now >= this.items[0].end) this.release(this.items.shift()!);
    this.wake();
    if (
      this.streamDone &&
      this.items.length === 0 &&
      (this.status === "playing" || this.status === "preparing")
    ) {
      this.finish();
      return;
    }
    if (!changed && this.status === "playing") {
      const t = (this.deps.now ?? Date.now)();
      if (t - this.lastElapsedEmit >= ELAPSED_EMIT_MS) this.emit();
    }
  }

  // ---- commands ----

  private applyDefaults(cfg: PlayerConfig) {
    this.cfg.voice = cfg.voice;
    this.cfg.speed = clampSpeed(cfg.speed);
  }

  private begin(doc: ReadDoc, from: number) {
    this.halt();
    this.idleTimer.cancel();
    this.doc = doc;
    this.known = Array.from({ length: doc.sentences.length }, () => undefined);
    this.idx = Math.max(0, Math.min(from, doc.sentences.length - 1));
    this.error = undefined;
    this.status = "preparing";
    this.framesReceived = 0;
    this.scheduledMs = 0;
    this.startStream(this.idx);
    this.ensureTimer();
    this.emit();
  }

  private queueAdd(doc: ReadDoc, cfg?: PlayerConfig) {
    const active =
      this.status === "playing" || this.status === "paused" || this.status === "preparing";
    if (!active && !this.queue.length) {
      if (cfg) this.applyDefaults(cfg);
      this.begin(doc, doc.startIndex);
      return;
    }
    if (this.doc?.docId !== doc.docId && !this.queue.some((d) => d.docId === doc.docId))
      this.queue.push(doc);
    this.emitQueue();
    this.emit();
  }

  private queuePlay(docId: string) {
    const i = this.queue.findIndex((d) => d.docId === docId);
    if (i < 0) return;
    const [doc] = this.queue.splice(i, 1);
    this.emitQueue();
    if (doc) this.begin(doc, doc.startIndex);
  }

  private pause() {
    if (this.status !== "playing" && this.status !== "preparing") return;
    this.status = "paused";
    this.ctx?.suspend().catch(() => {});
    this.hold.start();
    this.emit();
  }

  private resume() {
    if (this.status !== "paused") return;
    this.status = this.anyScheduled ? "playing" : "preparing";
    this.hold.end();
    this.ctx?.resume().catch(() => {}); // closed while resuming (stop): nothing to do
    this.emit();
  }

  private toggle() {
    if (this.status === "playing" || this.status === "preparing") this.pause();
    else if (this.status === "paused") this.resume();
    else if (this.doc) this.begin(this.doc, 0);
  }

  private stop() {
    this.halt();
    this.doc = undefined;
    this.known = [];
    this.idx = 0;
    this.error = undefined;
    this.status = "idle";
    this.clearTimer();
    this.hold.end();
    this.closeCtx();
    this.emit();
    this.idleTimer.arm();
  }

  private seekSentence(i: number) {
    const d = this.doc;
    if (!d || !d.sentences.length) return;
    this.restartFrom(Math.max(0, Math.min(Math.round(i), d.sentences.length - 1)));
  }

  private seekMs(delta: number) {
    const d = this.doc;
    if (!d || !d.sentences.length) return;
    const target = this.elapsedMs() + delta;
    let best = 0,
      bestDist = Infinity,
      t = 0;
    for (let i = 0; i < d.sentences.length; i++) {
      const dist = Math.abs(t - target);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
      t += this.durationMs(i);
    }
    this.restartFrom(best);
  }

  private jumpBlock(dir: 1 | -1) {
    const d = this.doc;
    if (!d || !d.sentences.length) return;
    const s = d.sentences;
    const block = s[this.idx]?.block ?? 0;
    if (dir === 1) {
      const n = s.findIndex((x, i) => i > this.idx && x.block > block);
      if (n < 0) return; // already in the last paragraph
      this.restartFrom(n);
    } else {
      let k = this.idx;
      while (k >= 0 && s[k]!.block >= block) k--; // last sentence of the previous paragraph
      if (k < 0) {
        this.restartFrom(0);
        return;
      }
      const pb = s[k]!.block;
      while (k > 0 && s[k - 1]!.block === pb) k--;
      this.restartFrom(k);
    }
  }

  private setSpeed(speed: number) {
    this.cfg.speed = clampSpeed(speed);
    this.reconfigure();
  }

  private setVoice(voice: string) {
    this.cfg.voice = voice;
    this.reconfigure();
  }

  /** Speed or voice changed: re-request from the sentence being heard. */
  private reconfigure() {
    if (this.doc && this.status !== "idle" && this.status !== "error" && this.status !== "finished")
      this.restartFrom(this.idx);
    else this.emit();
  }

  /** Abort the stream, drop scheduled audio and request again starting at sentence i, keeping paused/playing intent. */
  private restartFrom(i: number) {
    const d = this.doc;
    if (!d) return;
    const wasPaused = this.status === "paused";
    this.halt();
    for (let k = i; k < this.known.length; k++) this.known[k] = undefined;
    this.idx = i;
    this.error = undefined;
    this.status = wasPaused ? "paused" : "preparing";
    this.startStream(i);
    this.ensureTimer();
    this.emit();
  }

  // ---- streaming ----

  private ensureCtx(): CtxLike {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      if (this.wantAnalyser && this.ctx.createAnalyser) {
        this.analyser = this.ctx.createAnalyser() as Player["analyser"];
        (this.analyser as unknown as { connect(n: unknown): void }).connect(this.ctx.destination);
        this.out = this.analyser;
      } else this.out = this.ctx.destination;
    }
    return this.ctx;
  }

  private startStream(from: number) {
    const gen = ++this.gen;
    const replace = this.replaceNext;
    this.replaceNext = false;
    this.abort = new AbortController();
    this.streamDone = false;
    this.anyScheduled = false;
    this.nextStart = 0;
    this.lastBlock = undefined;
    const ctx = this.ensureCtx();
    if (this.status !== "paused") ctx.resume().catch(() => {});
    void this.runStream(gen, from, this.abort.signal, replace).catch((e) => this.streamFailed(gen, e));
  }

  /** Speeds above 2x: the sources run faster (playbackRate) and the SoundTouch worklet puts the pitch back. Loaded on first use per context. */
  private async ensureStretch(ctx: CtxLike): Promise<void> {
    const st = this.deps.stretch;
    if (!st) return;
    this.stretchReady ??= (async () => {
      await st.register(ctx);
      if (this.ctx !== ctx) return;
      const node = st.create(ctx);
      node.connect(this.out);
      this.stretchNode = node;
    })();
    await this.stretchReady;
  }

  private async runStream(gen: number, from: number, signal: AbortSignal, replace: boolean) {
    const d = this.doc!;
    if (playbackRateFor(this.cfg.speed) > 1 && this.deps.stretch) {
      try {
        await this.ensureStretch(this.ensureCtx());
      } catch {
        /* no worklet (blocked or unsupported): fall back to plain playbackRate, the pitch rises */
      }
      if (gen !== this.gen) return;
    }
    let next = from;
    while (next < d.sentences.length) {
      const idxs: number[] = [];
      for (let i = next; i < d.sentences.length && idxs.length < CHUNK; i++)
        if (d.sentences[i]!.text.trim()) idxs.push(i);
      if (!idxs.length) break;
      await this.room(gen);
      if (gen !== this.gen) return;
      await this.requestWithLoadWait(gen, idxs, signal, replace && next === from);
      if (gen !== this.gen) return;
      next = idxs[idxs.length - 1]! + 1;
    }
    if (gen !== this.gen) return;
    this.streamDone = true;
    this.tick();
  }

  /** While the model loads (engine state loading or unloaded) a play request waits and retries instead of failing; frames already played are never repeated. */
  private async requestWithLoadWait(gen: number, idxs: number[], signal: AbortSignal, replace: boolean) {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let tries = 0; ; tries++) {
      const before = this.framesReceived;
      try {
        await this.requestChunk(gen, idxs, signal, replace);
        return;
      } catch (e) {
        const waits = e instanceof StreamError && e.code === "engine-not-ready" && this.framesReceived === before && tries < LOAD_WAIT_TRIES && gen === this.gen;
        if (!waits) throw e;
        const st = await this.deps.engineState?.().catch(() => undefined);
        if (st !== "loading" && st !== "unloaded") throw e;
        await sleep(1000);
        if (gen !== this.gen) return;
      }
    }
  }

  private requestChunk(gen: number, idxs: number[], signal: AbortSignal, replace = false) {
    return readChunk({
      fetch: this.deps.fetch,
      cfg: this.cfg,
      doc: this.doc!,
      idxs,
      signal,
      replace,
      current: () => gen === this.gen,
      room: () => this.room(gen),
      onAudio: (index, pcm, sampleRate, durationMs) => this.schedule(index, pcm, sampleRate, durationMs),
    });
  }

  private schedule(index: number, pcm: Int16Array, sampleRate: number, durationMs: number) {
    const ctx = this.ensureCtx();
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i]! / 32768;
    const src = ctx.createBufferSource();
    const rate = playbackRateFor(this.cfg.speed);
    src.buffer = buf;
    src.playbackRate.value = rate;
    this.lastRate = rate;
    src.connect(rate > 1 && this.stretchNode ? this.stretchNode.input : this.out);
    if (rate > 1) this.stretchNode?.setRate(rate);
    const block = this.doc!.sentences[index]!.block;
    const gap =
      this.lastBlock !== undefined && block !== this.lastBlock ? PAUSE_SECONDS[this.cfg.pause] : 0;
    this.lastBlock = block;
    const start = Math.max(this.nextStart + gap, ctx.currentTime + START_DELAY);
    if (this.nextStart > 0) this.maxLateMs = Math.max(this.maxLateMs, (start - this.nextStart - gap) * 1000);
    const end = start + durationMs / 1000 / rate;
    src.start(start);
    this.nextStart = end;
    this.items.push({ index, start, end, started: false, src });
    this.known[index] = durationMs / rate;
    this.framesReceived++;
    this.scheduledMs += durationMs;
    this.anyScheduled = true;
    if (this.status === "preparing") {
      this.status = "playing";
      this.emit();
    }
  }

  private room(gen: number): Promise<void> {
    if (gen !== this.gen || this.aheadCount() < LOOKAHEAD) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  private aheadCount() {
    return this.items.filter((i) => !i.started).length;
  }

  private wake() {
    if (this.aheadCount() >= LOOKAHEAD || !this.waiters.length) return;
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private streamFailed(gen: number, e: unknown) {
    if (gen !== this.gen) return;
    this.gen++;
    this.abort?.abort();
    this.stopSources();
    this.status = "error";
    this.clearTimer();
    this.hold.end();
    this.closeCtx();
    this.idleTimer.arm();
    if (e instanceof StreamError) this.error = { code: e.code, message: e.message };
    else if (e instanceof TypeError)
      this.error = {
        code: "app-not-running",
        message: "SpeakKit could not reach the app. Is it running?",
      };
    else
      this.error = {
        code: "synthesis-failed",
        message: e instanceof Error ? e.message : "Speech synthesis failed.",
      };
    this.emit();
  }

  private finish() {
    this.stopSources();
    this.clearTimer();
    this.hold.end();
    this.status = "finished";
    const next = this.autoPlay ? this.queue.shift() : undefined;
    if (!next) this.closeCtx();
    this.emit();
    if (next) {
      this.emitQueue();
      this.begin(next, next.startIndex);
    } else this.idleTimer.arm();
  }

  /** Abort network + audio without touching document state. */
  private halt() {
    this.gen++;
    this.replaceNext = !!this.abort && !this.streamDone;
    this.abort?.abort();
    this.abort = undefined;
    this.stopSources();
    this.cur = undefined;
    this.streamDone = false;
    this.anyScheduled = false;
  }

  private stopSources() {
    for (const it of this.items) {
      try {
        it.src.stop();
      } catch {
        /* not started */
      }
      this.release(it);
    }
    this.items = [];
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private rawDuration(it: Item) {
    return (it.end - it.start) * 1000 * playbackRateFor(this.cfg.speed);
  }

  /** Drop the decoded audio of a played (or cancelled) sentence so memory stays at the lookahead window. */
  private release(it: Item) {
    try {
      it.src.disconnect?.();
    } catch {
      /* already disconnected */
    }
    it.src.buffer = null;
  }

  // ---- plumbing ----

  private ensureTimer() {
    if (this.timer !== undefined) return;
    const set = this.deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.timer = set(() => this.tick(), 50);
  }

  private clearTimer() {
    if (this.timer === undefined) return;
    (this.deps.clearInterval ?? ((id) => clearInterval(id as number)))(this.timer);
    this.timer = undefined;
  }

  private emit() {
    this.lastElapsedEmit = (this.deps.now ?? Date.now)();
    this.deps.emitState(this.state());
  }

  private emitQueue() {
    this.deps.emitQueue?.(this.queueItems());
  }
}
