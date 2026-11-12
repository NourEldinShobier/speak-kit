import type { PermissionId, PermissionState } from "./channels";

/** What each feature needs before it works. Dictation needs the key tap and the paste keys; reading the screen needs Screen Recording. */
export const FEATURE_PERMISSIONS = {
  dictation: ["microphone", "input-monitoring", "accessibility"],
  "screen-reading": ["screen-recording"],
  /** The call microphone, and on macOS the screen permission that the system's sound is taken through (Windows has none). */
  meetings: ["microphone", "screen-recording"],
} as const satisfies Record<string, readonly PermissionId[]>;
export type PermissionFeature = keyof typeof FEATURE_PERMISSIONS;

export type GuideAction = "request" | "open-settings" | "none";

export interface GuideStep {
  id: PermissionId;
  state: PermissionState;
  /** "request" while the system can still show its own prompt, "open-settings" once it was refused or has no prompt, "none" when nothing is left to do here. */
  action: GuideAction;
}

export interface Guide {
  steps: GuideStep[];
  /** The first step that still needs the person, or null when everything the feature needs is granted (or not needed on this system). */
  next: GuideStep | null;
}

export const FEATURES = Object.keys(FEATURE_PERMISSIONS) as PermissionFeature[];
const ready = (s: PermissionState) => s === "granted" || s === "not-needed";

/** Screen Recording has no system prompt of its own to call: it is granted in settings. */
const actionFor = (id: PermissionId, state: PermissionState): GuideAction => {
  if (ready(state)) return "none";
  if (state === "not-determined" && id !== "screen-recording") return "request";
  return "open-settings";
};

/** The key tap needs Input Monitoring and Accessibility; once both are allowed (or not needed here) a hotkey that failed to start can be tried again. */
export const hotkeyPermissionsReady = (states: Record<PermissionId, PermissionState>): boolean => ready(states["input-monitoring"]) && ready(states.accessibility);

/** The first-use steps for a feature, in the order the system should be asked. A state the system could not read ("unknown") counts as open, never as granted. */
export function guideFor(states: Record<PermissionId, PermissionState>, feature: PermissionFeature): Guide {
  const steps = FEATURE_PERMISSIONS[feature].map((id): GuideStep => ({ id, state: states[id], action: actionFor(id, states[id]) }));
  return { steps, next: steps.find((s) => !ready(s.state)) ?? null };
}
