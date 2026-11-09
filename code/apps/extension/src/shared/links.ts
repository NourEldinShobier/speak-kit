/** External destinations. */
export const LINKS = {
  /** Deep link the desktop app registers (Electron `setAsDefaultProtocolClient("speakkit")`). */
  launch: "speakkit://launch",
  download: "https://speakkit.app/download",
  learn: "https://speakkit.app",
  help: "https://speakkit.app/help",
  /** Where a user adds credit to an OpenAI account; opened in their browser. */
  billing: "https://platform.openai.com/settings/organization/billing/overview",
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
