import type { PermissionId, PermissionState } from "../../../shared/permissions/channels";
import type { AccessState } from "../../dictation/macos/native";
import type { PermissionsAdapter } from "./service";

/** The parts of Electron's systemPreferences used here. */
export interface Prefs {
  isTrustedAccessibilityClient(prompt: boolean): boolean;
  getMediaAccessStatus(kind: "microphone" | "screen"): string;
  askForMediaAccess(kind: "microphone"): Promise<boolean>;
}

export interface MacInputMonitoring {
  status(): AccessState;
  request(): boolean;
}

const MEDIA_STATES: readonly PermissionState[] = ["granted", "denied", "not-determined", "restricted", "unknown"];
const media = (raw: string): PermissionState => ((MEDIA_STATES as readonly string[]).includes(raw) ? (raw as PermissionState) : "unknown");

const MAC_PANES: Record<PermissionId, string> = {
  accessibility: "Privacy_Accessibility",
  "input-monitoring": "Privacy_ListenEvent",
  microphone: "Privacy_Microphone",
  "screen-recording": "Privacy_ScreenCapture",
};

export function macAdapter(prefs: Prefs, inputMonitoring: () => Promise<MacInputMonitoring>): PermissionsAdapter {
  return {
    platform: "darwin",
    async read(id) {
      switch (id) {
        // The system does not say "refused" for Accessibility, only "not trusted": the prompt is still worth showing.
        case "accessibility":
          return prefs.isTrustedAccessibilityClient(false) ? "granted" : "not-determined";
        case "input-monitoring": {
          const s = (await inputMonitoring()).status();
          return s === "unknown" ? "not-determined" : s;
        }
        case "microphone":
          return media(prefs.getMediaAccessStatus("microphone"));
        case "screen-recording":
          return media(prefs.getMediaAccessStatus("screen"));
      }
    },
    async prompt(id) {
      switch (id) {
        case "accessibility":
          prefs.isTrustedAccessibilityClient(true);
          return true;
        case "input-monitoring":
          (await inputMonitoring()).request();
          return true;
        case "microphone":
          await prefs.askForMediaAccess("microphone");
          return true;
        case "screen-recording":
          return false;
      }
    },
    settingsUrl: (id) => `x-apple.systempreferences:com.apple.preference.security?${MAC_PANES[id]}`,
  };
}

/** Windows has a microphone switch only; the other permissions do not exist there. */
export function windowsAdapter(prefs: Pick<Prefs, "getMediaAccessStatus">): PermissionsAdapter {
  return {
    platform: "win32",
    read: async (id) => (id === "microphone" ? media(prefs.getMediaAccessStatus("microphone")) : "not-needed"),
    prompt: async () => false,
    settingsUrl: (id) => (id === "microphone" ? "ms-settings:privacy-microphone" : null),
  };
}

export const noPermissionsAdapter: PermissionsAdapter = { platform: "other", read: async () => "not-needed", prompt: async () => false, settingsUrl: () => null };
