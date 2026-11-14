import * as v from "valibot";
import type { FailedDevice } from "@speakkit/engine";
import type { SpeechModelMethod } from "./channels";
import { DEVICE_VALUES } from "./config";

export type { SpeechModelMethod } from "./channels";

export { DEVICE_VALUES };
export type DeviceValue = (typeof DEVICE_VALUES)[number];

/** Wrong words out of all words of the test recordings in one language. Never invented: it is the count the model got on our recordings. */
export interface AccuracyFigure {
  language: string;
  wrong: number;
  of: number;
}

export interface ModelCard {
  id: string;
  name: string;
  tag: string;
  description: string;
  bytes: number;
  installed: boolean;
  /** The model dictation uses. */
  inUse: boolean;
  /** Language codes the model handles. */
  languages: string[];
  /** Language codes for which this model is the recommended one. */
  recommendedFor: string[];
  /** Measured on our test recordings, one figure per language the model was run on. Never compared across languages. */
  accuracy?: AccuracyFigure[];
  /** Seconds from the end of a ten second sentence to the text, measured, on the kind of device this computer has. */
  speedSeconds?: number;
  /** The same on the CPU alone; absent when it is the figure above. */
  speedOnCpuSeconds?: number;
  /** SHA-256 of the model file. */
  sha256: string;
  license: { name: string; url: string };
  origin: "builtin" | "custom";
  /** Memory while running, with the setup it was measured in; absent means not measured on this computer. */
  memory?: { mb: number; setup: string };
  transfer?: { state: "running" | "paused" | "preparing"; fraction: number; etaSeconds?: number };
  failure?: { kind: string; message: string; host: string; keptBytes: number; advice: string };
  /** The accurate model is too slow here: the card is disabled and says why. */
  blocked?: string;
  /** The download was asked for while another one runs and starts when that one ends. */
  queuedBehind?: boolean;
  /** The model file the person added is gone from our folder. */
  fileMissing?: boolean;
  /** "Switched to English" style note when the saved language does not fit this model. */
  languageNote?: string;
  /** Bytes it takes in our models folder. */
  diskBytes: number;
}

export interface TableRow {
  language: string;
  recommended: string;
  alsoWorks: string[];
  /** How the recommended model did on our recordings in this language; absent for a language that was not measured. */
  figure?: AccuracyFigure;
  /** The model recommended on a computer without a graphics card, and the measured seconds it takes there for ten seconds of speech. */
  cpuOnly?: string;
  cpuSeconds?: number;
}

export interface DeviceView {
  choice: DeviceValue;
  /** Where the loaded model runs; undefined while nothing is loaded. */
  backend?: "gpu" | "cpu";
  gpuName?: string;
  driver?: string;
  cores?: number;
  memoryGb?: number;
  failed: FailedDevice[];
  /** The model was moved to the CPU because the card was out of memory; the card is not marked as failed. */
  movedToCpuByMemory: boolean;
  /** Running on the CPU although a card exists: speech can be many times slower. */
  cpuWarning: boolean;
}

export interface SwitchRuleView {
  id: string;
  layout?: string | undefined;
  app?: string | undefined;
  model: string;
  language?: string | undefined;
}

export interface SpeechModelsView {
  /** The model in use first, then installed ones, then the rest. */
  models: ModelCard[];
  table: TableRow[];
  /** Model id to name, for the table. */
  names: Record<string, string>;
  dictationLanguage: string;
  /** What the figures rest on. */
  sample: { recordings: Record<string, number>; words: Record<string, number>; machine: string };
  /** The model Speak Kit recommends for the dictation language when another one is in use. */
  recommendation?: { model: string; language: string };
  newer?: { id: string; name: string };
  /** Why this computer is limited, and the model to use instead (the smallest one that is quick enough on its CPU and accurate enough). */
  floor?: { message: string; useModel?: string };
  idleMinutes: number;
  device: DeviceView;
  disk: { total: number; folder: string };
  releaseOnClose: boolean;
  autoSwitch: { enabled: boolean; rules: SwitchRuleView[]; skippedRuleIds: string[] };
  switching?: string;
  recording: boolean;
  /** No speech model is installed. */
  noModel: boolean;
  /** The person chose to go on without a model. */
  skippedModel: boolean;
  /** Where the page is on a platform without a key hook: it still lists models but dictation cannot start. */
  dictationSupported: boolean;
  platform: "win32" | "darwin" | "linux";
}

export type SwitchOutcome = { ok: true } | { ok: false; reason: string; message: string };
export type ImportOutcome = { ok: true; id: string; name: string; alreadyThere: boolean } | { ok: false; reason: string; message: string } | { cancelled: true };
export interface FoundView {
  id: string;
  name: string;
  path: string;
}

export interface SpeechModelsBridge {
  view(): Promise<SpeechModelsView>;
  download(id: string): Promise<SpeechModelsView>;
  pauseDownload(id: string): Promise<SpeechModelsView>;
  resumeDownload(id: string): Promise<SpeechModelsView>;
  cancelDownload(id: string): Promise<SpeechModelsView>;
  /** Makes an installed model the one dictation uses: it is loaded first and the choice saved only when that worked. */
  use(id: string): Promise<SwitchOutcome>;
  cancelSwitch(): Promise<SpeechModelsView>;
  /** Deletes the model file in our folder; returns the bytes freed. */
  remove(id: string): Promise<number>;
  retryGraphicsCard(): Promise<SpeechModelsView>;
  /** Opens the file dialog and imports the chosen file. */
  importFile(kind: "multilingual" | "english", name: string): Promise<ImportOutcome>;
  /** Opens the file dialog to find an imported model whose copy is missing. */
  locateFile(id: string): Promise<ImportOutcome>;
  removeImported(id: string): Promise<SpeechModelsView>;
  /** Read-only scan of the usual folders for files that are exactly a catalog model. */
  scanDisk(): Promise<FoundView[]>;
  adoptFound(ids: string[]): Promise<SpeechModelsView>;
  dismissNewer(id: string): Promise<SpeechModelsView>;
  continueWithoutModel(): Promise<SpeechModelsView>;
  /** Measures what the loaded model takes in memory now. */
  measureMemory(): Promise<SpeechModelsView>;
  openProxySettings(): Promise<void>;
  openModelsFolder(): Promise<void>;
  onView(cb: (v: SpeechModelsView) => void): () => void;
}

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const text = (n: number) => v.pipe(v.string(), v.maxLength(n));

export const SPEECH_MODEL_ARGS = {
  view: v.tuple([]),
  download: v.tuple([id]),
  pauseDownload: v.tuple([id]),
  resumeDownload: v.tuple([id]),
  cancelDownload: v.tuple([id]),
  use: v.tuple([id]),
  cancelSwitch: v.tuple([]),
  remove: v.tuple([id]),
  retryGraphicsCard: v.tuple([]),
  importFile: v.tuple([v.picklist(["multilingual", "english"]), text(60)]),
  locateFile: v.tuple([id]),
  removeImported: v.tuple([id]),
  scanDisk: v.tuple([]),
  adoptFound: v.tuple([v.pipe(v.array(id), v.maxLength(8))]),
  dismissNewer: v.tuple([id]),
  continueWithoutModel: v.tuple([]),
  measureMemory: v.tuple([]),
  openProxySettings: v.tuple([]),
  openModelsFolder: v.tuple([]),
} as const satisfies Record<SpeechModelMethod, v.GenericSchema<unknown[]>>;
