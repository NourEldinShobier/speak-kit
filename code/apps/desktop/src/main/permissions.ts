import { micAccessOf, type MicAccess } from "../shared/settings/permissions";

/** The operating-system side of the Privacy page. One implementation per system; `null` where the system has no such page. */
export interface PermissionsAdapter {
  micStatus(): MicAccess;
  /** Where the user changes the microphone permission, or null. */
  micSettingsUrl(): string | null;
}

interface MediaAccess {
  getMediaAccessStatus(kind: "microphone"): string;
}

const SETTINGS_URL: Record<string, string> = {
  win32: "ms-settings:privacy-microphone",
  darwin: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

export function createPermissions(platform: string, system: MediaAccess): PermissionsAdapter {
  const supported = platform === "win32" || platform === "darwin";
  return {
    micStatus: () => {
      if (!supported) return "unknown";
      try {
        return micAccessOf(system.getMediaAccessStatus("microphone"));
      } catch {
        return "unknown";
      }
    },
    micSettingsUrl: () => SETTINGS_URL[platform] ?? null,
  };
}
