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
      return "Speak Kit (main)";
    case "Tab":
      return "Windows";
    case "GPU":
      return "Graphics";
    case "Utility":
      return p.name?.trim() || "Helpers";
    default:
      return "Other";
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
    { label: "System", value: `${OS_NAME[d.platform]} (${d.arch})` },
    { label: "Processor", value: d.cores ? `${d.cores} cores` : "Not known" },
    { label: "Memory", value: d.ramGb ? `${d.ramGb} GB` : "Not known" },
    { label: "Graphics card", value: d.gpu ?? "None found" },
    { label: "Speech model runs on", value: d.speechRunsOn ?? "Not loaded" },
  ];
}

const STATE_TEXT: Record<ModelUse["state"], string> = {
  loaded: "Loaded",
  loading: "Loading",
  unloaded: "Not loaded, wakes when needed",
  missing: "Not downloaded",
  error: "Failed to load",
};

/** One line for a model: its state, and its memory while it is loaded. */
export function modelText(m: ModelUse): string {
  if (m.state === "loaded") return m.mb === null ? STATE_TEXT.loaded : `${STATE_TEXT.loaded}, ${Math.round(m.mb)} MB`;
  return STATE_TEXT[m.state];
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
