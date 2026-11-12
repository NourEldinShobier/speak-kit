import { net, type BrowserWindow } from "electron";
import { Transfers, WhisperStt } from "@speakkit/engine";
import type { DictationConfig, DictationModelId } from "../../shared/dictation/settings";
import type { Ctx } from "../context";
import { ModelManager } from "../dictation/models";
import type { Stt } from "../dictation/stt";
import { memoryOf, openFolder, openProxySettings, pickModelFile, probeThisComputer, scanDirs } from "./ports";
import { SpeechModels, type SttExtras } from "./service";

interface Args {
  ctx: Ctx;
  o: { modelsDir: string; sttWorker: URL; test: boolean; parent(): BrowserWindow | null };
  /** An engine given by a test or the scripted one; the real engine is made when absent. */
  stt: Stt | undefined;
  select(id: DictationModelId): void;
  push(soon?: boolean): void;
  supported(): boolean;
  recording(): boolean;
  /** The core must hear about a changed model or language. */
  configure(): void;
}

/** The real engine (unless a test gave one): it asks the speech models service where to run, and downloads through the browser engine's fetch. */
function createEngine(a: Args, speech: () => SpeechModels): Stt & SttExtras {
  if (a.stt) return a.stt;
  // The browser engine's fetch follows the system proxy (manual and PAC scripts) and trusts the system certificate store, so a network that
  // inspects secure traffic works once its certificate is installed; the plain Node fetch would ignore both.
  const systemFetch = __TEST_CODE__ && a.o.test ? undefined : (net.fetch as typeof fetch);
  return new WhisperStt({
    modelsDir: a.o.modelsDir,
    workerUrl: a.o.sttWorker,
    gpu: () => speech().gpuWanted(),
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

/** The speech engine, the model manager and the speech models service, wired to each other and to the app's config. */
export function createSpeechParts(a: Args): { stt: Stt; models: ModelManager; speech: SpeechModels } {
  const cfg = (): DictationConfig => a.ctx.config.dictation;
  let speech!: SpeechModels;
  const stt = createEngine(a, () => speech);
  const models = new ModelManager({
    stt,
    selected: () => cfg().model,
    select: a.select,
    changed: a.push,
    models: () => speech.catalog(),
    transfers: new Transfers(),
    blocked: () => speech.floorMessage(),
    switching: () => !!speech.switcher.switching,
  });
  speech = new SpeechModels({
    modelsDir: a.o.modelsDir,
    stt,
    models,
    config: () => ({ dictation: cfg(), engines: a.ctx.config.engines }),
    save: () => a.ctx.saveConfig(),
    choose: (id, language) => {
      cfg().model = id;
      cfg().language = language as DictationConfig["language"];
      a.ctx.saveConfig();
      a.configure();
    },
    recording: a.recording,
    dictationSupported: a.supported,
    hardware: probeThisComputer,
    pickFile: (title) => pickModelFile(a.o.parent(), title),
    openFolder,
    openProxySettings,
    memoryOf,
    scanDirs,
    changed: () => a.push(true),
    platform: process.platform,
  });
  stt.onStatus((s) => s.state === "ready" && speech.used());
  return { stt, models, speech };
}

/** Starts the speech models service (hardware probe, models on disk) and, while dictation is on, feeds the program in front and its keyboard layout to the automatic switching rules; the rules wait 300 ms for them to settle. Returns the stop function. */
export function startSpeech(speech: SpeechModels, foreground: () => { exe: string | null; layout?: string | undefined } | null, dictationOn: () => boolean): () => void {
  void speech.init();
  let last = "";
  const t = setInterval(() => {
    if (!dictationOn()) return;
    const info = foreground();
    const c = { app: info?.exe ?? undefined, layout: info?.layout };
    const key = `${c.app}|${c.layout}`;
    if (key === last) return;
    last = key;
    speech.auto.update(c);
  }, 400);
  t.unref();
  return () => clearInterval(t);
}
