import type { Config } from "../schemas";

export type Audience = "everyone" | "dev";

export interface Experiment {
  /** Stable key stored in the settings file; never reuse one. */
  id: string;
  title: string;
  /** What it does, one or two sentences. */
  summary: string;
  /** The warning line shown on the card. */
  warning: string;
  group: string;
  /** Everyone sees it; dev only on a build run from source. */
  audience: Audience;
  /** Turning it on or off needs the app to restart. */
  needsRestart?: boolean;
  /** How it stops being an experiment (written down, shown on the card). */
  graduation: string;
}

const registry = new Map<string, Experiment>();

/** Other features add their toggles here at import time. Every experiment is off until the user turns it on. */
export function registerExperiment(e: Experiment): void {
  if (registry.has(e.id)) throw new Error(`experiment ${e.id} is already registered`);
  if (!e.graduation.trim()) throw new Error(`experiment ${e.id} needs a graduation path`);
  registry.set(e.id, e);
}

export function experiments(): Experiment[] {
  return [...registry.values()];
}

/** The experiments the user may see: dev ones only when `dev` is true. */
export function visibleExperiments(dev: boolean, list: readonly Experiment[] = experiments()): Experiment[] {
  return list.filter((e) => e.audience === "everyone" || dev);
}

/** Off unless the user switched it on; an unknown id or a dev-only one in an everyone build is off. */
export function isExperimentOn(config: Pick<Config, "experiments">, id: string, dev = false): boolean {
  const e = registry.get(id);
  if (!e) return false;
  if (e.audience === "dev" && !dev) return false;
  return config.experiments[id] === true;
}

export function groupExperiments(list: readonly Experiment[]): { group: string; items: Experiment[] }[] {
  const out: { group: string; items: Experiment[] }[] = [];
  for (const e of list) {
    const g = out.find((x) => x.group === e.group);
    if (g) g.items.push(e);
    else out.push({ group: e.group, items: [e] });
  }
  return out;
}

/** The experiment flags after one toggle; never mutates its input. */
export function toggled(flags: Config["experiments"], id: string, on: boolean): Config["experiments"] {
  const next = { ...flags };
  if (on) next[id] = true;
  else delete next[id];
  return next;
}

export function needsRestart(before: Config["experiments"], after: Config["experiments"], list: readonly Experiment[] = experiments()): boolean {
  return list.some((e) => e.needsRestart && (before[e.id] === true) !== (after[e.id] === true));
}

// Features that are designed but not built yet. Developers see them; the flag is stored, nothing reads it yet.
registerExperiment({
  id: "live-dictation-preview",
  title: "Live dictation preview",
  summary: "Shows your words while you are still holding the key, before the final text is inserted.",
  warning: "Text can change as you keep talking.",
  group: "Dictation",
  audience: "dev",
  graduation: "Becomes a Dictation setting after two releases without a reported problem.",
});
registerExperiment({
  id: "pause-shortcuts-in-apps",
  title: "Pause shortcuts in chosen apps",
  summary: "Turns the Speak Kit keys off while a game or remote desktop app is in front.",
  warning: "Reads the name of the front app. It never reads what is in the window.",
  group: "Shortcuts",
  audience: "dev",
  needsRestart: true,
  graduation: "Moves to the Shortcuts page once it works on both Windows and macOS.",
});
registerExperiment({
  id: "caption-export",
  title: "Caption export",
  summary: "Saves a reading as a subtitle file (.srt) or a caption file (.vtt).",
  warning: "Timings are estimated and can drift by half a second on long texts.",
  group: "Read",
  audience: "dev",
  graduation: "Joins the export dialog when timings come from the engine instead of an estimate.",
});
