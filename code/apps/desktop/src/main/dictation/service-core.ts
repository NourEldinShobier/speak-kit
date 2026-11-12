import { ipcMain } from "electron";
import { createDictation, type AudioStore, type Dictation } from "@speakkit/dictation";
import { MIC_LEVEL_EVENT } from "../../shared/dictation/channels";
import type { RecorderEvent } from "../../shared/dictation/contract";
import type { Ctx } from "../context";
import type { DictationService, DictationServiceOptions } from "./service";
import type { SwitchableHotkeys } from "./hotkey-source";
import type { DictationOs, InsertResult } from "./index";
import path from "node:path";
import { createFixtureRecorder } from "./fixture-recorder";
import { createInserterPort, ReplayRecorder } from "./ports";
import { createRecorderHost, type RecorderHost } from "./recorder";
import { createSpool, type Spool } from "./spool";
import { createSpooledRecorder, type SpooledRecorder } from "./spooled-recorder";
import { RECORDER_RATE } from "../../shared/dictation/contract";
import { openRecorderWindow, recorderHandle } from "./recorder-window";
import { clock, coreSettings, keepOpenMs } from "./service-support";
import { createOpenAiRewriter } from "./openai-rewriter";
import { historyFiles, scriptedRewriter, trashViaShell } from "./service-wiring";
import type { Failure } from "./service-parts";
import { createTranscriber } from "./stt";

/** What the dictation core and its microphone window are wired to; the service lends these. */
export interface CoreHost {
  ctx: Ctx;
  o: Pick<DictationServiceOptions, "dataDir" | "micOwner" | "parent" | "test" | "trash" | "rewriter" | "readKey">;
  /** The words were not sent because the model cannot read a prompt. */
  onPromptDropped(): void;
  /** The service's public parts: the speech engine, the models, the HUD, the microphone state, and the test switch that refuses the microphone. */
  svc: Pick<DictationService, "stt" | "speech" | "models" | "presenter" | "mic" | "micDenied" | "fakeRewrite">;
  failure: Failure;
  os: DictationOs;
  hotkeys: SwitchableHotkeys;
  /** The renderer page file of this name, as a URL. */
  page(name: string): string;
  onMicEvent(e: RecorderEvent): void;
  inserted(r: InsertResult): void;
}

/** The microphone window and the dictation core over it, with the speech engine, the inserter and the history file. */
export function buildCore(h: CoreHost): { recorder: RecorderHost; core: Dictation; audio: AudioStore; spool: Spool; spooled: SpooledRecorder } {
  const { ctx, o, svc } = h;
  const cfg = () => ctx.config.dictation;
  let spooled: SpooledRecorder | undefined;
  const recorder = createRecorderHost({
    ipcMain,
    onChunk: (pcm) => spooled?.chunk(pcm),
    onLevel: (n) => {
      svc.presenter.setLevel(n);
      if (svc.mic.meter) o.parent()?.webContents.send(MIC_LEVEL_EVENT, n);
    },
    mic: () => ({ saved: cfg().microphone, exclusions: cfg().micExclusions, avoidBluetooth: cfg().avoidBluetooth, keepMs: keepOpenMs(cfg()) }),
    onEvent: h.onMicEvent,
    open: () => recorderHandle(openRecorderWindow({ page: h.page("recorder.html"), micAllowed: () => !svc.micDenied })),
  });
  const spool = createSpool({ dir: path.join(o.dataDir, "dictation-spool") });
  const kept = (spooled = createSpooledRecorder(recorder, spool, { rate: RECORDER_RATE }));
  // Test builds only: SPEAKKIT_AUDIO_FIXTURE names a WAV file that stands in for the microphone.
  const fixture = __TEST_CODE__ ? process.env["SPEAKKIT_AUDIO_FIXTURE"] : undefined;
  h.failure.replay = new ReplayRecorder(fixture ? createFixtureRecorder(kept, fixture) : kept);
  let core: Dictation | undefined;
  const files = historyFiles(o.dataDir, o.trash ?? trashViaShell, { onEvicted: (gone) => void core?.history.dropAudio(gone), limitBytes: () => cfg().audioCapMb * 1024 * 1024 });
  core = createDictation({
    clock,
    recorder: h.failure.replay,
    transcriber: createTranscriber({
      stt: svc.stt,
      model: () => cfg().model,
      models: () => svc.speech.catalog(),
      onUsed: (id) => svc.speech.used(id),
      sentencePause: () => cfg().sentencePause,
      onFailedClip: (c) => (h.failure.clip = c),
      onModelError: (d) => svc.models.report(d),
      onPromptDropped: h.onPromptDropped,
    }),
    keepClip: (clip) => (h.failure.clip = clip),
    settled: (clip, done) => kept.settled(clip, done),
    // Only the stage name and a reason: spoken text never reaches a log.
    log: (stage, why) => ctx.log.warn(`dictation stage ${stage}`, why),
    inserter: createInserterPort(h.os, h.inserted),
    hotkeys: h.hotkeys,
    storage: files.storage,
    audio: files.audio,
    rewriter: o.rewriter ?? (__TEST_CODE__ && o.test ? scriptedRewriter(() => svc.fakeRewrite) : createOpenAiRewriter({ readKey: async () => (await o.readKey?.()) ?? null })),
    settings: coreSettings(cfg()),
    ...(o.micOwner && { micOwner: o.micOwner }),
  });
  return { recorder, core, audio: files.audio, spool, spooled: kept };
}
