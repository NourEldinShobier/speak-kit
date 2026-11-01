import { MAX_SPEED, MIN_SPEED, type PlayerCommand, type PlayerState, type PlayerStatus, type ReadDoc } from "@speakkit/protocol";
import type { PlayerDeps } from "./deps";
import { StreamError, mapHttpError } from "./errors";
import { IDLE_CLOSE_MS, IdleTimer, ModelHold } from "./lifecycle";
import { AudioOutput } from "./output";
import { PlayerProbe } from "./probe";
import { DocQueue } from "./queue";
import { playbackRateFor } from "./rate";
import { Scheduler } from "./scheduler";
import { runStream } from "./stream";
import { Timeline, blockJump, nearestSentence } from "./timeline";
import type { PlayerConfig, QueueItem } from "./types";

export { mapHttpError, IDLE_CLOSE_MS, playbackRateFor };
export type { BufferLike, CtxLike, PlayerDeps, SourceLike, StretchDeps, StretchNode } from "./deps";

const ELAPSED_EMIT_MS = 500;

const clampSpeed = (s: number) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));

const isActive = (s: PlayerStatus) => s === "playing" || s === "paused" || s === "preparing";

export class Player {
  cfg: PlayerConfig;
  /** false: the queue waits when a document ends */
  autoPlay = true;

  private output: AudioOutput;
  private sched: Scheduler;
  private queue = new DocQueue();
  private doc: ReadDoc | undefined;
  private status: PlayerStatus = "idle";
  private error: PlayerState["error"];
  private idx = 0;
  private timeline = new Timeline(() => this.cfg.speed);
  private gen = 0;
  private abort: AbortController | undefined;
  private streamDone = false;
  private timer: unknown;
  private lastElapsedEmit = 0;
  private replaceNext = false;
  private hold: ModelHold;
  private idleTimer: IdleTimer;

  constructor(
    private deps: PlayerDeps,
    cfg: PlayerConfig,
    wantAnalyser = false,
  ) {
    this.cfg = { ...cfg };
    this.output = new AudioOutput(deps, wantAnalyser);
    this.sched = new Scheduler(this.output);
    this.probe = new PlayerProbe(this.output, this.sched);
    this.hold = new ModelHold(deps);
    this.idleTimer = new IdleTimer(deps, () => {
      if (this.status === "idle" || this.status === "finished" || this.status === "error") {
        if (this.queue.length === 0) this.deps.onIdle?.();
        else this.idleTimer.arm();
      }
    });
  }

  /** Test hooks, read by the offscreen document's window.__speakkit. */
  readonly probe: PlayerProbe;

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
        return this.begin(cmd.doc, cmd.doc.startIndex);
      case "pause":
        return this.pause();
      case "resume":
        return this.resume();
      case "toggle":
        return this.toggle();
      case "stop":
        return this.stop();
      case "seek-ms":
        return this.seekMs(cmd.deltaMs);
      case "seek-sentence":
        return this.seekSentence(cmd.index);
      case "next-block":
        return this.jumpBlock(1);
      case "prev-block":
        return this.jumpBlock(-1);
      case "set-speed":
        return this.setSpeed(cmd.speed);
      case "set-voice":
        return this.setVoice(cmd.voice);
      case "queue-add":
        return this.queueAdd(cmd.doc, cfg);
      case "queue-play":
        return this.queuePlay(cmd.docId);
      case "queue-remove":
        return this.queueChanged(() => this.queue.remove(cmd.docId));
      case "queue-clear":
        return this.queueChanged(() => this.queue.clear());
    }
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
      totalMs: Math.round(this.timeline.totalMs()),
      speed: this.cfg.speed,
      voice: this.cfg.voice,
      error: this.error,
      queueLength: this.queue.length,
    };
  }

  queueItems(): QueueItem[] {
    return this.queue.items(this.cfg.speed);
  }

  elapsedMs(): number {
    if (!this.doc) return 0;
    let t = this.timeline.startMs(this.idx);
    const ctx = this.output.current;
    const cur = this.sched.cur;
    if (cur && ctx) t += Math.max(0, Math.min((ctx.currentTime - cur.start) * 1000, this.timeline.durationMs(this.idx)));
    if (this.status === "finished") t = this.timeline.totalMs();
    return t;
  }

  /** Advance sentence boundaries, retire finished items, wake the stream reader. Runs on a timer while a document is loaded. */
  tick(): void {
    const ctx = this.output.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    let changed = false;
    for (const it of this.sched.takeStarted(now)) {
      this.idx = it.index;
      changed = true;
      this.emit();
      const d = this.doc;
      if (d) this.deps.emitSentence({ docId: d.docId, index: it.index, durationMs: this.sched.rawDuration(it, this.cfg.speed), speed: this.cfg.speed }, d.tabId);
    }
    this.sched.retire(now);
    if (this.streamDone && this.sched.isDrained() && (this.status === "playing" || this.status === "preparing")) {
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
    this.timeline.reset(doc.sentences);
    this.idx = Math.max(0, Math.min(from, doc.sentences.length - 1));
    this.error = undefined;
    this.status = "preparing";
    this.sched.framesReceived = 0;
    this.sched.scheduledMs = 0;
    this.startStream(this.idx);
    this.ensureTimer();
    this.emit();
  }

  private queueAdd(doc: ReadDoc, cfg?: PlayerConfig) {
    if (!isActive(this.status) && !this.queue.length) {
      if (cfg) this.applyDefaults(cfg);
      this.begin(doc, doc.startIndex);
      return;
    }
    if (this.doc?.docId !== doc.docId) this.queue.add(doc);
    this.emitQueue();
    this.emit();
  }

  private queueChanged(change: () => void) {
    change();
    this.emitQueue();
    this.emit();
  }

  private queuePlay(docId: string) {
    const doc = this.queue.take(docId);
    if (!doc) return;
    this.emitQueue();
    this.begin(doc, doc.startIndex);
  }

  private pause() {
    if (this.status !== "playing" && this.status !== "preparing") return;
    this.status = "paused";
    this.output.current?.suspend().catch(() => {});
    this.hold.start();
    this.emit();
  }

  private resume() {
    if (this.status !== "paused") return;
    this.status = this.sched.anyScheduled ? "playing" : "preparing";
    this.hold.end();
    this.output.current?.resume().catch(() => {}); // closed while resuming (stop): nothing to do
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
    this.timeline.reset([]);
    this.idx = 0;
    this.error = undefined;
    this.status = "idle";
    this.clearTimer();
    this.hold.end();
    this.output.close();
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
    this.restartFrom(nearestSentence(d.sentences.length, (i) => this.timeline.durationMs(i), this.elapsedMs() + delta));
  }

  private jumpBlock(dir: 1 | -1) {
    const d = this.doc;
    if (!d || !d.sentences.length) return;
    const to = blockJump(d.sentences, this.idx, dir);
    if (to !== undefined) this.restartFrom(to);
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
    if (this.doc && this.status !== "idle" && this.status !== "error" && this.status !== "finished") this.restartFrom(this.idx);
    else this.emit();
  }

  /** Abort the stream, drop scheduled audio and request again starting at sentence i, keeping paused/playing intent. */
  private restartFrom(i: number) {
    const d = this.doc;
    if (!d) return;
    const wasPaused = this.status === "paused";
    this.halt();
    this.timeline.forget(i);
    this.idx = i;
    this.error = undefined;
    this.status = wasPaused ? "paused" : "preparing";
    this.startStream(i);
    this.ensureTimer();
    this.emit();
  }

  // ---- streaming ----

  private startStream(from: number) {
    const gen = ++this.gen;
    const replace = this.replaceNext;
    this.replaceNext = false;
    this.abort = new AbortController();
    this.streamDone = false;
    const ctx = this.output.ensure();
    if (this.status !== "paused") ctx.resume().catch(() => {});
    const current = () => gen === this.gen;
    runStream({
      doc: this.doc!,
      cfg: this.cfg,
      deps: this.deps,
      output: this.output,
      sched: this.sched,
      signal: this.abort.signal,
      current,
      from,
      replace,
      onAudio: (index, pcm, sampleRate, durationMs) => this.schedule(index, pcm, sampleRate, durationMs),
    })
      .then((done) => {
        if (!done) return;
        this.streamDone = true;
        this.tick();
      })
      .catch((e) => this.streamFailed(gen, e));
  }

  private schedule(index: number, pcm: Int16Array, sampleRate: number, durationMs: number) {
    const block = this.doc!.sentences[index]!.block;
    this.timeline.set(index, this.sched.schedule({ index, block, pcm, sampleRate, durationMs }, this.cfg.speed, this.cfg.pause));
    if (this.status === "preparing") {
      this.status = "playing";
      this.emit();
    }
  }

  private streamFailed(gen: number, e: unknown) {
    if (gen !== this.gen) return;
    this.gen++;
    this.abort?.abort();
    this.sched.halt();
    this.status = "error";
    this.clearTimer();
    this.hold.end();
    this.output.close();
    this.idleTimer.arm();
    if (e instanceof StreamError) this.error = { code: e.code, message: e.message };
    else if (e instanceof TypeError) this.error = { code: "app-not-running", message: "SpeakKit could not reach the app. Is it running?" };
    else this.error = { code: "synthesis-failed", message: e instanceof Error ? e.message : "Speech synthesis failed." };
    this.emit();
  }

  private finish() {
    this.sched.halt();
    this.clearTimer();
    this.hold.end();
    this.status = "finished";
    const next = this.autoPlay ? this.queue.shift() : undefined;
    if (!next) this.output.close();
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
    this.sched.halt();
    this.streamDone = false;
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
