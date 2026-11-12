import type { Hardware } from "@speakkit/engine";
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
  const [voiceUse, speechUse, hw] = await Promise.all([modelUse("voice", voice, src.memoryOf), modelUse("speech", speech, src.memoryOf), src.hardware().catch(() => undefined)]);
  const device: DeviceInfo = {
    platform: hw?.platform ?? src.platform,
    arch: hw?.arch ?? src.arch,
    cores: hw?.cores ?? null,
    ramGb: hw?.memoryGb ?? null,
    gpu: hw?.gpu?.name ?? null,
    speechRunsOn: speechUse.state === "loaded" ? (speech.backend === "gpu" ? "graphics card" : speech.backend === "cpu" ? "CPU" : null) : null,
  };
  return { rows, totalMb: Math.round(rows.reduce((n, r) => n + r.mb, 0) * 10) / 10, models: [voiceUse, speechUse], device };
}
