import path from "node:path";
import { ignore } from "./ignore";
import { allProviders, createMeetings, MicPicker, readRetention, type Meetings, type NotesDeps, type VocabEntry } from "@speakkit/meetings";
import { nodeFs, type Fs } from "@speakkit/transcripts";
import type { ChunkResult } from "@speakkit/transcripts";
import type { CapsuleAction, CapsuleView, Device, Push, RecordingView } from "../../shared/meetings/contract";
import { MEETINGS_METHODS } from "../../shared/meetings/channels";
import { retentionOf } from "../../shared/meetings/settings";
import type { Ctx } from "../context";
import type { Stt } from "../dictation/stt";
import type { DictationModelId } from "../../shared/dictation/settings";
import { chunkEngine } from "../transcripts/engine";
import { Capsule, type CapsuleDeps } from "./capsule";
import { addedProviders, createHandlers, type Handlers } from "./handlers";
import type { RecorderPort } from "./hosts";
import type { MeetingsPlatform } from "./platform/types";
import { MeetingRecording } from "./session";
import { CallWatch } from "./watch";

/** What the service needs from Electron and the rest of the app, so tests can stand in for each. */
export interface MeetingsPorts {
  dataDir: string;
  documentsDir: string;
  fs?: Fs;
  stt: Stt;
  model(): DictationModelId;
  dictationBusy(): boolean;
  platform: MeetingsPlatform;
  recorder: RecorderPort;
  capsule: Pick<CapsuleDeps, "open" | "displays" | "cursor">;
  /** The writer model: one JSON answer. Absent when notes are not possible. */
  complete(
    system: string,
    user: string,
    signal: AbortSignal,
  ): Promise<{ ok: true; value: string } | { ok: false; code: "no-key" | "key-rejected" | "no-credit" | "rate-limited" | "offline" | "unavailable" }>;
  keySaved(): Promise<boolean>;
  writerName: string;
  vocabulary(): VocabEntry[];
  clipboard: { writeText(text: string): void };
  shell: { reveal(file: string): void; openFolder(dir: string): Promise<void> };
  dialog: { pickFolder(): Promise<string | null> };
  /** Registers a global shortcut; false when the system refused it. */
  shortcut: { register(accelerator: string, run: () => void): boolean; unregister(accelerator: string): void };
  devices(): Promise<{ inputs: Device[]; outputs: Device[] }>;
  /** Tells the windows to redraw. */
  push(p: Push): void;
  /** The tray follows the recorder. */
  changed(): void;
  /** Brings the app window to a meeting. */
  openMeeting(id: string): void;
  /** Brings the app window to Settings > Meetings. */
  openSettings(): void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
  /** How often the system is looked at, and the clock of the second-by-second work. */
  pollMs?: number;
  tickMs?: number;
}

export type MeetingsTrayPhase = "ready" | "starting" | "recording" | "saving" | "transcribing";

export interface MeetingsService {
  handlers: Handlers;
  core: Promise<Meetings>;
  phase(): MeetingsTrayPhase;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  /** The capsule: the window host moves and clicks it; tests read its view. */
  capsule: Capsule;
  /** An answer from the capsule. */
  act(a: CapsuleAction): Promise<void>;
  capsuleView(): CapsuleView | null;
  /** One look at the system now (tests drive it; the timer does it in the app). */
  pollNow(): Promise<void>;
  tickNow(): Promise<void>;
  dispose(): Promise<void>;
}

const HOUR = 3_600_000;
const HEADSET = /head(?:phone|set)|earbud|earphone|airpods|buds|bluetooth|hands-free/i;

type Parts = { core: Meetings; recording: MeetingRecording; watch: CallWatch };
type Cfg = Ctx["config"]["meetings"];

/** What the pieces of the service share: the config, the clock, the capsule and the ways to tell the windows. */
interface Shared {
  ctx: Ctx;
  p: MeetingsPorts;
  cfg(): Cfg;
  now(): number;
  capsule: Capsule;
  providers(): ReturnType<typeof allProviders>;
  state: { watch?: CallWatch; recording?: MeetingRecording; core?: Meetings; shortcut: string };
  bump(): void;
  onRecording(v: RecordingView | null): void;
  onNotice(text: string): void;
}

const notesWriter = (p: MeetingsPorts): NotesDeps => ({
  writer: p.writerName,
  complete: async (system, user, signal) => {
    const r = await p.complete(system, user, signal);
    return r.ok ? { ok: true, text: r.value } : r;
  },
});

function openCore(e: Shared, o: { folder(): string; headphones(): boolean; changed(): void }): Promise<Meetings> {
  const { ctx, p, cfg } = e;
  const writer = notesWriter(p);
  return createMeetings({
    dir: `${p.dataDir}/meetings`,
    fs: p.fs ?? nodeFs(),
    now: e.now,
    newId: p.newId ?? (() => crypto.randomUUID()),
    sleep: p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    transcribe: chunkEngine({ stt: p.stt, model: p.model }) as (pcm: Int16Array, language: string, signal: AbortSignal) => Promise<ChunkResult>,
    busy: p.dictationBusy,
    retention: () => readRetention(retentionOf(cfg())).value,
    notes: () => (cfg().summary ? writer : undefined),
    vocabulary: p.vocabulary,
    language: () => ctx.config.transcripts.language,
    headphones: o.headphones,
    exportDir: o.folder,
    changed: o.changed,
  });
}

/** The files of a meeting in the file manager; written first when there are none yet. */
async function showFiles(core: Meetings, p: MeetingsPorts, id: string): Promise<void> {
  const d = await core.get(id);
  const files = d?.files.length ? d.files : ((await core.writeFiles(id).then((r) => (r.ok ? r.paths : []))) ?? []);
  if (files[0]) p.shell.reveal(files[0]);
}

/** The recording and the call watch that sit on the meetings core. */
function connect(core: Meetings, e: Shared): Parts {
  const { ctx, p, cfg } = e;
  const recording = new MeetingRecording({
    core,
    recorder: p.recorder,
    picker: new MicPicker({ dictationDevice: "", callAppDevice: async () => null }),
    now: e.now,
    micSetting: () => cfg().mic,
    changed: e.onRecording,
    notice: e.onNotice,
  });
  const watch = new CallWatch({
    platform: p.platform,
    providers: e.providers,
    cfg,
    setPolicy: (id, policy) => {
      cfg().policies = { ...cfg().policies, [id]: policy };
      ctx.saveConfig();
      e.bump();
    },
    recording,
    show: (v) => e.capsule.show(v),
    now: e.now,
    open: p.openMeeting,
    openSettings: p.openSettings,
    showFolder: (id) => void showFiles(core, p, id),
  });
  return { core, recording, watch };
}

/** A recording that stopped by itself: the activity list, the windows and the capsule say so. */
function raise(e: Shared, text: string): void {
  e.ctx.addActivity("error", "Meeting recording stopped", text);
  e.ctx.publish();
  e.state.watch?.notice(text);
}

/** Connects the recording and the watch to the core and remembers them for the callbacks. */
function attach(core: Meetings, e: Shared): Parts {
  const parts = connect(core, e);
  Object.assign(e.state, { core, recording: parts.recording, watch: parts.watch });
  registerShortcut(e);
  return parts;
}

/** The shortcut that starts and stops a recording: registered again whenever the setting changes. */
function registerShortcut(e: Shared): void {
  const { p, cfg, state } = e;
  if (state.shortcut) p.shortcut.unregister(state.shortcut);
  state.shortcut = "";
  const accel = cfg().shortcut;
  if (!cfg().enabled || !accel) return;
  const toggle = () => void (state.recording?.active ? state.recording.stop() : state.recording?.start({ providerId: "manual", providerName: "Meeting" }));
  if (p.shortcut.register(accel, toggle)) state.shortcut = accel;
}

/** The polling of the system, the second-by-second work and the hourly sweep. */
function startLoops(e: Shared, coreP: Promise<Meetings>, ready: Promise<Parts>) {
  let seen = 0;
  void ready.then(({ core }) => (seen = core.since(0).latest));
  const settle = async () => {
    const { core, watch } = await ready;
    // A transcript that finished since the last look: the capsule says so.
    for (const ev of core.since(seen).events) {
      const providerId = (await core.get(ev.meetingId))?.providerId;
      watch.finished(ev.meetingId, ev.title, e.providers().find((x) => x.id === providerId)?.mark ?? "Mt");
    }
    seen = core.since(seen).latest;
  };
  const poll = async () => (await ready).watch.poll().then(settle);
  const second = () => ready.then(({ recording, watch }) => (recording.tick(), watch.tick(), settle()));
  const timers = [setInterval(() => void poll().catch(ignore), e.p.pollMs ?? 4000), setInterval(() => void second(), e.p.tickMs ?? 1000), setInterval(() => void coreP.then((c) => c.sweep()), HOUR)];
  timers.forEach((t) => t.unref());
  return { poll, second, stop: () => timers.forEach(clearInterval) };
}

/** What the window calls, built once the core is open. */
function handlersFor(e: Shared, { core, recording, watch }: Parts, o: { folder(): string; live(): Push }): Handlers {
  const { ctx, p, cfg } = e;
  return createHandlers({
    core,
    ports: p,
    watch,
    recording,
    cfg,
    folder: o.folder,
    saveConfig: () => ctx.saveConfig(),
    configChanged: () => {
      registerShortcut(e);
      core.vocabularyChanged();
      if (!cfg().enabled) void watch.poll();
      e.bump();
    },
    live: o.live,
    sweep: () => core.sweep(),
  });
}

/** Stops the loops, the shortcut and any recording, then closes the store. */
async function shutdown(e: Shared, ready: Promise<Parts>, stopLoops: () => void): Promise<void> {
  stopLoops();
  if (e.state.shortcut) e.p.shortcut.unregister(e.state.shortcut);
  const { core, recording } = await ready;
  if (recording.active) await recording.stop();
  await core.dispose();
  e.capsule.dispose();
  e.p.recorder.dispose();
}

/** The handlers answer after the core is open: each call waits for it. */
const lazyHandlers = (handlersP: Promise<Handlers>): Handlers =>
  Object.fromEntries(MEETINGS_METHODS.map((m) => [m, async (...a: unknown[]) => ((await handlersP)[m] as (...x: unknown[]) => unknown)(...a)])) as Handlers;

/** The calls that wait for the core to be open. */
const whenReady = (ready: Promise<Parts>, capsule: Capsule) => ({
  start: async () => (await ready).recording.start({ providerId: "manual", providerName: "Meeting" }),
  stop: async () => (await ready).recording.stop(),
  capsule,
  act: async (a: CapsuleAction) => (await ready).watch.act(a),
  capsuleView: () => capsule.view,
});

const phaseOf = (rec: RecordingView | null, core: Meetings | undefined): MeetingsTrayPhase => {
  if (rec) return rec.phase === "starting" || rec.phase === "saving" ? rec.phase : "recording";
  return core?.list().some((r) => r.status === "transcribing") ? "transcribing" : "ready";
};

/** The meeting feature of the desktop: store, recorder, call watch and capsule, wired to the engine, the OS ports and the windows. */
export function createMeetingsService(ctx: Ctx, p: MeetingsPorts): MeetingsService {
  const cfg = () => ctx.config.meetings;
  const now = p.now ?? Date.now;
  const folder = () => cfg().folder || path.join(p.documentsDir, "Speak Kit", "Meetings");
  let tick = 0;
  let notice: string | undefined;
  let rec: RecordingView | null = null;
  let headphones = false;
  const live = (): Push => ({ recording: rec, tick, ...(notice && { notice }) });
  const send = () => (p.push(live()), p.changed());
  const state: Shared["state"] = { shortcut: "" };
  const capsule = new Capsule({ ...p.capsule, saved: () => cfg().positions, save: (positions) => ((cfg().positions = positions), ctx.saveConfig()) });
  const e: Shared = {
    ctx,
    p,
    cfg,
    now,
    capsule,
    state,
    providers: () => allProviders(addedProviders(cfg())),
    bump: () => (tick++, send()),
    onRecording: (v) => {
      rec = v;
      if (v)
        void p
          .devices()
          .then((d) => (headphones = HEADSET.test(d.outputs.find((o) => o.isDefault)?.label ?? "")))
          .catch(ignore);
      send();
      state.watch?.render();
    },
    onNotice: (text) => ((notice = text), raise(e, text), send()),
  };
  const coreP = openCore(e, { folder, headphones: () => headphones, changed: e.bump });
  const ready = coreP.then((core) => attach(core, e));
  const loops = startLoops(e, coreP, ready);

  const handlersP = ready.then((parts) => handlersFor(e, parts, { folder, live }));
  return {
    handlers: lazyHandlers(handlersP),
    core: ready.then((r) => r.core),
    phase: () => phaseOf(rec, state.core),
    ...whenReady(ready, capsule),
    pollNow: loops.poll,
    tickNow: loops.second,
    dispose: () => shutdown(e, ready, loops.stop),
  };
}
