import { createHistory, historyStats, type History } from "./history";
import type { Target } from "./paste-plan";
import { foreground, runJob, type Job, type Outcome } from "./pipeline";
import { initialSession, MAX_RECORDING_MS, reduce, TAIL_MS, type Effect, type Session, type SessionEvent } from "./session";
import { defaultSettings, type Settings } from "./settings";
import type { Clip, Dictation, DictationDeps, DictationErrorCode, DictationState, Notice, Unsubscribe } from "./types";

const ERROR_MS = 4000;
const NOTICE_MS = 1200;

type Flash = { error: DictationErrorCode } | { notice: Notice };

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
    this.store = createHistory({ storage: deps.storage, clock: deps.clock, retention: () => this.settings.retention, ...(deps.audio && { audio: deps.audio }), terms: () => this.settings.terms });
    this.history = {
      list: (query) => this.store.list(query),
      get: (id) => this.store.get(id),
      copy: (id) => this.copy(id),
      recent: async (n) => (await this.store.list({ limit: n })).map(({ via: _via, ...e }) => e),
      remove: (id) => this.store.remove(id),
      clear: () => this.store.clear(),
      stats: async () => historyStats(await this.store.list()),
      status: () => this.store.status(),
      preservedAs: () => this.store.preservedAs(),
      addVersion: (id, v) => this.store.addVersion(id, v),
      useVersion: (id, vid) => this.store.useVersion(id, vid),
      audio: (id) => this.recording(id),
      dropAudio: (files) => this.store.dropAudio(files),
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
    if (this.flashed && "error" in this.flashed) return { status: "error", code: this.flashed.error };
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
    this.dispatch({ type: "cancel" });
    this.disposed = true;
    this.cancelFlash?.();
    this.unsubscribe?.();
    this.listeners.clear();
  }

  private dispatch(event: SessionEvent): boolean {
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
        return this.finishRecording(effect.id);
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
    this.endLimit();
    this.cancelLimit = this.deps.clock.after(MAX_RECORDING_MS, () => this.dispatch({ type: "limit", id }));
    this.targets.set(id, foreground(this.deps.inserter));
    void this.inRecorderOrder(async () => {
      const failure = await tryStart(this.deps, prerollMs);
      if (!failure) return;
      this.failedStarts.add(id);
      this.dispatch({ type: "failed", id });
      this.flash({ error: failure });
    });
  }

  private discardRecording(id: number, cancelled: boolean): void {
    this.targets.delete(id);
    if (cancelled) this.flash({ notice: { kind: "cancelled" } });
    void this.inRecorderOrder(async () => {
      if (this.failedStarts.delete(id)) return;
      try {
        await this.deps.recorder.discard();
      } catch {
        // Nothing is left to discard if the recorder already stopped.
      }
    });
  }

  private finishRecording(id: number): void {
    this.pending++;
    const clip: Promise<Clip | undefined> = this.inRecorderOrder(async () => {
      if (this.failedStarts.delete(id)) return undefined;
      await new Promise<void>((resolve) => this.deps.clock.after(TAIL_MS, resolve));
      return this.deps.recorder.stop();
    });
    const job: Job = { clip, target: this.targets.get(id) ?? Promise.resolve(undefined) };
    this.targets.delete(id);
    this.jobQueue = this.jobQueue.then(() => this.process(job));
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
    this.cancelFlash = this.deps.clock.after("error" in what ? ERROR_MS : NOTICE_MS, () => {
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

  /** The kept recording of an entry; a recording that cannot be read is no recording. */
  private async recording(id: string): Promise<Clip | undefined> {
    const file = (await this.store.get(id))?.audio;
    if (!file || !this.deps.audio) return undefined;
    try {
      return await this.deps.audio.load(file);
    } catch {
      return undefined;
    }
  }

  private async copy(id: string): Promise<boolean> {
    const entry = await this.store.get(id);
    if (!entry) return false;
    const req = { text: entry.text, plan: { method: "copy", reason: "manual" } } as const;
    try {
      return (await this.deps.inserter.insert(req)).ok;
    } catch {
      return false; // the clipboard could not be written
    }
  }
}

/** Dictation: hold or toggle a key, speak, and the text goes into the window you were in. Everything outside the process is in `deps`. */
export function createDictation(deps: DictationDeps): Dictation {
  return new Runtime(deps);
}
