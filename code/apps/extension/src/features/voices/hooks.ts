import { useEffect, useState } from "react";
import type { Voice, VoiceList } from "@speakkit/protocol";
import { send } from "../../shared/client";
import type { ConnResult } from "../../shared/internal";

export interface VoicesState {
  status: "loading" | "ready" | "error";
  voices: Voice[];
  default?: string;
}

let cache: VoiceList | undefined;

/** Voice list from the app through the service worker (GET /v1/voices). Cached for the life of the page. */
export function useVoices(enabled = true): VoicesState {
  const [state, setState] = useState<VoicesState>(() => (cache ? { status: "ready", voices: cache.voices, default: cache.default } : { status: "loading", voices: [] }));
  useEffect(() => {
    if (!enabled || cache) return;
    let live = true;
    send<ConnResult<VoiceList>>({ t: "get-voices" }).then((r) => {
      if (!live) return;
      if (r && r.ok) {
        cache = r.value;
        setState({ status: "ready", voices: r.value.voices, default: r.value.default });
      } else setState({ status: "error", voices: [] });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

/** Test helper: forget the cached list. */
export const resetVoicesCache = () => {
  cache = undefined;
};
