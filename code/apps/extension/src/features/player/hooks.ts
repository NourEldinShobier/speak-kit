import { useEffect, useState } from "react";
import type { PlayerState } from "@speakkit/protocol";
import { getState, onPlayerState } from "../../shared/client";

/** Current player state: one get-state on mount, then broadcasts. null until the worker answers. */
export function usePlayerState(): PlayerState | null {
  const [s, setS] = useState<PlayerState | null>(null);
  useEffect(() => {
    let live = true;
    const off = onPlayerState(setS);
    getState().then((x) => {
      if (live && x && typeof x === "object" && "status" in x) setS((cur) => cur ?? x);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}
