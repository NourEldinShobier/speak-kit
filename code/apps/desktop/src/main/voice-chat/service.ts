import { VOICE_CHAT_MODEL, type VoiceChatVoice } from "@speakkit/protocol";
import type { VoiceChatService } from "@speakkit/server";
import type { Config } from "../../shared/schemas";
import { normalizeApiKey, type VoiceChatKeyStatus, type VoiceChatSaveResult, type VoiceChatTestResult } from "../../shared/voice-chat";
import type { Logger } from "../context";
import type { KeyStore } from "./key-store";
import { mintClientSecret, OPENAI_BASE_URL, testKey } from "./openai";

interface Deps {
  store: KeyStore;
  config: Config;
  saveConfig(): void;
  log: Logger;
  /** Tests point this at a fake OpenAI; the app uses OpenAI itself. */
  baseUrl?: string | undefined;
  fetch?: typeof fetch;
  /** One look at the screen for the model (screen vision); the local server offers it as POST /v1/voice-chat/look. */
  look?: VoiceChatService["look"];
}

/** The voice chat of the app: the saved key, its test, the voice, and the minting the local server calls. The key goes only to OpenAI. */
export function createVoiceChat(d: Deps) {
  const { store, config, log } = d;
  const net = () => ({ baseUrl: d.baseUrl ?? OPENAI_BASE_URL, fetch: d.fetch ?? fetch });

  const status = async (): Promise<VoiceChatKeyStatus> => ({ hasKey: await store.has(), canEncrypt: store.canEncrypt() });

  const server: VoiceChatService = {
    hasKey: () => store.has(),
    mint: async (signal) => {
      const key = await store.read();
      if (!key) return { ok: false, code: "no-key" };
      const voice = config.voiceChatVoice;
      const r = await mintClientSecret(key, { ...net(), signal, model: VOICE_CHAT_MODEL, voice });
      if (!r.ok) {
        log.warn("voice chat: client secret refused", r.code);
        return r;
      }
      return { ok: true, session: { ...r.value, model: VOICE_CHAT_MODEL, voice } };
    },
    ...(d.look && { look: d.look }),
  };

  return {
    server,
    status,
    async setKey(raw: string): Promise<VoiceChatSaveResult> {
      const key = normalizeApiKey(raw);
      if (!key) return { ok: false, code: "save-failed" };
      try {
        return (await store.save(key)) ? { ok: true } : { ok: false, code: "encryption-unavailable" };
      } catch (e) {
        log.error("voice chat: key could not be saved", (e as NodeJS.ErrnoException).code ?? "unknown");
        return { ok: false, code: "save-failed" };
      }
    },
    async removeKey(): Promise<VoiceChatKeyStatus> {
      await store.remove();
      return status();
    },
    async testKey(): Promise<VoiceChatTestResult> {
      const key = await store.read();
      if (!key) return { ok: false, code: "no-key" };
      const r = await testKey(key, net());
      return r.ok ? { ok: true } : r;
    },
    setVoice(voice: VoiceChatVoice): void {
      config.voiceChatVoice = voice;
      d.saveConfig();
    },
  };
}
export type VoiceChat = ReturnType<typeof createVoiceChat>;
