import { lazy } from "react";

/**
 * Capture in the app window: the Captures list with search, the opened capture, Settings and Privacy, and the playground. The capsule, the picker and
 * the hidden recorder are separate pages that the main process opens in their own windows (capsule-main, overlay-main, recorder-main). The page loads
 * on first use; the Experiments cards register at start.
 */
export const CapturePage = lazy(() => import("./CapturePage").then((m) => ({ default: m.CapturePage })));
export { registerCaptureExperiments } from "./experiments";
