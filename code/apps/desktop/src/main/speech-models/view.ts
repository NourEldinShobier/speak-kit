import { PREFERRED_MODEL, accurateModelFits, checkFloor, languageTable, newerModelHint, resolveLanguage, type Hardware, type LanguageRow, type SttModel, type TransferInfo } from "@speakkit/engine";
import type { DownloadError } from "@speakkit/engine";
import type { EnginesConfig } from "../../shared/speech-models/config";
import type { DeviceView, ModelCard, SpeechModelsView } from "../../shared/speech-models/contract";

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
  /** A download that waits for the running one to end. */
  queued: string | undefined;
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

const PLATFORMS = { win32: "win32", darwin: "darwin" } as const;
const platformOf = (p: NodeJS.Platform): "win32" | "darwin" | "linux" => PLATFORMS[p as keyof typeof PLATFORMS] ?? "linux";

/** What is wrong with running on this computer, per model: nothing, or the sentence the card shows. */
function blockedReason(m: SttModel, hw: Hardware | undefined, installed: boolean): string | undefined {
  const floor = hw ? checkFloor(hw) : ({ ok: true } as const);
  if (!floor.ok) return floor.message;
  const fits = hw ? accurateModelFits(hw) : ({ fits: true } as const);
  return !fits.fits && m.engine === "whisper" && m.origin === "builtin" && !installed ? fits.reason : undefined;
}

function transferOf(i: ViewInput, id: string): ModelCard["transfer"] {
  const t = i.transfers.find((x) => x.id === id);
  if (t) return { state: t.state, fraction: t.fraction, ...(t.etaSeconds !== undefined && { etaSeconds: t.etaSeconds }) };
  return i.preparing === id ? { state: "preparing", fraction: 1 } : undefined;
}

function cardOf(m: SttModel, i: ViewInput, rows: readonly LanguageRow[]): ModelCard {
  const installed = i.installed.has(m.id);
  const card: ModelCard = {
    id: m.id,
    name: m.name,
    tag: m.tag,
    description: m.description,
    bytes: m.bytes,
    installed,
    inUse: m.id === i.selected && installed,
    languages: [...m.languages],
    recommendedFor: rows.filter((r) => r.recommended === m.id).map((r) => r.language),
    license: m.license,
    origin: m.origin,
    diskBytes: i.diskPerModel[m.id] ?? 0,
  };
  return { ...card, ...infoOf(m, i), ...stateOf(m, i, installed) };
}

/** Facts about the model itself: how good and how fast it is, what it takes in memory (only when measured here), and a language note. */
function infoOf(m: SttModel, i: ViewInput): Partial<ModelCard> {
  return {
    ...(m.accuracy && { accuracy: { oneIn: m.accuracy.wrongWordOneIn, testLanguage: m.accuracy.testLanguage, source: m.accuracy.source } }),
    ...(m.speedSeconds !== undefined && { speedSeconds: m.speedSeconds }),
    ...(i.measured?.id === m.id && { memory: { mb: i.measured.mb, setup: i.measured.setup } }),
    ...(i.languageNote?.model === m.id && { languageNote: i.languageNote.text }),
  };
}

/** What is happening to the model now: a download, a failure, a reason it cannot run here, a missing file. */
function stateOf(m: SttModel, i: ViewInput, installed: boolean): Partial<ModelCard> {
  const failed = i.failure?.id === m.id ? i.failure.error : undefined;
  const transfer = transferOf(i, m.id);
  const blocked = blockedReason(m, i.hardware, installed);
  return {
    ...(transfer && { transfer }),
    ...(failed && { failure: { kind: failed.kind, message: failed.message, host: failed.host, keptBytes: failed.keptBytes, advice: failed.advice } }),
    ...(blocked && { blocked }),
    ...(i.queued === m.id && { queuedBehind: true }),
    ...(m.origin === "custom" && i.missingFiles.has(m.id) && { fileMissing: true }),
  };
}

/** The model in use first, then installed ones, then the ones the person added, then the rest; the catalog order decides inside each group. */
function ordered(cards: readonly ModelCard[]): ModelCard[] {
  const rank = (c: ModelCard) => {
    if (c.inUse) return 0;
    if (c.installed) return 1;
    return c.origin === "custom" ? 2 : 3;
  };
  return cards
    .map((c, n) => ({ c, n }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.n - b.n)
    .map((x) => x.c);
}

function deviceOf(i: ViewInput): DeviceView {
  const gpu = i.hardware?.gpu;
  return {
    choice: i.config.device,
    failed: i.config.failedDevices,
    movedToCpuByMemory: i.movedToCpuByMemory,
    cpuWarning: i.backend === "cpu" && !!gpu && i.config.device !== "cpu",
    ...(i.backend && { backend: i.backend }),
    ...(gpu && { gpuName: gpu.name, driver: gpu.driver }),
    ...(i.hardware?.cores !== undefined && { cores: i.hardware.cores }),
    ...(i.hardware?.memoryGb !== undefined && { memoryGb: i.hardware.memoryGb }),
  };
}

/** Why this computer is limited: it cannot run speech at all, or it is too slow for the accurate model. */
function floorOf(hw: Hardware | undefined): string | undefined {
  if (!hw) return undefined;
  const floor = checkFloor(hw);
  if (!floor.ok) return floor.message;
  const fits = accurateModelFits(hw);
  return fits.fits ? undefined : fits.reason;
}

export function buildView(i: ViewInput): SpeechModelsView {
  const rows = languageTable(i.catalog, PREFERRED_MODEL);
  const current = i.catalog.find((m) => m.id === i.selected);
  const rec = rows.find((r) => r.language === i.language)?.recommended;
  const newer = newerModelHint(i.catalog, i.installed, i.config.dismissedHints);
  const rules = i.config.autoSwitch.rules;
  const floor = floorOf(i.hardware);
  return {
    models: ordered(i.catalog.map((m) => cardOf(m, i, rows))),
    table: rows.map((r) => ({ language: r.language, recommended: r.recommended, alsoWorks: r.alsoWorks })),
    names: Object.fromEntries(i.catalog.map((m) => [m.id, m.name])),
    dictationLanguage: current ? resolveLanguage(current, i.language).language : i.language,
    idleMinutes: i.config.idleMinutes,
    device: deviceOf(i),
    disk: { total: i.diskTotal, folder: i.folder },
    releaseOnClose: i.config.releaseOnClose,
    autoSwitch: { enabled: i.config.autoSwitch.enabled, rules: rules.map((r) => ({ ...r })), skippedRuleIds: rules.filter((r) => !i.installed.has(r.model)).map((r) => r.id) },
    recording: i.recording,
    noModel: i.installed.size === 0,
    skippedModel: i.config.skippedModel,
    dictationSupported: i.dictationSupported,
    platform: platformOf(i.platform),
    ...(rec && current && rec !== current.id && !i.installed.has(rec) && { recommendation: { model: rec, language: i.language } }),
    ...(newer && { newer: { id: newer.id, name: newer.name } }),
    ...(floor && { floor: { message: floor } }),
    ...(i.switching && { switching: i.switching }),
  };
}
