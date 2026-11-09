import type { ServerResponse } from "node:http";
import { VOICE_CHAT_MODEL, type VoiceChatError, type VoiceChatErrorCode, type VoiceChatStatus } from "@speakkit/protocol";
import { json } from "../http";
import type { Route } from "../router";

const STATUS: Record<VoiceChatErrorCode, number> = { "no-key": 409, "key-rejected": 424, "no-credit": 402, "rate-limited": 429, offline: 503, unavailable: 502 };
const MESSAGE: Record<VoiceChatErrorCode, string> = {
  "no-key": "no OpenAI API key is saved in Speak Kit",
  "key-rejected": "OpenAI did not accept the saved key",
  "no-credit": "the OpenAI account has no credit",
  "rate-limited": "too many requests",
  offline: "OpenAI could not be reached",
  unavailable: "voice chat is not available",
};

function fail(res: ServerResponse, code: VoiceChatErrorCode, status = STATUS[code]): void {
  const body: VoiceChatError = { code, error: { code, message: MESSAGE[code] } };
  json(res, status, body);
}

/** Voice chat: whether a key is saved, and short-lived Realtime client secrets minted with it. The key never leaves the app. */
export const voiceChatRoutes: Route[] = [
  {
    method: "GET",
    path: "/v1/voice-chat/status",
    handle: async ({ res }, { voiceChat }) => {
      const status: VoiceChatStatus = { hasKey: (await voiceChat?.hasKey().catch(() => false)) ?? false };
      json(res, 200, status);
    },
  },
  {
    method: "POST",
    path: "/v1/voice-chat/session",
    handle: async ({ req, res, signal }, { voiceChat, mintLimiter }) => {
      req.resume();
      if (!voiceChat) return fail(res, "unavailable", 503);
      const wait = mintLimiter.take();
      if (wait) {
        res.setHeader("Retry-After", String(wait));
        return fail(res, "rate-limited");
      }
      const r = await voiceChat.mint(signal).catch(() => ({ ok: false as const, code: "unavailable" as const }));
      if (signal.aborted) return; // the deadline answered 504 already
      if (!r.ok) return fail(res, r.code);
      const { clientSecret, expiresAt, voice } = r.session;
      json(res, 200, { clientSecret, expiresAt, model: VOICE_CHAT_MODEL, voice });
    },
  },
];
