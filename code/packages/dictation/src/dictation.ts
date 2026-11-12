import { TAIL_MIN_MS, tailDone } from "./capture/policy";
import { createHistory, type History } from "./history";
import { copyEntry, insertEntry } from "./history-actions";
import type { Target } from "./paste-plan";
import { failureOf, foreground, pasteLast, runJob, type Job, type Outcome } from "./pipeline";
import { initialSession, MAX_RECORDING_MS, reduce, type Effect, type Session, type SessionEvent } from "./session";
import { defaultSettings, type Settings } from "./settings";
import type { CaptureHandle, CaptureResult, Clip, Dictation, DictationDeps, DictationErrorCode, DictationState, Notice, Unsubscribe } from "./types";

const ERROR_MS = 4000;
const NOTICE_MS = 1200;
/** A cancelled recording can be brought back for this long. */
const UNDO_MS = 60_000;
/** How long the "Cancelled" notice with its Undo button stays on screen. */
const UNDO_NOTICE_MS = 10_000;
const TAIL_POLL_MS = 50;

const flashMs = (notice: Notice): number => (notice.kind === "cancelled" && notice.undoable ? UNDO_NOTICE_MS : NOTICE_MS);

type Flash = { error: DictationErrorCode; owner?: string } | { notice: Notice };

async function tryStart(deps: DictationDeps, prerollMs: number): Promise<DictationErrorCode | undefined> {
  try {
    const started = await deps.recorder.start({ prerollMs });
    return started.ok ? undefined : started.code;
  } catch {
    return "mic-failed"; // a recorder that throws is a microphone that cannot be used
  }
}

class Runtime implements Dictation {
  private settings: Settings;
  private session: Session = initialSession;
  private recorderQueue: Promise<unknown> = Promise.resolve();
  private jobQueue: Promise<void> = Promise.resolve();
  private readonly failedStarts = new Set<number>();
  private readonly targets = new Map<number, Promise<Target | undefined>>();
  private pending = 0;
  private phase: "transcribing" | "pasting" = "transcribing";
  private flashed: Flash | undefined;
  private cancelFlash: Unsubscribe | undefined;
  private cancelLimit: Unsubscribe | undefined;
  private readonly captures = new Map<number, (r: CaptureResult) => void>();
  private cancelledClip: Clip | undefined;
  private noUndo = false;
  private readonly rawCaptures = new Set<number>();
  private dropCancelled: Unsubscribe | undefined;
  private readonly listeners = new Set<(state: DictationState) => void>();
  private lastState: string;
  private unsubscribe: Unsubscribe | undefined;
  private disposed = false;
  private readonly store: History;
  private readonly live: Promise<boolean>;
  readonly history: Dictation["history"];
  private readonly deps: DictationDeps;

  constructor(deps: DictationDeps) {
    this.deps = deps;
    this.settings = { ...defaultSettings, ...deps.settings };
    this.store = createHistory({ storage: deps.storage, clock: deps.clock, retention: () => this.settings.retention });
    this.history = {
      list: (query) => this.store.list(query),
      copy: (id) => copyEntry({ store: this.store, deps: this.deps }, id),
      insert: (id) => (this.disposed ? Promise.resolve(false) : insertEntry({ store: this.store, deps: this.deps, settings: this.settings }, id)),
      remove: (id) => this.store.remove(id),
      removeMany: (ids) => this.store.removeMany(ids),
      stats: () => this.store.stats(),
      clear: () => this.store.clear(),
    };
    this.lastState = JSON.stringify(this.state());
    this.live = this.install();
  }

  private install(): Promise<boolean> {
    return this.deps.hotkeys
      .subscribe((e) => !this.disposed && this.dispatch({ type: "key", key: e.key, down: e.down, at: e.at }))
      .then(
        (unsubscribe) => {
          if (this.disposed) unsubscribe();
          else this.unsubscribe = unsubscribe;
          return true;
        },
        () => {
          this.flash({ error: "hotkey-failed" });
          return false;
        },
      );
  }

  state(): DictationState {
    const c = this.session.capture;
    if (c.kind === "hold" || c.kind === "toggle") return { status: "recording", mode: c.kind };
    if (c.kind === "locked") return { status: "locked" };
    if (this.pending > 0) return { status: this.phase };
    if (this.flashed && "error" in this.flashed) return { status: "error", code: this.flashed.error, ...(this.flashed.owner && { owner: this.flashed.owner }) };
    return this.flashed ? { status: "idle", notice: this.flashed.notice } : { status: "idle" };
  }

  subscribe(listener: (state: DictationState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  ready = (): Promise<boolean> => this.live;

  configure(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    void this.store.prune();
  }

  start(): void {
    if (!this.disposed) this.dispatch({ type: "start", at: this.deps.clock.now() });
  }

  stop(): void {
    this.dispatch({ type: "stop" });
  }

  cancel(): void {
    this.dispatch({ type: "cancel" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.noUndo = true; // shutting down: the audio is dropped, not kept for an undo
    this.dispatch({ type: "cancel" });
    this.disposed = true;
    this.cancelFlash?.();
    this.dropCancelled?.();
    this.unsubscribe?.();
    this.listeners.clear();
  }

  /** True when a press that would begin a recording must wait because another feature has the microphone. */
  private micTaken(event: SessionEvent): boolean {
    const owner = this.deps.micOwner?.();
    const c = this.session.capture.kind;
    if (!owner || (c !== "idle" && c !== "armed")) return false;
    const { hotkey, secondKey, mouseKey, rawKey } = this.settings;
    const begins = event.type === "start" || (event.type === "key" && event.down && !!event.key && [hotkey, secondKey, mouseKey, rawKey].includes(event.key));
    if (begins) this.flash({ error: "mic-in-use", owner });
    return begins;
  }

  private dispatch(event: SessionEvent): boolean {
    if (this.micTaken(event)) return true;
    const step = reduce(this.session, event, this.settings);
    this.session = step.session;
    if (!("id" in step.session.capture)) this.endLimit();
    for (const effect of step.effects) this.run(effect);
    this.emit();
    return step.consumed;
  }

  private run(effect: Effect): void {
    switch (effect.type) {
      case "start-recording":
        return this.startRecording(effect.id, effect.prerollMs);
      case "finish-recording":
        return this.finishRecording(effect.id, effect.raw === true);
      case "discard-recording":
        return this.discardRecording(effect.id, effect.cancelled);
      default:
        return effect satisfies never;
    }
  }

  // Recorder calls run one after another, so a press during the release tail waits for the old clip and a late release waits for a cold microphone.
  private inRecorderOrder<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.recorderQueue.then(fn);
    this.recorderQueue = result.then(
      () => undefined,
      () => undefined, // this step failed; the next one still runs, and its caller sees the rejection through `result`
    );
    return result;
  }

  private endLimit(): void {
    this.cancelLimit?.();
    this.cancelLimit = undefined;
  }

  private startRecording(id: number, prerollMs: number): void {
    this.flashed = undefined;
    this.cancelFlash?.();
    this.dropCancelled?.();
    this.cancelledClip = undefined;
    this.endLimit();
    this.cancelLimit = this.deps.clock.after(MAX_RECORDING_MS, () => this.dispatch({ type: "limit", id }));
    this.targets.set(id, foreground(this.deps.inserter));
    void this.inRecorderOrder(async () => {
      const failure = await tryStart(this.deps, prerollMs);
      if (!failure) return;
      this.failedStarts.add(id);
      this.settleCapture(id, { ok: false, code: failure });
      this.dispatch({ type: "failed", id });
      this.flash({ error: failure });
    });
  }

  private discardRecording(id: number, cancelled: boolean): void {
    this.targets.delete(id);
    this.settleCapture(id, { ok: false, code: "cancelled" });
    if (cancelled) this.flash({ notice: this.noUndo ? { kind: "cancelled" } : { kind: "cancelled", undoable: true } });
    void this.inRecorderOrder(async () => {
      if (this.failedStarts.delete(id)) return;
      try {
        if (cancelled && !this.noUndo) return this.keepCancelled(await this.deps.recorder.stop());
        await this.deps.recorder.discard();
      } catch {
        // Nothing is left to discard if the recorder already stopped.
      }
    });
  }

  private keepCancelled(clip: Clip): void {
    this.dropCancelled?.();
    this.cancelledClip = clip;
    this.dropCancelled = this.deps.clock.after(UNDO_MS, () => (this.cancelledClip = undefined));
  }

  undoCancel(): boolean {
    const clip = this.cancelledClip;
    if (!clip || this.disposed) return false;
    this.cancelledClip = undefined;
    this.dropCancelled?.();
    this.pending++;
    this.jobQueue = this.jobQueue.then(() => this.process({ clip: Promise.resolve(clip), target: foreground(this.deps.inserter) }));
    this.emit();
    return true;
  }

  pasteLast(): Promise<"pasted" | "copied" | "empty" | "failed"> {
    return pasteLast({ deps: this.deps, history: this.store, settings: this.settings });
  }

  capture(opts: { raw?: boolean } = {}): CaptureHandle {
    let settle: (r: CaptureResult) => void = () => undefined;
    const result = new Promise<CaptureResult>((resolve) => (settle = resolve));
    const busy = this.disposed || this.session.capture.kind !== "idle" || this.pending > 0;
    if (busy) settle({ ok: false, code: "busy" });
    else {
      const before = this.session.seq;
      this.dispatch({ type: "start", at: this.deps.clock.now() });
      const id = this.session.seq;
      if (id === before) settle({ ok: false, code: "busy" });
      else {
        this.captures.set(id, settle);
        if (opts.raw) this.rawCaptures.add(id);
      }
    }
    const owned = () => [...this.captures.entries()].find(([, s]) => s === settle)?.[0];
    return {
      result,
      finish: () => {
        if (owned() !== undefined) this.dispatch({ type: "stop" });
      },
      cancel: () => {
        if (owned() !== undefined) this.dispatch({ type: "cancel" });
      },
    };
  }

  private settleCapture(id: number, r: CaptureResult): void {
    const settle = this.captures.get(id);
    this.captures.delete(id);
    this.rawCaptures.delete(id);
    settle?.(r);
  }

  private finishRecording(id: number, raw: boolean): void {
    this.pending++;
    const clip: Promise<Clip | undefined> = this.inRecorderOrder(async () => {
      if (this.failedStarts.delete(id)) return undefined;
      await this.tail();
      return this.deps.recorder.stop();
    });
    const owned = this.captures.has(id);
    const job: Job = {
      clip,
      target: this.targets.get(id) ?? Promise.resolve(undefined),
      ...((raw || this.rawCaptures.has(id)) && { raw: true }),
      ...(owned && { print: (r: CaptureResult) => this.settleCapture(id, r) }),
    };
    this.targets.delete(id);
    this.jobQueue = this.jobQueue.then(() => this.process(job));
  }

  /** Waits the minimum tail, then a little longer (up to the cap) while the person is still speaking. */
  private async tail(): Promise<void> {
    const from = this.deps.clock.now();
    const wait = (ms: number) => new Promise<void>((resolve) => this.deps.clock.after(ms, resolve));
    await wait(TAIL_MIN_MS);
    while (!tailDone(this.deps.clock.now() - from, this.deps.recorder.speaking?.())) await wait(TAIL_POLL_MS);
  }

  private async process(job: Job): Promise<void> {
    this.phase = "transcribing";
    const ctx = { deps: this.deps, history: this.store, settings: this.settings, inserting: () => this.insertingNow() };
    let outcome: Outcome | undefined;
    try {
      outcome = await runJob(ctx, job);
    } catch {
      outcome = { error: "failed" }; // a port that throws must not stop the queue
    }
    this.pending--;
    // Printed text settled its capture already; anything else that ends a capture settles it here.
    job.print?.(failureOf(outcome));
    if (outcome) this.flash(outcome);
    else this.emit();
  }

  private insertingNow(): void {
    this.phase = "pasting";
    this.emit();
  }

  private flash(what: Flash): void {
    this.cancelFlash?.();
    this.flashed = what;
    const ms = "error" in what ? ERROR_MS : flashMs(what.notice);
    this.cancelFlash = this.deps.clock.after(ms, () => {
      this.flashed = undefined;
      this.emit();
    });
    this.emit();
  }

  private emit(): void {
    const state = this.state();
    const text = JSON.stringify(state);
    if (text === this.lastState) return;
    this.lastState = text;
    for (const listener of this.listeners) listener(state);
  }
}

/** Dictation: hold or toggle a key, speak, and the text goes into the window you were in. Everything outside the process is in `deps`. */
export function createDictation(deps: DictationDeps): Dictation {
  return new Runtime(deps);
}
