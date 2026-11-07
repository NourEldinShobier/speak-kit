import type { PlayerState, ReadDoc } from "@speakkit/protocol";
import type { PlayerConfig } from "./types";

/** What `Player.state()` reports, assembled from the player's fields. With no document loaded the document fields are absent. */
export function playerState(
  s: Pick<PlayerState, "status" | "sentenceIndex" | "elapsedMs" | "totalMs" | "queueLength"> & { doc: ReadDoc | undefined; error: PlayerState["error"]; cfg: PlayerConfig },
): PlayerState {
  const { doc, error, cfg, ...rest } = s;
  return {
    ...rest,
    speed: cfg.speed,
    voice: cfg.voice,
    ...(doc && { docId: doc.docId, tabId: doc.tabId, title: doc.title, url: doc.url }),
    sentenceCount: doc?.sentences.length ?? 0,
    ...(error && { error }),
  };
}
