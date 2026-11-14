import type { VoiceChatKeyStatus, VoiceChatSaveResult, VoiceChatTestResult } from "../../../shared/voice-chat";
import { at } from "../../../shared/i18n";
import "../../../shared/i18n/packs/voices";

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

export const noEncryption = (): string => at("vc.noEncryption");
export const keyHelp = (): string => at("vc.help");

const TEST_TEXT = { "key-rejected": "vc.t.rejected", "no-credit": "vc.t.noCredit", "rate-limited": "vc.t.rateLimited", offline: "vc.t.offline", unavailable: "vc.t.unavailable", "no-key": "vc.t.noKey" } as const;

const SAVE_TEXT = { "encryption-unavailable": "vc.noEncryption", "save-failed": "vc.saveFailed" } as const;

function afterSave(s: CardState, result: VoiceChatSaveResult): CardState {
  if (result.ok) return { ...s, status: { hasKey: true, canEncrypt: true }, draft: "", reveal: false, busy: null, notice: { tone: "ok", text: at("vc.keySaved") } };
  const status = result.code === "encryption-unavailable" && s.status ? { ...s.status, canEncrypt: false } : s.status;
  return { ...s, busy: null, status, notice: { tone: "error", text: at(SAVE_TEXT[result.code]) } };
}

function afterTest(s: CardState, result: VoiceChatTestResult): CardState {
  return { ...s, busy: null, notice: result.ok ? { tone: "ok", text: at("vc.accepted") } : { tone: "error", text: at(TEST_TEXT[result.code]) } };
}

function afterRemove(s: CardState, status: VoiceChatKeyStatus): CardState {
  return { ...s, busy: null, status, draft: "", reveal: false, notice: { tone: "info", text: at("vc.keyRemoved") } };
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
      return { ...s, notice: { tone: "error", text: at("vc.invalid") } };
    case "busy":
      return { ...s, busy: a.what, notice: a.what === "test" ? { tone: "info", text: at("vc.checking") } : null };
    case "saved":
      return s.busy === "save" ? afterSave(s, a.result) : s;
    case "tested":
      return s.busy === "test" ? afterTest(s, a.result) : s;
    case "removed":
      return s.busy === "remove" ? afterRemove(s, a.status) : s;
    case "failed":
      return { ...s, busy: null, notice: { tone: "error", text: at("vc.failed") } };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

/** The state of the key in words, for the row label. */
export function keyLine(s: CardState): string {
  if (!s.status) return at("vc.lineChecking");
  return s.status.hasKey ? at("vc.keySaved") : at("vc.lineNone");
}
