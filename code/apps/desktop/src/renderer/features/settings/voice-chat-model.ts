import type { VoiceChatKeyStatus, VoiceChatSaveResult, VoiceChatTestResult } from "../../../shared/voice-chat";

export interface Notice {
  tone: "ok" | "error" | "info";
  text: string;
}

export interface CardState {
  /** Null until main answered. */
  status: VoiceChatKeyStatus | null;
  /** What is being typed. The only place the renderer ever holds a key; cleared on save. */
  draft: string;
  reveal: boolean;
  /** The one operation in flight; its result is the only one the card accepts. */
  busy: "save" | "test" | "remove" | null;
  notice: Notice | null;
}

export type CardAction =
  | { type: "loaded"; status: VoiceChatKeyStatus }
  | { type: "draft"; text: string }
  | { type: "reveal" }
  | { type: "invalid" }
  | { type: "busy"; what: "save" | "test" | "remove" }
  | { type: "saved"; result: VoiceChatSaveResult }
  | { type: "tested"; result: VoiceChatTestResult }
  | { type: "removed"; status: VoiceChatKeyStatus }
  | { type: "failed" };

export const initCard = (): CardState => ({ status: null, draft: "", reveal: false, busy: null, notice: null });

export const NO_ENCRYPTION = "This computer cannot encrypt secrets, so Speak Kit cannot store a key here.";
export const KEY_HELP = "Stored on this computer, encrypted by your operating system. Sent only to OpenAI.";

const TEST_TEXT = {
  "key-rejected": "OpenAI did not accept this key",
  "no-credit": "Your OpenAI account has no credit",
  "rate-limited": "OpenAI is limiting requests right now. Try again in a minute.",
  offline: "Speak Kit could not reach OpenAI. Check your internet connection.",
  unavailable: "OpenAI is not answering right now. Try again later.",
  "no-key": "The saved key could not be read. Remove it and save it again.",
} as const;

const SAVE_TEXT = {
  "encryption-unavailable": NO_ENCRYPTION,
  "save-failed": "The key could not be saved.",
} as const;

function afterSave(s: CardState, result: VoiceChatSaveResult): CardState {
  if (result.ok) return { ...s, status: { hasKey: true, canEncrypt: true }, draft: "", reveal: false, busy: null, notice: { tone: "ok", text: "Key saved" } };
  const status = result.code === "encryption-unavailable" && s.status ? { ...s.status, canEncrypt: false } : s.status;
  return { ...s, busy: null, status, notice: { tone: "error", text: SAVE_TEXT[result.code] } };
}

function afterTest(s: CardState, result: VoiceChatTestResult): CardState {
  return { ...s, busy: null, notice: result.ok ? { tone: "ok", text: "OpenAI accepted this key" } : { tone: "error", text: TEST_TEXT[result.code] } };
}

function afterRemove(s: CardState, status: VoiceChatKeyStatus): CardState {
  return { ...s, busy: null, status, draft: "", reveal: false, notice: { tone: "info", text: "Key removed" } };
}

export function cardReducer(s: CardState, a: CardAction): CardState {
  switch (a.type) {
    case "loaded":
      return { ...s, status: a.status };
    case "draft":
      return { ...s, draft: a.text, reveal: a.text ? s.reveal : false, notice: null };
    case "reveal":
      return { ...s, reveal: !s.reveal };
    case "invalid":
      return { ...s, notice: { tone: "error", text: "That does not look like an OpenAI API key. It starts with sk-." } };
    case "busy":
      return { ...s, busy: a.what, notice: a.what === "test" ? { tone: "info", text: "Checking the key with OpenAI" } : null };
    case "saved":
      return s.busy === "save" ? afterSave(s, a.result) : s;
    case "tested":
      return s.busy === "test" ? afterTest(s, a.result) : s;
    case "removed":
      return s.busy === "remove" ? afterRemove(s, a.status) : s;
    case "failed":
      return { ...s, busy: null, notice: { tone: "error", text: "Speak Kit could not do that. Try again." } };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** The state of the key in words, for the row label. */
export function keyLine(s: CardState): string {
  if (!s.status) return "Checking for a saved key";
  return s.status.hasKey ? "Key saved" : "No key saved";
}
