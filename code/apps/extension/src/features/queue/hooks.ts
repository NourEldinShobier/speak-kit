import { useEffect, useState } from "react";
import type { PlayerState } from "@speakkit/protocol";
import { getQueue, type QueueSnapshot } from "../../shared/client";

/** Queue + outline snapshot; refetched whenever the player state changes. */
export function useQueue(state: PlayerState | null): QueueSnapshot | null {
  const [q, setQ] = useState<QueueSnapshot | null>(null);
  const key = state ? `${state.queueLength}|${state.docId}|${state.status}|${state.sentenceIndex}` : "";
  useEffect(() => {
    let live = true;
    getQueue().then((x) => {
      if (live && x && Array.isArray(x.items)) setQ(x);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return q;
}

/** Index of the outline paragraph that contains `sentence`. */
export function currentParagraph(outline: { index: number }[], sentence: number): number {
  let cur = 0;
  outline.forEach((o, i) => {
    if (o.index <= sentence) cur = i;
  });
  return cur;
}

export function totalMinutes(q: QueueSnapshot): string {
  return `${Math.max(1, Math.round(q.items.reduce((a, i) => a + i.estMs, 0) / 60000))} min`;
}
