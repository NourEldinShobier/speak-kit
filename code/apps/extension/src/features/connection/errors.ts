import type { EngineState, ErrorCode } from "@speakkit/protocol";

export const ERROR_TEXT: Record<ErrorCode, string> = {
  "app-not-running": "Speak Kit could not reach the app. Is it running?",
  "token-rejected": "The Speak Kit app rejected the pairing token. Pair again in the extension options.",
  "engine-not-ready": "The voice engine is not ready yet.",
  "page-unreadable": "Speak Kit found no text it can read on this page. Text in embedded frames it cannot reach is not available.",
  "file-access": "Allow access to file URLs for Speak Kit in the extension details to read local files.",
  "synthesis-failed": "Speech synthesis failed.",
  "version-mismatch": "The Speak Kit app and extension versions do not match. Update both.",
  "invalid-request": "The Speak Kit app could not understand the request. Update the extension and the app.",
  forbidden: "The Speak Kit app refused the request from this browser.",
  busy: "Speak Kit is busy reading something else. Try again in a moment.",
  "not-found": "Speak Kit could not find what it asked for. Update the extension and the app.",
};

/** Title and offered actions of the in-page error dock. */
export const errorText = (code?: ErrorCode, message?: string): { title: string; actions: ("open-app" | "retry" | "settings")[] } => {
  switch (code) {
    case "app-not-running":
      return { title: "Speak Kit isn't running", actions: ["open-app", "retry"] };
    case "token-rejected":
      return { title: "Speak Kit needs to be paired", actions: ["settings", "retry"] };
    case "engine-not-ready":
      return { title: "Voice engine is still loading", actions: ["retry"] };
    case "page-unreadable":
      return { title: "Speak Kit can't read this page", actions: [] };
    case "file-access":
      return { title: "Allow file access for Speak Kit", actions: ["settings"] };
    default:
      return { title: message || "Something went wrong", actions: ["retry"] };
  }
};

/**
 * One line for the engine state. "unloaded" is the normal resting state (the model is freed after idle) and is shown as
 * "Wakes on play", never as an error.
 */
export function engineText(state: EngineState, progress?: number): string {
  switch (state) {
    case "ready":
      return "Kokoro-82M is ready";
    case "unloaded":
      return "Wakes on play";
    case "loading":
      return "Kokoro-82M is starting";
    case "downloading":
      return `Downloading Kokoro-82M, ${Math.round((progress ?? 0) * 100)}%`;
    case "missing":
      return "Kokoro-82M is not installed";
    default:
      return "The voice engine reported an error";
  }
}

/** Short label for the badge in the popup header. */
export function engineBadge(state: EngineState | undefined): { tone: "ok" | "warn" | "err" | "neutral"; label: string } {
  switch (state) {
    case "unloaded":
      return { tone: "neutral", label: "Wakes on play" };
    case "loading":
      return { tone: "warn", label: "Loading model" };
    case "downloading":
      return { tone: "warn", label: "Downloading model" };
    case "missing":
      return { tone: "warn", label: "No voice engine" };
    case "error":
      return { tone: "err", label: "Engine error" };
    default:
      return { tone: "ok", label: "Kokoro ready" };
  }
}
