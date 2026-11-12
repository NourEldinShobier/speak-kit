export interface NetworkHost {
  host: string;
  why: string;
  /** What triggers the connection. */
  when: "always" | "on-use" | "on-request";
}

/** Every address Speak Kit can reach. Nothing else is contacted and nothing is sent for analytics. */
export const NETWORK_HOSTS: readonly NetworkHost[] = [
  { host: "github.com, api.github.com", why: "Looks for new versions and downloads them.", when: "always" },
  { host: "huggingface.co", why: "Downloads the voice model once, on first use.", when: "on-request" },
  { host: "api.openai.com", why: "Voice chat, only when you add your own key and start a chat.", when: "on-use" },
  { host: "The address you type", why: "Fetches a web page when you add a reading from a link.", when: "on-request" },
  { host: "127.0.0.1 (this computer)", why: "The local voice server the browser extension talks to.", when: "always" },
];

export const WHEN_LABEL: Record<NetworkHost["when"], string> = { always: "Automatic", "on-use": "When you use it", "on-request": "When you ask" };

export const NO_TELEMETRY = "Speak Kit sends no usage data, crash reports or analytics. Your text and audio stay on this computer.";
