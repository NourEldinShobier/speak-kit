import { at } from "../i18n";
import "../i18n/packs/settings";
import "../i18n/packs/main";
/** One process as the operating system reports it (Electron's app metrics). */
export interface ProcessSample {
  type: string;
  name?: string | undefined;
  /** Working set in KB. */
  workingSetKb: number;
  /** Share of one core, in percent. */
  cpu: number;
}

export interface ResourceRow {
  label: string;
  mb: number;
  cpu: number;
}

/** What a process is called on the Performance page. A helper keeps its own name when it has one. */
export function processLabel(p: Pick<ProcessSample, "type" | "name">): string {
  switch (p.type) {
    case "Browser":
      return at("s.res.main");
    case "Tab":
      return at("s.res.windows");
    case "GPU":
      return at("s.res.graphics");
    case "Utility":
      return p.name?.trim() || at("s.res.helpers");
    default:
      return at("s.res.other");
  }
}

const mb = (kb: number) => Math.round((kb / 1024) * 10) / 10;

/** The processes grouped by what they are, largest first. A group's cpu is the sum of its members. */
export function resourceRows(samples: readonly ProcessSample[]): ResourceRow[] {
  const groups = new Map<string, { kb: number; cpu: number }>();
  for (const p of samples) {
    const g = groups.get(processLabel(p)) ?? { kb: 0, cpu: 0 };
    g.kb += Math.max(0, p.workingSetKb);
    g.cpu += Math.max(0, p.cpu);
    groups.set(processLabel(p), g);
  }
  return [...groups].map(([label, g]) => ({ label, mb: mb(g.kb), cpu: Math.round(g.cpu * 10) / 10 })).sort((a, b) => b.mb - a.mb || a.label.localeCompare(b.label));
}

export type ModelKind = "voice" | "speech";

export interface ModelUse {
  kind: ModelKind;
  name: string;
  /** "loaded" holds memory; anything else holds none we can measure. */
  state: "loaded" | "loading" | "unloaded" | "missing" | "error";
  /** Memory of the process that holds the model; null when it is not loaded or could not be read. */
  mb: number | null;
}

export interface DeviceInfo {
  platform: "win32" | "darwin" | "linux";
  arch: string;
  cores: number | null;
  ramGb: number | null;
  /** Name of the card the speech model would use, or null when none was found. */
  gpu: string | null;
  /** Where the speech model runs now, when it is loaded. */
  speechRunsOn: "graphics card" | "CPU" | null;
}

export interface Resources {
  rows: ResourceRow[];
  totalMb: number;
  models: ModelUse[];
  device: DeviceInfo;
}

const OS_NAME = { win32: "Windows", darwin: "macOS", linux: "Linux" } as const;

/** Label and value pairs for the device section; a value that is not known says so instead of being left out. */
export function deviceLines(d: DeviceInfo): { label: string; value: string }[] {
  return [
    { label: at("s.res.system"), value: `${OS_NAME[d.platform]} (${d.arch})` },
    { label: at("s.diag.processor"), value: d.cores ? at("s.diag.cores", { n: d.cores }) : at("s.res.notKnown") },
    { label: at("s.res.memory"), value: d.ramGb ? `${d.ramGb} GB` : at("s.res.notKnown") },
    { label: at("s.res.gpu"), value: d.gpu ?? at("s.res.noneFound") },
    { label: at("s.res.speechOn"), value: d.speechRunsOn ? at(d.speechRunsOn === "CPU" ? "s.res.cpuName" : "s.res.gpuCard") : at("s.res.notLoaded") },
  ];
}

const STATE_TEXT = { loaded: "s.res.loaded", loading: "s.res.loading", unloaded: "s.res.unloaded", missing: "engine.missing", error: "s.res.failed" } as const satisfies Record<
  ModelUse["state"],
  string
>;

/** One line for a model: its state, and its memory while it is loaded. */
export function modelText(m: ModelUse): string {
  if (m.state === "loaded") return m.mb === null ? at(STATE_TEXT.loaded) : at("s.res.loadedMb", { mb: Math.round(m.mb) });
  return at(STATE_TEXT[m.state]);
}

/** An engine state (voice or speech) mapped to the few this page shows. */
export function modelState(engineState: string | undefined): ModelUse["state"] {
  switch (engineState) {
    case "ready":
      return "loaded";
    case "loading":
    case "downloading":
      return "loading";
    case "unloaded":
      return "unloaded";
    case "error":
      return "error";
    default:
      return "missing";
  }
}
