import { MAX_SPEED, MIN_SPEED, type PlayerCommand, type PlayerState, type PlayerStatus, type ReadDoc } from "@speakkit/protocol";
import type { PlayerDeps } from "./deps";
import { toPlayerError } from "./errors";
import { IdleTimer, ModelHold, RepeatTimer } from "./lifecycle";
import { AudioOutput } from "./output";
import { PlayerProbe } from "./probe";
import { DocQueue } from "./queue";
import { Scheduler } from "./scheduler";
import { playerState } from "./state";
import { StreamRun } from "./stream-run";
import { Timeline, blockJump, nearestSentence } from "./timeline";
import { isActive, isEnded, transition, type PlayerEvent } from "./transition";
import type { PlayerConfig, QueueItem } from "./types";

const ELAPSED_EMIT_MS = 500;
const TICK_MS = 50;

const clampSpeed = (s: number) => Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));

type Handlers = { [K in PlayerCommand["cmd"]]: (cmd: Extract<PlayerCommand, { cmd: K }>, cfg?: PlayerConfig) => void };

/** Streams a document from the server and plays it gapless: owns the status, the sentence position, the queue and every timer. */
export class Player {
  cfg: PlayerConfig;
  /** false: the queue waits when a document ends */
  autoPlay = true;
  /** Test hooks, read by the offscreen document's window.__speakkit. */
  readonly probe: PlayerProbe;

  private deps: PlayerDeps;
  private output: AudioOutput;
  private sched: Scheduler;
  private queue = new DocQueue();
  private run = new StreamRun();
  private doc: ReadDoc | undefined;
  private status: PlayerStatus = "idle";
  private error: PlayerState["error"];
  private idx = 0;
  private timeline = new Timeline(() => this.cfg.speed);
  private lastElapsedEmit = 0;
  private hold: ModelHold;
  private idleTimer: IdleTimer;
  private ticker: RepeatTimer;
  private handlers: Handlers = {
    play: (c, cfg) => {
      if (cfg) this.applyDefaults(cfg);
      this.begin(c.doc, c.doc.startIndex);
    },
    pause: () => this.pause(),
    resume: () => this.resume(),
    toggle: () => this.toggle(),
    stop: () => this.stop(),
    "seek-ms": (c) => this.seek((n) => nearestSentence(n, (i) => this.timeline.durationMs(i), this.elapsedMs() + c.deltaMs)),
    "seek-sentence": (c) => this.seek((n) => Math.max(0, Math.min(Math.round(c.index), n - 1))),
    "next-block": () => this.seek(() => blockJump(this.doc!.sentences, this.idx, 1)),
    "prev-block": () => this.seek(() => blockJump(this.doc!.sentences, this.idx, -1)),
    "set-speed": (c) => {
      this.cfg.speed = clampSpeed(c.speed);
      this.reconfigure();
    },
    "set-voice": (c) => {
      this.cfg.voice = c.voice;
      this.reconfigure();
    },
    "queue-add": (c, cfg) => this.queueAdd(c.doc, cfg),
    "queue-play": (c) => {
      const doc = this.queue.take(c.docId);
      if (!doc) return;
      this.emitQueue();
      this.begin(doc, doc.startIndex);
    },
    "queue-remove": (c) => this.queueChanged(() => this.queue.remove(c.docId)),
    "queue-clear": () => this.queueChanged(() => this.queue.clear()),
  };

  constructor(deps: PlayerDeps, cfg: PlayerConfig, wantAnalyser = false) {
    this.deps = deps;
    this.cfg = { ...cfg };
    this.output = new AudioOutput(deps, wantAnalyser);
    this.sched = new Scheduler(this.output);
    this.probe = new PlayerProbe(this.output, this.sched);
    this.hold = new ModelHold(deps);
    this.ticker = new RepeatTimer(deps, () => this.tick(), TICK_MS);
    this.idleTimer = new IdleTimer(deps, () => {
      if (!isEnded(this.status)) return;
      if (this.queue.length === 0) this.deps.onIdle?.();
      else this.idleTimer.arm();
    });
  }

  /** Applies one command. `cfg` carries the server port, token and pause setting (and the voice and speed for commands that start a document). */
  command(cmd: PlayerCommand, cfg?: PlayerConfig): void {
    if (cfg) Object.assign(this.cfg, { port: cfg.port, token: cfg.token, pause: cfg.pause });
    (this.handlers[cmd.cmd] as (c: PlayerCommand, cfg?: PlayerConfig) => void)(cmd, cfg);
  }

  state(): PlayerState {
    const { status, doc, error, idx, cfg, queue, timeline } = this;
    return playerState({ status, doc, error, cfg, sentenceIndex: idx, elapsedMs: Math.round(this.elapsedMs()), totalMs: Math.round(timeline.totalMs()), queueLength: queue.length });
  }

  queueItems(): QueueItem[] {
    return this.queue.items(this.cfg.speed);
  }

  elapsedMs(): number {
    if (!this.doc) return 0;
    if (this.status === "finished") return this.timeline.totalMs();
    const ctx = this.output.current;
    const cur = this.sched.cur;
    return this.timeline.elapsedMs(this.idx, cur && ctx ? (ctx.currentTime - cur.start) * 1000 : 0);
  }

  /** Advance sentence boundaries, retire finished items, wake the stream reader. Runs on a timer while a document is loaded. */
  tick(): void {
    const ctx = this.output.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const started = this.sched.takeStarted(now);
    for (const it of started) {
      this.idx = it.index;
      this.emit();
      const d = this.doc;
      if (d) this.deps.emitSentence({ docId: d.docId, index: it.index, durationMs: this.sched.rawDuration(it, this.cfg.speed), speed: this.cfg.speed }, d.tabId);
    }
    this.sched.retire(now);
    if (this.run.done && this.sched.isDrained() && this.to("finish")) this.finish();
    else if (!started.length && this.status === "playing" && (this.deps.now ?? Date.now)() - this.lastElapsedEmit >= ELAPSED_EMIT_MS) this.emit();
  }

  /** Stops playback and releases the audio context, the timers and the model hold; nothing is emitted and the idle timer does not run. The player is reusable afterwards. */
  dispose(): void {
    this.halt();
    this.release();
    this.idleTimer.cancel();
    this.doc = undefined;
    this.to("stop");
  }

  /** Moves the status by `event`; false (nothing changed) when the event does not apply in the current status. */
  private to(event: PlayerEvent): boolean {
    const next = transition(this.status, event);
    if (next !== undefined) this.status = next;
    return next !== undefined;
  }

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
    this.to("begin");
    this.startStream(this.idx);
    this.ticker.start();
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

  private pause() {
    if (!this.to("pause")) return;
    this.output.current?.suspend().catch(() => {});
    this.hold.start();
    this.emit();
  }

  private resume() {
    if (!this.to(this.sched.anyScheduled ? "resume-playing" : "resume-preparing")) return;
    this.hold.end();
    this.output.current?.resume().catch(() => {}); // closed while resuming (stop): nothing to do
    this.emit();
  }

  private toggle() {
    if (this.status === "paused") this.resume();
    else if (transition(this.status, "pause") !== undefined) this.pause();
    else if (this.doc) this.begin(this.doc, 0);
  }

  private stop() {
    this.halt();
    this.doc = undefined;
    this.timeline.reset([]);
    this.idx = 0;
    this.error = undefined;
    this.to("stop");
    this.release();
    this.emit();
    this.idleTimer.arm();
  }

  /** Restart from the sentence `target` picks (given the sentence count); nothing happens without a document or when it picks none. */
  private seek(target: (count: number) => number | undefined) {
    const count = this.doc?.sentences.length;
    const to = count ? target(count) : undefined;
    if (to !== undefined) this.restartFrom(to);
  }

  /** Speed or voice changed: re-request from the sentence being heard. */
  private reconfigure() {
    if (this.doc && !isEnded(this.status)) this.restartFrom(this.idx);
    else this.emit();
  }

  /** Abort the stream, drop scheduled audio and request again starting at sentence i, keeping paused/playing intent. */
  private restartFrom(i: number) {
    if (!this.doc) return;
    this.halt();
    this.timeline.forget(i);
    this.idx = i;
    this.error = undefined;
    this.to("restart");
    this.startStream(i);
    this.ticker.start();
    this.emit();
  }

  private startStream(from: number) {
    const ctx = this.output.ensure();
    if (this.status !== "paused") ctx.resume().catch(() => {});
    const onAudio = (index: number, pcm: Int16Array, sampleRate: number, durationMs: number) => this.schedule(index, pcm, sampleRate, durationMs);
    const job = { doc: this.doc!, cfg: this.cfg, deps: this.deps, output: this.output, sched: this.sched, from, onAudio };
    this.run.start(
      job,
      () => this.tick(),
      (e) => this.streamFailed(e),
    );
  }

  private schedule(index: number, pcm: Int16Array, sampleRate: number, durationMs: number) {
    const block = this.doc!.sentences[index]!.block;
    this.timeline.set(index, this.sched.schedule({ index, block, pcm, sampleRate, durationMs }, this.cfg.speed, this.cfg.pause));
    if (this.to("audio")) this.emit();
  }

  private streamFailed(e: unknown) {
    this.sched.halt();
    this.to("fail");
    this.release();
    this.idleTimer.arm();
    this.error = toPlayerError(e);
    this.emit();
  }

  private finish() {
    this.sched.halt();
    this.ticker.stop();
    this.hold.end();
    const next = this.autoPlay ? this.queue.shift() : undefined;
    if (!next) this.output.close();
    this.emit();
    if (!next) return this.idleTimer.arm();
    this.emitQueue();
    this.begin(next, next.startIndex);
  }

  /** Stop the tick timer and the model hold and close the audio context. */
  private release() {
    this.ticker.stop();
    this.hold.end();
    this.output.close();
  }

  /** Abort network + audio without touching document state. */
  private halt() {
    this.run.halt();
    this.sched.halt();
  }

  private emit() {
    this.lastElapsedEmit = (this.deps.now ?? Date.now)();
    this.deps.emitState(this.state());
  }

  private emitQueue() {
    this.deps.emitQueue?.(this.queueItems());
  }
}
