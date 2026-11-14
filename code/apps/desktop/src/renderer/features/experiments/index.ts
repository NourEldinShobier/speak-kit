/**
 * Settings > Experiments. Features add their cards through `registerExperiment` (see registry.ts); the settings registry calls each feature's
 * registration function. This module exports the capture-style cards the Settings page lists.
 */
export { ExperimentCards } from "./ExperimentsPage";
export { experimentCards, registerExperiment } from "./registry";
export type { ExperimentState } from "./registry";
