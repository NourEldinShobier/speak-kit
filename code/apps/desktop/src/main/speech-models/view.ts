import { PREFERRED_MODEL, accurateModelFits, checkFloor, languageTable, newerModelHint, resolveLanguage, type FailedDevice, type Hardware, type SttModel, type TransferInfo } from "@speakkit/engine";
import type { DownloadError } from "@speakkit/engine";
import type { EnginesConfig } from "../../shared/speech-models/config";
import type { ModelCard, SpeechModelsView } from "../../shared/speech-models/contract";

/** Everything the page shows is computed from these inputs, so the whole page state can be tested without Electron or an engine. */
export interface ViewInput {
  catalog: readonly SttModel[];
  /** Ids of models whose files are on disk. */
  installed: ReadonlySet<string>;
  /** Imported models whose copy in our folder is gone. */
  missingFiles: ReadonlySet<string>;
  selected: string;
  language: string;
  config: EnginesConfig;
  hardware: Hardware | undefined;
  transfers: readonly TransferInfo[];
  /** A model is being loaded after a download. */
  preparing: string | undefined;
  failure: { id: string; error: DownloadError } | undefined;
  diskPerModel: Readonly<Record<string, number>>;
  diskTotal: number;
  folder: string;
  backend: "gpu" | "cpu" | undefined;
  movedToCpuByMemory: boolean;
  /** Measured memory of the loaded model on this computer. */
  measured: { id: string; mb: number; setup: string } | undefined;
  switching: string | undefined;
  recording: boolean;
  dictationSupported: boolean;
  platform: NodeJS.Platform;
  /** The note shown on the row of the model whose language was changed to fit it. */
  languageNote: { model: string; text: string } | undefined;
}

const platformOf = (p: NodeJS.Platform): "win32" | "darwin" | "linux" => (p === "win32" || p === "darwin" ? p : "linux");

/** The recommended-model table, with the model names for it. */
function table(catalog: readonly SttModel[]) {
  return languageTable(catalog, PREFERRED_MODEL);
}

export function buildView(i: ViewInput): SpeechModelsView {
  const rows = table(i.catalog);
  const floor = i.hardware ? checkFloor(i.hardware) : ({ ok: true } as const);
  const fits = i.hardware ? accurateModelFits(i.hardware) : ({ fits: true } as const);
  const recommendedFor = (id: string) => rows.filter((r) => r.recommended === id).map((r) => r.language);

  const cards: ModelCard[] = i.catalog.map((m) => {
    const transfer = i.transfers.find((t) => t.id === m.id);
    const failed = i.failure?.id === m.id ? i.failure.error : undefined;
    const card: ModelCard = {
      id: m.id,
      name: m.name,
      tag: m.tag,
      description: m.description,
      bytes: m.bytes,
      installed: i.installed.has(m.id),
      inUse: m.id === i.selected && i.installed.has(m.id),
      languages: [...m.languages],
      recommendedFor: recommendedFor(m.id),
      license: m.license,
      origin: m.origin,
      diskBytes: i.diskPerModel[m.id] ?? 0,
    };
    if (m.accuracy) card.accuracy = { oneIn: m.accuracy.wrongWordOneIn, testLanguage: m.accuracy.testLanguage, source: m.accuracy.source };
    if (m.speedSeconds !== undefined) card.speedSeconds = m.speedSeconds;
    if (transfer) card.transfer = { state: transfer.state, fraction: transfer.fraction, ...(transfer.etaSeconds !== undefined && { etaSeconds: transfer.etaSeconds }) };
    else if (i.preparing === m.id) card.transfer = { state: "preparing", fraction: 1 };
    if (failed) card.failure = { kind: failed.kind, message: failed.message, host: failed.host, keptBytes: failed.keptBytes, advice: failed.advice };
    if (m.engine === "whisper" && m.origin === "builtin" && !fits.fits && !card.installed) card.blocked = fits.reason;
    if (!floor.ok) card.blocked = floor.message;
    if (m.origin === "custom" && i.missingFiles.has(m.id)) card.fileMissing = true;
    if (i.measured?.id === m.id) card.memory = { mb: i.measured.mb, setup: i.measured.setup };
    if (i.languageNote?.model === m.id) card.languageNote = i.languageNote.text;
    return card;
  });
  // The model in use first, then installed ones, then the rest; the catalog order decides inside each group.
  const rank = (c: ModelCard) => (c.inUse ? 0 : c.installed ? 1 : c.origin === "custom" ? 2 : 3);
  const models = cards.map((c, n) => ({ c, n })).sort((a, b) => rank(a.c) - rank(b.c) || a.n - b.n).map((x) => x.c);

  const current = i.catalog.find((m) => m.id === i.selected);
  const rec = rows.find((r) => r.language === i.language)?.recommended;
  const recommendation = rec && current && rec !== current.id && !i.installed.has(rec) ? { model: rec, language: i.language } : undefined;

  const installedIds = new Set([...i.installed]);
  const newer = newerModelHint(i.catalog, installedIds, i.config.dismissedHints);
  const failed: FailedDevice[] = i.config.failedDevices;
  const gpu = i.hardware?.gpu;
  const rules = i.config.autoSwitch.rules;
  const skippedRuleIds = rules.filter((r) => !i.installed.has(r.model)).map((r) => r.id);

  const view: SpeechModelsView = {
    models,
    table: rows.map((r) => ({ language: r.language, recommended: r.recommended, alsoWorks: r.alsoWorks })),
    names: Object.fromEntries(i.catalog.map((m) => [m.id, m.name])),
    dictationLanguage: current ? resolveLanguage(current, i.language).language : i.language,
    idleMinutes: i.config.idleMinutes,
    device: {
      choice: i.config.device,
      failed,
      movedToCpuByMemory: i.movedToCpuByMemory,
      cpuWarning: i.backend === "cpu" && !!gpu && i.config.device !== "cpu",
    },
    disk: { total: i.diskTotal, folder: i.folder },
    releaseOnClose: i.config.releaseOnClose,
    autoSwitch: { enabled: i.config.autoSwitch.enabled, rules: rules.map((r) => ({ ...r })), skippedRuleIds },
    recording: i.recording,
    noModel: i.installed.size === 0,
    skippedModel: i.config.skippedModel,
    dictationSupported: i.dictationSupported,
    platform: platformOf(i.platform),
  };
  if (i.backend) view.device.backend = i.backend;
  if (gpu) (view.device.gpuName = gpu.name), (view.device.driver = gpu.driver);
  if (i.hardware?.cores !== undefined) view.device.cores = i.hardware.cores;
  if (i.hardware?.memoryGb !== undefined) view.device.memoryGb = i.hardware.memoryGb;
  if (recommendation) view.recommendation = recommendation;
  if (newer) view.newer = { id: newer.id, name: newer.name };
  if (!floor.ok) view.floor = { message: floor.message };
  else if (!fits.fits) view.floor = { message: fits.reason };
  if (i.switching) view.switching = i.switching;
  return view;
}
