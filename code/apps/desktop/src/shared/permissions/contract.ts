import * as v from "valibot";
import { PERMISSION_IDS, type PermissionId, type PermissionMethod, type PermissionState } from "./channels";
import type { Guide, PermissionFeature } from "./guide";

export type { PermissionState };

export interface PermissionsStatus {
  platform: "darwin" | "win32" | "other";
  states: Record<PermissionId, PermissionState>;
  /** First-use steps per feature, in the order the system should be asked. */
  guides: Record<PermissionFeature, Guide>;
}

export interface PermissionsBridge {
  /** Reads every permission now. */
  status(): Promise<PermissionsStatus>;
  /** Asks the system to show its own prompt where it has one (Microphone, Accessibility, Input Monitoring); otherwise opens the matching settings pane. Returns the status afterwards. */
  request(id: PermissionId): Promise<PermissionsStatus>;
  /** Opens the system settings pane for this permission. False when this system has none. */
  openSettings(id: PermissionId): Promise<boolean>;
  onStatus(cb: (s: PermissionsStatus) => void): () => void;
}

const id = v.picklist(PERMISSION_IDS);

export const PERMISSION_ARGS = {
  status: v.tuple([]),
  request: v.tuple([id]),
  openSettings: v.tuple([id]),
} as const satisfies Record<PermissionMethod, v.GenericSchema<unknown[]>>;
