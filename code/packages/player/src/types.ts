import type { Settings } from "@speakkit/protocol";

/** Everything the player needs to talk to the server. */
export interface PlayerConfig {
  port: number;
  token: string;
  voice: string;
  speed: number;
  pause: Settings["pauseBetweenParagraphs"];
}

export interface QueueItem {
  docId: string;
  tabId: number;
  title: string;
  url: string;
  sentenceCount: number;
  /** estimated reading time at the current speed */
  estMs: number;
}
