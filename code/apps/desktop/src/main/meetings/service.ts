import path from "node:path";
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

/** The meeting feature of the desktop: store, recorder, call watch and capsule, wired to the engine, the OS ports and the windows. */
export function createMeetingsService(ctx: Ctx, p: MeetingsPorts): MeetingsService {
  const cfg = () => ctx.config.meetings;
  const now = p.now ?? Date.now;
  const folder = () => cfg().folder || path.join(p.documentsDir, "Speak Kit", "Meetings");
  let tick = 0;
  let notice: string | undefined;
  let rec: RecordingView | null = null;
  let headphones = false;
  const send = () => {
    p.push({ recording: rec, tick, ...(notice && { notice }) });
    p.changed();
  };
  const writer: NotesDeps = {
    writer: p.writerName,
    complete: async (system, user, signal) => {
      const r = await p.complete(system, user, signal);
      return r.ok ? { ok: true, text: r.value } : r;
    },
  };
  const retention = () => readRetention(retentionOf(cfg())).value;
  const coreP = createMeetings({
    dir: `${p.dataDir}/meetings`,
    fs: p.fs ?? nodeFs(),
    now,
    newId: p.newId ?? (() => crypto.randomUUID()),
    sleep: p.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    transcribe: chunkEngine({ stt: p.stt, model: p.model }) as (pcm: Int16Array, language: string, signal: AbortSignal) => Promise<ChunkResult>,
    busy: p.dictationBusy,
    retention,
    notes: () => (cfg().summary ? writer : undefined),
    vocabulary: p.vocabulary,
    language: () => ctx.config.transcripts.language,
    headphones: () => headphones,
    exportDir: folder,
    changed: () => {
      tick++;
      send();
    },
  });
  const state: { core?: Meetings; recording?: MeetingRecording; watch?: CallWatch; capsule?: Capsule; shortcut: string } = { shortcut: "" };
  const capsule = new Capsule({ ...p.capsule, saved: () => cfg().positions, save: (positions) => ((cfg().positions = positions), ctx.saveConfig()) });
  state.capsule = capsule;
  const providers = () => allProviders(addedProviders(cfg()));
  const timers: ReturnType<typeof setInterval>[] = [];
  let seen = 0;

  const ready = coreP.then(async (core) => {
    state.core = core;
    seen = core.since(0).latest;
    const picker = new MicPicker({ dictationDevice: "", callAppDevice: async () => null });
    const recording = (state.recording = new MeetingRecording({
      core,
      recorder: p.recorder,
      picker,
      now,
      micSetting: () => cfg().mic,
      changed: (v) => {
        rec = v;
        if (v)
          void p
            .devices()
            .then((d) => (headphones = HEADSET.test(d.outputs.find((o) => o.isDefault)?.label ?? "")))
            .catch(() => {});
        send();
        state.watch?.render();
      },
      notice: (text) => {
        notice = text;
        ctx.addActivity("error", "Meeting recording stopped", text);
        ctx.publish();
        state.watch?.notice(text);
        send();
      },
    }));
    const watch = (state.watch = new CallWatch({
      platform: p.platform,
      providers,
      cfg,
      setPolicy: (id, policy) => {
        cfg().policies = { ...cfg().policies, [id]: policy };
        ctx.saveConfig();
        tick++;
        send();
      },
      recording,
      show: (v) => capsule.show(v),
      now,
      open: p.openMeeting,
      showFolder: (id) =>
        void core.get(id).then(async (d) => {
          const files = d?.files.length ? d.files : ((await core.writeFiles(id).then((r) => (r.ok ? r.paths : []))) ?? []);
          if (files[0]) p.shell.reveal(files[0]);
        }),
    }));
    return { core, recording, watch };
  });

  const registerShortcut = () => {
    if (state.shortcut) p.shortcut.unregister(state.shortcut);
    state.shortcut = "";
    const accel = cfg().shortcut;
    if (!cfg().enabled || !accel) return;
    if (p.shortcut.register(accel, () => void (state.recording?.active ? state.recording.stop() : state.recording?.start({ providerId: "manual", providerName: "Meeting" })))) state.shortcut = accel;
  };

  const settle = async () => {
    const { core, watch } = await ready;
    // A transcript that finished since the last look: the capsule says so.
    for (const e of core.since(seen).events) watch.finished(e.meetingId, e.title);
    seen = core.since(seen).latest;
  };
  const poll = async () => (await ready).watch.poll().then(settle);
  const second = () => ready.then(({ recording, watch }) => (recording.tick(), watch.tick(), settle()));
  timers.push(
    setInterval(() => void poll().catch(() => {}), p.pollMs ?? 4000),
    setInterval(() => void second(), p.tickMs ?? 1000),
    setInterval(() => void coreP.then((c) => c.sweep()), HOUR),
  );
  timers.forEach((t) => t.unref());
  void ready.then(() => registerShortcut());

  const handlersP = ready.then(({ core, recording, watch }) =>
    createHandlers({
      core,
      ports: p,
      watch,
      recording,
      cfg,
      folder,
      saveConfig: () => ctx.saveConfig(),
      configChanged: () => {
        registerShortcut();
        core.vocabularyChanged();
        if (!cfg().enabled) void watch.poll();
        tick++;
        send();
      },
      live: () => ({ recording: rec, tick, ...(notice && { notice }) }),
      sweep: () => core.sweep(),
    }),
  );
  const wrap = Object.fromEntries(MEETINGS_METHODS.map((m) => [m, async (...a: unknown[]) => ((await handlersP) as unknown as Record<string, (...x: unknown[]) => unknown>)[m]!(...a)]));

  return {
    handlers: wrap as unknown as Handlers,
    core: ready.then((r) => r.core),
    phase() {
      if (rec) return rec.phase === "starting" || rec.phase === "saving" ? rec.phase : "recording";
      return state.core?.list().some((r) => r.status === "transcribing") ? "transcribing" : "ready";
    },
    start: async () => (await ready).recording.start({ providerId: "manual", providerName: "Meeting" }),
    stop: async () => (await ready).recording.stop(),
    capsule,
    act: async (a) => (await ready).watch.act(a),
    capsuleView: () => capsule.view,
    pollNow: poll,
    tickNow: second,
    async dispose() {
      timers.forEach(clearInterval);
      if (state.shortcut) p.shortcut.unregister(state.shortcut);
      const { core, recording } = await ready;
      if (recording.active) await recording.stop();
      await core.dispose();
      capsule.dispose();
      p.recorder.dispose();
    },
  };
}
