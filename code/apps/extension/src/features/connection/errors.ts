import type { EngineState, ErrorCode } from "@speakkit/protocol";

export const ERROR_TEXT: Record<ErrorCode, string> = {
  "app-not-running": "SpeakKit could not reach the app. Is it running?",
  "token-rejected": "The SpeakKit app rejected the pairing token. Pair again in the extension options.",
  "engine-not-ready": "The voice engine is not ready yet.",
  "page-unreadable": "SpeakKit cannot read this page.",
  "file-access": "Allow access to file URLs for SpeakKit in the extension details to read local files.",
  "synthesis-failed": "Speech synthesis failed.",
  "version-mismatch": "The SpeakKit app and extension versions do not match. Update both.",
  "invalid-request": "The SpeakKit app could not understand the request. Update the extension and the app.",
  forbidden: "The SpeakKit app refused the request from this browser.",
  busy: "SpeakKit is busy reading something else. Try again in a moment.",
  "engine-unavailable": "That voice engine cannot run on this computer. Pick another engine in the SpeakKit app.",
  "clip-rejected": "The voice sample was not accepted. Record it again in the SpeakKit app.",
  "not-found": "SpeakKit could not find what it asked for. Update the extension and the app.",
};

/** Title and offered actions of the in-page error dock. */
export const errorText = (code?: ErrorCode, message?: string): { title: string; actions: ("open-app" | "retry" | "settings")[] } => {
  switch (code) {
    case "app-not-running": return { title: "SpeakKit isn't running", actions: ["open-app", "retry"] };
    case "token-rejected": return { title: "SpeakKit needs to be paired", actions: ["settings", "retry"] };
    case "engine-not-ready": return { title: "Voice engine is still loading", actions: ["retry"] };
    case "page-unreadable": return { title: "SpeakKit can't read this page", actions: [] };
    case "file-access": return { title: "Allow file access for SpeakKit", actions: ["settings"] };
    default: return { title: message || "Something went wrong", actions: ["retry"] };
  }
};

/**
 * One line for the engine state. "unloaded" is the normal resting state (the model is freed after idle) and is shown as
 * "Wakes on play", never as an error.
 */
export function engineText(state: EngineState, progress?: number): string {
  switch (state) {
    case "ready": return "Kokoro-82M is ready";
    case "unloaded": return "Wakes on play";
    case "loading": return "Kokoro-82M is starting";
    case "downloading": return `Downloading Kokoro-82M, ${Math.round((progress ?? 0) * 100)}%`;
    case "missing": return "Kokoro-82M is not installed";
    default: return "The voice engine reported an error";
  }
}

/** Short label for the badge in the popup header. */
export function engineBadge(state: EngineState | undefined): { tone: "ok" | "warn" | "err" | "neutral"; label: string } {
  switch (state) {
    case "unloaded": return { tone: "neutral", label: "Wakes on play" };
    case "loading": return { tone: "warn", label: "Loading model" };
    case "downloading": return { tone: "warn", label: "Downloading model" };
    case "missing": return { tone: "warn", label: "No voice engine" };
    case "error": return { tone: "err", label: "Engine error" };
    default: return { tone: "ok", label: "Kokoro ready" };
  }
}
