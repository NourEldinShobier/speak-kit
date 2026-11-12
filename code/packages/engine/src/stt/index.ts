/**
 * Speech to text for dictation: whisper.cpp through @fugood/whisper.node in a child process.
 * Does: model catalog and language table, resumable checksummed download with failures that name the host, one transfer per model, device choice with failed cards remembered per driver, hardware floor, idle release, importing and finding model files, safe model switching and automatic rules, Silero voice gate before every transcription, GPU with CPU fallback, background warm-up.
 * Does not: record audio, decide when to record, or insert text anywhere.
 */
export { WhisperStt, type SpeechToText, type SttOptions, type Transcript } from "./engine";
export {
  DEFAULT_STT_MODEL,
  FEATURED_STT_MODELS,
  PREFERRED_MODEL,
  PREFERRED_MODEL_CPU,
  STT_MODELS,
  STT_VAD,
  isCustomModelId,
  type CustomSttModelId,
  type ModelFile,
  type SttModel,
  type SttModelId,
} from "./catalog";
export {
  AUTO_LABEL,
  LANGUAGES,
  STT_LANGUAGE_CODES,
  isSttLanguage,
  languageLabel,
  languageTable,
  resolveLanguage,
  type LanguageFacts,
  type LanguageRow,
  type ResolvedPair,
  type SpokenLanguage,
  type SttLanguage,
} from "./languages";
export { DownloadError, hostOf, type DownloadAdvice, type DownloadFailureKind } from "./download-error";
export { downloadModel, modelPresent, type DownloadOptions } from "./download";
export { Transfers, type TransferInfo, type TransferRun } from "./transfers";
export {
  CPU_SLOWDOWN_WARNING,
  DEVICE_CHOICES,
  forgetFailure,
  isOutOfMemory,
  onGpuFailure,
  pickFaster,
  planDevice,
  recordFailure,
  sameDevice,
  type DeviceChoice,
  type DevicePlan,
  type FailedDevice,
  type GpuInfo,
} from "./device";
export { accurateModelFits, checkFloor, deviceInUse, hasFastGraphics, type FloorVerdict, type Hardware } from "./hardware";
export { MEASUREMENT_SAMPLE, type Measured } from "./measured";
export { cpuFloorModel, quickOn, recommendFor, recommendedPreference, tenSecondSeconds, wrongWords, type Device } from "./recommend";
export { DEFAULT_IDLE_MINUTES, IDLE_CHOICES, IdleRelease, type IdleDeps, type IdleMinutes } from "./idle";
export {
  adoptFound,
  deleteModelFiles,
  diskUse,
  findModelsOnDisk,
  importedAsModel,
  importModelFile,
  inspectModelFile,
  loadImported,
  missingImported,
  readHeader,
  removeImported,
  sha256File,
  type DiskUse,
  type FoundModel,
  type ImportedModel,
  type ImportResult,
  type Inspection,
} from "./model-files";
export { AutoSwitch, ModelSwitcher, RULE_WAIT_MS, matchRule, newerModelHint, type RuleContext, type SwitchResult, type SwitchRule } from "./switching";
export { formatReport, recall, wordErrorRate, words, type CompareRow } from "./compare";
