import type { VoiceChatErrorCode } from "@speakkit/protocol";

/** An OpenAI secret key: `sk-` and URL-safe characters only (so no whitespace). Bounds are wide; OpenAI decides what is valid. */
const API_KEY_SHAPE = /^sk-[A-Za-z0-9_-]{17,396}$/;

/** The trimmed key when it has the shape of an OpenAI secret key, else null. */
export const normalizeApiKey = (raw: string): string | null => {
  const key = raw.trim();
  return API_KEY_SHAPE.test(key) ? key : null;
};

/** What the renderer may know about the key: whether one is saved, never any part of it. */
export interface VoiceChatKeyStatus {
  hasKey: boolean;
  /** False when this computer cannot encrypt secrets; saving is then refused. */
  canEncrypt: boolean;
}

export type VoiceChatSaveResult = { ok: true } | { ok: false; code: "encryption-unavailable" | "save-failed" };
export type VoiceChatTestResult = { ok: true } | { ok: false; code: VoiceChatErrorCode };
