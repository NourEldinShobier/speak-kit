/** Whether the user agreed to the first-use card of voice chat (what is sent to OpenAI). Kept in this browser only; the options page can take it back. */
const KEY = "speakkit.voiceConsent";

export const hasVoiceConsent = async (): Promise<boolean> => !!(await chrome.storage.local.get(KEY))[KEY];
export const giveVoiceConsent = () => chrome.storage.local.set({ [KEY]: true });
export const forgetVoiceConsent = () => chrome.storage.local.remove(KEY);

/** Calls `cb` when the consent is given or forgotten; returns unsubscribe. */
export function onVoiceConsent(cb: (given: boolean) => void): () => void {
  const on = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && KEY in changes) cb(!!changes[KEY]?.newValue);
  };
  chrome.storage.onChanged.addListener(on);
  return () => chrome.storage.onChanged.removeListener(on);
}
