import { useEffect, useState } from "react";
import type { Voice, VoiceList } from "@speakkit/protocol";
import { send } from "../../shared/client";
import type { ConnResult } from "../../shared/internal";

export interface VoicesState {
  status: "loading" | "ready" | "error";
  voices: Voice[];
  default?: string;
}

/** The list changes when the engine is switched or a voice is cloned, so a cached copy is only trusted for a short while. */
export const VOICES_TTL_MS = 10_000;
export const isFresh = (c: { at: number } | undefined, now: number): boolean => !!c && now - c.at < VOICES_TTL_MS;

let cache: { list: VoiceList; at: number } | undefined;

/** Voice list from the app through the service worker (GET /v1/voices). Shown from the cache while a stale copy is refetched. */
export function useVoices(enabled = true): VoicesState {
  const [state, setState] = useState<VoicesState>(() => (cache ? { status: "ready", voices: cache.list.voices, default: cache.list.default } : { status: "loading", voices: [] }));
  useEffect(() => {
    if (!enabled || isFresh(cache, Date.now())) return;
    let live = true;
    send<ConnResult<VoiceList>>({ t: "get-voices" }).then((r) => {
      if (!live) return;
      if (r && r.ok) {
        cache = { list: r.value, at: Date.now() };
        setState({ status: "ready", voices: r.value.voices, default: r.value.default });
      } else setState({ status: "error", voices: [] });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}
