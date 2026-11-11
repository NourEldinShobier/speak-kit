import type { Clip, Clock, DictationDeps, HistoryStorage, HotkeySource, Inserter, KeyEvent, Recorder, Target, Transcriber, TranscribeResult } from "../src";
import { createDictation, type Dictation } from "../src";
import type { Settings } from "../src";

export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function fakeClock(start = 1_000_000) {
  let now = start;
  let timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = {
    now: () => now,
    after(ms, fn) {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
  };
  /** Moves time forward, firing timers in order and letting pending promises settle after each. */
  const advance = async (ms: number): Promise<void> => {
    await flush();
    const end = now + ms;
    for (;;) {
      const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      now = next.at;
      next.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  return { clock, advance, pending: () => timers.length };
}

export const loud = (extra: Partial<Clip> = {}): Clip => ({ pcm: new Float32Array(16000), sampleRate: 16000, peak: 0.5, ...extra });

export const target = (extra: Partial<Target> = {}): Target => ({ id: "win-1", exe: "notepad.exe", elevated: false, passwordField: false, ...extra });

export function fakeKeyboard() {
  let handler: ((e: KeyEvent) => boolean) | undefined;
  let installs = 0;
  const source: HotkeySource = {
    subscribe: async (h) => {
      handler = h;
      installs++;
      return () => {
        handler = undefined;
      };
    },
  };
  return {
    source,
    installs: () => installs,
    attached: () => handler !== undefined,
    /** Sends one key event and returns whether dictation consumed it. */
    send: (key: string, down: boolean, at: number): boolean => handler?.({ key, down, at }) ?? false,
  };
}

export function fakeRecorder() {
  const log: string[] = [];
  const state = {
    startResult: { ok: true } as Awaited<ReturnType<Recorder["start"]>>,
    startGate: undefined as Promise<void> | undefined,
    startThrows: false,
    clip: loud(),
  };
  const recorder: Recorder = {
    async start({ prerollMs }) {
      log.push(`start:${prerollMs}`);
      if (state.startThrows) throw new Error("device");
      await state.startGate;
      return state.startResult;
    },
    async stop() {
      log.push("stop");
      return state.clip;
    },
    async discard() {
      log.push("discard");
    },
  };
  return { recorder, log, state };
}

export function fakeTranscriber(text = "hello world") {
  const calls: { language: string; samples: number }[] = [];
  const state = { result: { ok: true, text } as TranscribeResult, gate: undefined as Promise<void> | undefined, queue: [] as TranscribeResult[] };
  const transcriber: Transcriber = {
    async transcribe({ clip, language }) {
      calls.push({ language, samples: clip.pcm.length });
      await state.gate;
      return state.queue.shift() ?? state.result;
    },
  };
  return { transcriber, calls, state };
}

export function fakeInserter() {
  const inserted: { text: string; plan: Parameters<Inserter["insert"]>[0]["plan"] }[] = [];
  const state = { current: target() as Target | undefined, result: { ok: true } as Awaited<ReturnType<Inserter["insert"]>>, targetThrows: false };
  const inserter: Inserter = {
    async target() {
      if (state.targetThrows) throw new Error("no window");
      return state.current;
    },
    async insert(req) {
      inserted.push(req);
      return state.result;
    },
  };
  return { inserter, inserted, state };
}

export function fakeStorage(initial?: unknown) {
  const state = { value: initial, saves: 0, failSave: false, failLoad: false };
  const storage: HistoryStorage = {
    async load() {
      if (state.failLoad) throw new Error("unreadable");
      return state.value;
    },
    async save(value) {
      state.saves++;
      if (state.failSave) throw new Error("disk full");
      state.value = value;
    },
  };
  return { storage, state };
}

/** A dictation wired to fakes at every boundary, with the hotkey installed. */
export async function rig(settings: Partial<Settings> = {}, storage = fakeStorage()) {
  const time = fakeClock();
  const keys = fakeKeyboard();
  const rec = fakeRecorder();
  const stt = fakeTranscriber();
  const ins = fakeInserter();
  const deps: DictationDeps = { clock: time.clock, recorder: rec.recorder, transcriber: stt.transcriber, inserter: ins.inserter, hotkeys: keys.source, storage: storage.storage, settings };
  const dictation: Dictation = createDictation(deps);
  await dictation.ready();
  const states: string[] = [];
  dictation.subscribe((s) => states.push(s.status));
  const at = () => time.clock.now();
  return {
    dictation,
    time,
    keys,
    rec,
    stt,
    ins,
    storage,
    states,
    press: (key = "ControlRight") => keys.send(key, true, at()),
    release: (key = "ControlRight") => keys.send(key, false, at()),
    /** Press, wait `ms`, release. */
    async hold(ms: number, key = "ControlRight") {
      const down = keys.send(key, true, at());
      await time.advance(ms);
      return [down, keys.send(key, false, at())] as const;
    },
  };
}
