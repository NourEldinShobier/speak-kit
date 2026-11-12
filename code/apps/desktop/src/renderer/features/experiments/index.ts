/**
 * Settings > Experiments. Features add their cards through `registerExperiment` (see registry.ts); the settings registry calls each feature's
 * registration function. This module exports the page.
 */
export { ExperimentsPage } from "./ExperimentsPage";
export { registerExperiment } from "./registry";
export type { ExperimentCard, ExperimentState } from "./registry";
