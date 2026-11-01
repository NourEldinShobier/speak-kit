import type { EngineState, PlayerState } from "@speakkit/protocol";
import type { PopupView } from "../../features/connection";
import type { VoicesState } from "../../features/voices";
import type { QueueItem } from "../../shared/client";

export interface PopupModel {
  view: PopupView;
  title: string;
  host: string;
  player: PlayerState | null;
  voice: string;
  speed: number;
  selection: string;
  /** characters of readable text on the page, for the time estimate */
  chars: number;
  next?: QueueItem;
  queued: number;
  engine?: EngineState;
  engineProgress?: number;
  voices: VoicesState;
  /** keyboard commands as Chrome has them assigned: name to shortcut */
  shortcuts: Record<string, string | undefined>;
  /** state of the "Open SpeakKit" deep link */
  launch: "idle" | "starting" | "failed";
}

export interface PopupActions {
  listenPage(): void;
  listenSelection(): void;
  readerView(): void;
  toggle(): void;
  stop(): void;
  replay(): void;
  seekMs(d: number): void;
  seekTo(ms: number): void;
  block(d: 1 | -1): void;
  setVoice(id: string): void;
  setSpeed(v: number): void;
  preview(id: string): void;
  playNext(): void;
  openApp(): void;
  download(): void;
  recheck(): void;
  pasteToken(): void;
  options(): void;
  extSettings(): void;
  help(): void;
  learn(): void;
}
