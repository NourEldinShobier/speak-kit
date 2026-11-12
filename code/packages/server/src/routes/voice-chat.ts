import type { ServerResponse } from "node:http";
import { VOICE_CHAT_MODEL, parseLookRequest, parseVoiceChatMic, type LookError, type LookErrorCode, type VoiceChatError, type VoiceChatErrorCode, type VoiceChatStatus } from "@speakkit/protocol";
import { HttpError, json, readBody } from "../http";
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

const LOOK_STATUS: Record<LookErrorCode, number> = { declined: 403, "no-window": 404, busy: 409, "rate-limited": 429, unsupported: 501, "capture-failed": 502, unavailable: 503, "no-capture": 404 };
const LOOK_MESSAGE: Record<LookErrorCode, string> = {
  declined: "the user did not allow looking at the screen",
  "no-window": "there is no window to look at",
  busy: "another look is in progress",
  "rate-limited": "too many looks",
  unsupported: "looking at the screen is not supported on this computer yet",
  "capture-failed": "the screen could not be captured",
  unavailable: "looking at the screen is not available",
  "no-capture": "there is no capture waiting to be read",
};

function failLook(res: ServerResponse, code: LookErrorCode): void {
  const body: LookError = { code, error: { code, message: LOOK_MESSAGE[code] } };
  json(res, LOOK_STATUS[code], body);
}

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
      let hasKey = false;
      try {
        hasKey = (await voiceChat?.hasKey()) ?? false;
      } catch {
        hasKey = false; // an unreadable key store counts as no key
      }
      const status: VoiceChatStatus = { hasKey };
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
  {
    method: "POST",
    path: "/v1/voice-chat/mic",
    handle: async ({ req, res }, { voiceChat }) => {
      const body = parseVoiceChatMic(await readBody(req, 256));
      if (!body) throw new HttpError(400, "invalid-request", "expected { held }");
      voiceChat?.mic?.(body.held);
      res.statusCode = 204;
      res.end();
    },
  },
  {
    method: "POST",
    path: "/v1/voice-chat/look",
    // The user may take a while to answer the consent card: no control deadline, the client giving up ends the look instead.
    stream: true,
    handle: async ({ req, res }, { voiceChat, lookLimiter }) => {
      const request = parseLookRequest(await readBody(req, 4096));
      if (!request) throw new HttpError(400, "invalid-request", "expected { session, scope }");
      if (!voiceChat?.look) return failLook(res, "unavailable");
      const wait = lookLimiter.take();
      if (wait) {
        res.setHeader("Retry-After", String(wait));
        return failLook(res, "rate-limited");
      }
      const ac = new AbortController();
      res.on("close", () => !res.writableFinished && ac.abort());
      const r = await voiceChat.look(request, ac.signal).catch(() => ({ ok: false as const, code: "capture-failed" as const }));
      if (ac.signal.aborted) return;
      if (!r.ok) return failLook(res, r.code);
      json(res, 200, r.look);
    },
  },
];
