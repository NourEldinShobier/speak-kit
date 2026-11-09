/** External destinations. */
export const LINKS = {
  /** Deep link the desktop app registers (Electron `setAsDefaultProtocolClient("speakkit")`). */
  launch: "speakkit://launch",
  download: "https://speakkit.app/download",
  learn: "https://speakkit.app",
  help: "https://speakkit.app/help",
  shortcuts: "chrome://extensions/shortcuts",
};
export const extensionSettingsUrl = () => `chrome://extensions/?id=${typeof chrome !== "undefined" ? chrome.runtime.id : ""}`;

export async function openUrl(url: string): Promise<void> {
  try {
    await chrome.tabs.create({ url });
  } catch {
    /* blocked scheme */
  }
}

/** Chrome's page for the permissions of this extension (microphone among them). */
export const siteSettingsUrl = () => `chrome://settings/content/siteDetails?site=${encodeURIComponent(`chrome-extension://${chrome.runtime.id}`)}`;
