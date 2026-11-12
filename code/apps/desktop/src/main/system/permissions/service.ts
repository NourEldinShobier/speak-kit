import { PERMISSION_IDS, type PermissionId, type PermissionState } from "../../../shared/permissions/channels";
import type { PermissionsStatus } from "../../../shared/permissions/contract";
import { FEATURES, guideFor } from "../../../shared/permissions/guide";

/** What one operating system can tell and do about its permissions. */
export interface PermissionsAdapter {
  platform: PermissionsStatus["platform"];
  read(id: PermissionId): Promise<PermissionState>;
  /** Shows the system's own prompt. False when the system has none for this permission (it is granted in settings only). */
  prompt(id: PermissionId): Promise<boolean>;
  /** Address of the settings pane for this permission, or null when there is none. */
  settingsUrl(id: PermissionId): string | null;
}

interface Deps {
  adapter: PermissionsAdapter;
  openUrl(url: string): Promise<void>;
  /** Called when the status differs from the last one reported. */
  onChange?(status: PermissionsStatus): void;
}

export interface Permissions {
  /** Reads every permission now; reports a change to `onChange` (call it again when the app window gets focus again: nothing tells us when the person flips a switch in System Settings). */
  status(): Promise<PermissionsStatus>;
  request(id: PermissionId): Promise<PermissionsStatus>;
  openSettings(id: PermissionId): Promise<boolean>;
}

export function createPermissions({ adapter, openUrl, onChange }: Deps): Permissions {
  let last = "";
  const read = async (id: PermissionId): Promise<PermissionState> => {
    try {
      return await adapter.read(id);
    } catch {
      return "unknown";
    }
  };
  const status = async (): Promise<PermissionsStatus> => {
    const states = Object.fromEntries(await Promise.all(PERMISSION_IDS.map(async (id) => [id, await read(id)]))) as PermissionsStatus["states"];
    const guides = Object.fromEntries(FEATURES.map((f) => [f, guideFor(states, f)])) as PermissionsStatus["guides"];
    const s: PermissionsStatus = { platform: adapter.platform, states, guides };
    const key = JSON.stringify(s);
    if (key !== last) {
      last = key;
      onChange?.(s);
    }
    return s;
  };
  const openSettings = async (id: PermissionId): Promise<boolean> => {
    const url = adapter.settingsUrl(id);
    if (!url) return false;
    try {
      await openUrl(url);
      return true;
    } catch {
      return false;
    }
  };
  return {
    status,
    openSettings,
    async request(id) {
      // The system shows its prompt once; after a refusal (or when it has none) only the settings pane can change the answer.
      const state = await read(id);
      const prompted = state === "not-determined" ? await adapter.prompt(id).catch(() => false) : false;
      if (!prompted && state !== "granted" && state !== "not-needed") await openSettings(id);
      return status();
    },
  };
}
