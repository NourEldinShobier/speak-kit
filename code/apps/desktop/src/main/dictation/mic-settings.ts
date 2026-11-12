import { shell } from "electron";

/** The system page where microphone access is allowed; a platform without one has nothing to open. */
export const MIC_SETTINGS_URL: Partial<Record<NodeJS.Platform, string>> = {
  win32: "ms-settings:privacy-microphone",
  darwin: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

export async function openMicrophoneSettings(platform: NodeJS.Platform = process.platform): Promise<void> {
  const url = MIC_SETTINGS_URL[platform];
  if (url) await shell.openExternal(url);
}
