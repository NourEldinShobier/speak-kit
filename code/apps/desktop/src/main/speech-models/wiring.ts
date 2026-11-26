import type { BrowserWindow } from "electron";
import { Transfers, WhisperStt } from "@speakkit/engine";
import type { DictationConfig, DictationModelId } from "../../shared/dictation/settings";
import type { Ctx } from "../context";
import type { Settings } from "@speakkit/dictation";
import { ModelManager } from "../dictation/models";
import { coreSettings, isRecording } from "../dictation/service-support";
import type { Stt } from "../dictation/stt";
import { modelFetch } from "./download-fetch";
import { parseHardware } from "./hardware-probe";
import { memoryOf, openFolder, openProxySettings, pickModelFile, probeThisComputer, scanDirs } from "./ports";
import { SpeechModels, type SttExtras } from "./service";
import { createWriterParts, type WriterParts } from "./writer-wiring";

interface Args {
  ctx: Ctx;
  o: { modelsDir: string; sttWorker: URL; writerWorker: URL; test: boolean; parent(): BrowserWindow | null };
  /** An engine given by a test or the scripted one; the real engine is made when absent. */
  stt: Stt | undefined;
  select(id: DictationModelId): void;
  push(soon?: boolean): void;
  /** The dictation service: whether it is supported and recording, and the core that must hear about a changed model or language. */
  svc: { readonly supported: boolean; readonly state: { status: string }; readonly core: { configure(s: Partial<Settings>): void } | undefined };
}

/** A test run keeps the plain fetch for local servers, except when it asks for the real engine, whose downloads must take the app path. */
const downloadFetch = (a: Args) => modelFetch(__TEST_CODE__ && a.o.test && !process.env.SPEAKKIT_REAL_STT);

/** The real engine (unless a test gave one): it asks the speech models service where to run, and downloads through the browser engine's fetch. */
function createEngine(a: Args, speech: () => SpeechModels): Stt & SttExtras {
  if (a.stt) return a.stt;
  const systemFetch = downloadFetch(a);
  return new WhisperStt({
    modelsDir: a.o.modelsDir,
    workerUrl: a.o.sttWorker,
    gpu: () => speech().gpuWanted(),
    beforeLoad: () => speech().hardwareKnown(),
    extraModels: () =>
      speech()
        .catalog()
        .filter((m) => m.origin === "custom"),
    onGpuFallback: (m) => speech().onGpuFallback(m),
    timeIntegrated: () => speech().timeIntegrated(),
    onTimed: (w) => speech().onTimed(w),
    ...(systemFetch && { fetch: systemFetch }),
  });
}

/** The rewrite pass's writer: it runs where the speech models run, is released after the same quiet spell, and downloads through the same transfers. */
const createWriter = (a: Args, speech: () => SpeechModels, transfers: Transfers): WriterParts =>
  createWriterParts({
    modelsDir: a.o.modelsDir,
    writerWorker: a.o.writerWorker,
    gpu: () => speech().gpuWanted(),
    idleMinutes: () => a.ctx.config.engines.idleMinutes,
    recording: () => isRecording(a.svc.state),
    fetch: downloadFetch(a),
    transfers,
    scanDirs,
    changed: () => a.push(true),
  });

/** The speech engine, the model manager and the speech models service, wired to each other and to the app's config. */
export function createSpeechParts(a: Args): { stt: Stt; models: ModelManager; speech: SpeechModels; writer: WriterParts } {
  const cfg = (): DictationConfig => a.ctx.config.dictation;
  let speech!: SpeechModels;
  const stt = createEngine(a, () => speech);
  const transfers = new Transfers();
  const writer = createWriter(a, () => speech, transfers);
  const models = new ModelManager({
    stt,
    selected: () => cfg().model,
    select: a.select,
    changed: a.push,
    models: () => speech.catalog(),
    transfers,
    blocked: () => speech.floorMessage(),
    switching: () => !!speech.switcher.switching,
  });
  speech = new SpeechModels({
    modelsDir: a.o.modelsDir,
    stt,
    models,
    writer: writer.files,
    config: () => ({ dictation: cfg(), engines: a.ctx.config.engines }),
    save: () => a.ctx.saveConfig(),
    choose: (id, language) => {
      cfg().model = id;
      cfg().language = language as DictationConfig["language"];
      a.ctx.saveConfig();
      a.svc.core?.configure(coreSettings(cfg()));
    },
    recording: () => isRecording(a.svc.state),
    dictationSupported: () => a.svc.supported,
    hardware: async () => (a.o.test && process.env.SPEAKKIT_HARDWARE && parseHardware(process.env.SPEAKKIT_HARDWARE)) || probeThisComputer(),
    pickFile: (title) => pickModelFile(a.o.parent(), title),
    openFolder,
    openProxySettings,
    memoryOf,
    scanDirs,
    changed: () => a.push(true),
    platform: process.platform,
  });
  stt.onStatus((s) => s.state === "ready" && speech.used());
  return { stt, models, speech, writer };
}

/**
 * Starts the speech models service (hardware probe, models on disk) and, while dictation is on, feeds the program in front and its keyboard layout to the automatic switching rules; the rules wait 300 ms for them to settle.
 * The layout is also read while the dictation language follows the keyboard, so the reading is fresh at the next key press. Returns the stop function.
 */
export function startSpeech(
  speech: SpeechModels,
  os: { foreground(want?: { layout: boolean }): { exe: string | null; layout?: string | undefined } | null },
  when: { dictationOn: () => boolean; followsKeyboard: () => boolean },
): () => void {
  void speech.init();
  let last = "";
  const t = setInterval(() => {
    if (!when.dictationOn()) return;
    const info = os.foreground({ layout: speech.wantsLayout() || when.followsKeyboard() });
    const c = { app: info?.exe ?? undefined, layout: info?.layout };
    const key = `${c.app}|${c.layout}`;
    if (key === last) return;
    last = key;
    speech.auto.update(c);
  }, 400);
  t.unref();
  return () => clearInterval(t);
}
