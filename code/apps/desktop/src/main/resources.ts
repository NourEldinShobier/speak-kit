import { STT_MODELS, type Hardware } from "@speakkit/engine";
import { modelState, resourceRows, type DeviceInfo, type ModelUse, type ProcessSample, type Resources } from "../shared/settings/resources";

/** What the collector reads from the running app; each one is a system boundary. */
export interface ResourceSources {
  processes(): ProcessSample[];
  /** The voice engine: its state, name and the process that holds the model. */
  voice(): { state: string | undefined; name: string; pid: number | undefined };
  /** The speech model of dictation. */
  speech(): { state: string | undefined; name: string; pid: number | undefined; backend: "gpu" | "cpu" | undefined };
  memoryOf(pid: number): Promise<number | undefined>;
  hardware(): Promise<Hardware>;
  /** Shown when the hardware probe fails. */
  platform: DeviceInfo["platform"];
  arch: string;
}

/** The catalog name of the selected speech model; a model the person added has only its id. */
export const speechModelName = (id: string): string => STT_MODELS.find((m) => m.id === id)?.name ?? id;

/** Reads the hardware once per run: the probe starts a PowerShell, and the computer does not change while the app runs. A failed probe is tried again. */
export function cachedHardware(probe: () => Promise<Hardware>): () => Promise<Hardware> {
  let held: Promise<Hardware> | undefined;
  return () => {
    held ??= probe().catch((e) => {
      held = undefined;
      throw e;
    });
    return held;
  };
}

/** A failed probe leaves the device values unknown; it never fails the page. */
const unknownDevice = (): undefined => undefined;

const RUNS_ON = { gpu: "graphics card", cpu: "CPU", none: null } as const;

async function modelUse(kind: ModelUse["kind"], s: { state: string | undefined; name: string; pid: number | undefined }, memoryOf: ResourceSources["memoryOf"]): Promise<ModelUse> {
  const state = modelState(s.state);
  const mb = state === "loaded" && s.pid ? ((await memoryOf(s.pid)) ?? null) : null;
  return { kind, name: s.name, state, mb };
}

/** The memory of every Speak Kit process, of the two models, and what this computer offers. A reading that fails leaves its value unknown. */
export async function collectResources(src: ResourceSources): Promise<Resources> {
  const rows = resourceRows(src.processes());
  const voice = src.voice();
  const speech = src.speech();
  const [voiceUse, speechUse, hw] = await Promise.all([modelUse("voice", voice, src.memoryOf), modelUse("speech", speech, src.memoryOf), src.hardware().catch(unknownDevice)]);
  const device: DeviceInfo = {
    platform: hw?.platform ?? src.platform,
    arch: hw?.arch ?? src.arch,
    cores: hw?.cores ?? null,
    ramGb: hw?.memoryGb ?? null,
    gpu: hw?.gpu?.name ?? null,
    speechRunsOn: speechUse.state === "loaded" ? RUNS_ON[speech.backend ?? "none"] : null,
  };
  return { rows, totalMb: Math.round(rows.reduce((n, r) => n + r.mb, 0) * 10) / 10, models: [voiceUse, speechUse], device };
}
